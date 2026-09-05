import { createServerFn } from "@tanstack/react-start";
import { NoObjectGeneratedError, Output, streamText } from "ai";
import { z } from "zod";

import {
  createOpenAIProvider,
  describeOpenAIError,
  getOpenAIKey,
  MISSING_KEY_MESSAGE,
} from "./openai.server";
import { resolveModel } from "./models";
import { buildDecisionPrompt } from "./prompt";
import type { Decision } from "./types";

const EvidenceSchema = z.object({
  id: z.string(),
  type: z.string(),
  label: z.string(),
  detail: z.string(),
  submittedBy: z.string(),
});

const CaseSchema = z.object({
  id: z.string(),
  title: z.string(),
  category: z.string(),
  status: z.string(),
  priority: z.string(),
  amount: z.number(),
  orderId: z.string(),
  submittedAt: z.string(),
  assignedTo: z.string(),
  channel: z.string(),
  customer: z.object({
    name: z.string(),
    email: z.string(),
    tier: z.string(),
    lifetimeValue: z.number(),
    priorDisputes: z.number(),
    accountAgeMonths: z.number(),
  }),
  summary: z.string(),
  evidence: z.array(EvidenceSchema),
  timeline: z.array(z.object({ at: z.string(), actor: z.string(), note: z.string() })),
});

const DecideInput = z.object({
  dispute: CaseSchema,
  settings: z.object({
    appName: z.string(),
    tagline: z.string(),
    organization: z.string(),
    currency: z.string(),
    currencySymbol: z.string(),
    assistantName: z.string(),
    model: z.string(),
    autoApproveMaxAmount: z.number(),
    confidenceThreshold: z.number(),
    escalationSlaHours: z.number(),
    highValueThreshold: z.number(),
    repeatDisputeLimit: z.number(),
    decisionSystemPrompt: z.string(),
    chatSystemPrompt: z.string(),
  }),
  categories: z.array(
    z.object({
      id: z.string(),
      label: z.string(),
      defaultPriority: z.string(),
      description: z.string(),
    }),
  ),
  agents: z.array(
    z.object({ id: z.string(), name: z.string(), role: z.string(), initials: z.string() }),
  ),
  policies: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      category: z.string(),
      severity: z.string(),
      rule: z.string(),
    }),
  ),
  verdicts: z.array(
    z.object({ id: z.string(), label: z.string(), tone: z.string(), description: z.string() }),
  ),
  extraInstruction: z.string().optional(),
});

// Deliberately constraint-free: no .min()/.max()/enum bounds. Limits live in the
// prompt and are clamped in code below.
const DecisionSchema = z.object({
  verdictId: z.string(),
  confidence: z.number(),
  rationale: z.string(),
  citedPolicyIds: z.array(z.string()),
  keyEvidence: z.array(z.string()),
  riskFlags: z.array(z.string()),
  suggestedActions: z.array(z.string()),
  customerMessage: z.string(),
});

type RawDecision = z.infer<typeof DecisionSchema>;

export const decideCase = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => DecideInput.parse(input))
  .handler(async ({ data }): Promise<Decision> => {
    const apiKey = getOpenAIKey();
    if (!apiKey) {
      throw new Error(MISSING_KEY_MESSAGE);
    }

    const config = {
      settings: data.settings,
      categories: data.categories,
      agents: data.agents,
      policies: data.policies,
      verdicts: data.verdicts,
    } as Parameters<typeof buildDecisionPrompt>[1];

    const { system, prompt } = buildDecisionPrompt(
      data.dispute as Parameters<typeof buildDecisionPrompt>[0],
      config,
    );

    const model = resolveModel(data.settings.model);
    const openai = createOpenAIProvider(apiKey, "resolveflow-decision");

    let raw: RawDecision;
    try {
      // Streamed on the wire even though only the final object is used: a
      // buffered reasoning call can outlive the request timeout.
      const result = streamText({
        model: openai(model),
        system,
        prompt: data.extraInstruction
          ? `${prompt}\n\nADDITIONAL AGENT INSTRUCTION\n${data.extraInstruction}`
          : prompt,
        output: Output.object({ schema: DecisionSchema }),
      });
      raw = (await result.output) as RawDecision;
    } catch (error) {
      if (NoObjectGeneratedError.isInstance(error)) {
        const salvaged = salvage(error.text);
        if (salvaged) {
          raw = salvaged;
        } else {
          throw new Error("The AI returned an unreadable decision. Try running the review again.");
        }
      } else {
        const described = describeOpenAIError(error);
        console.error("[decideCase]", described.status, described.message);
        throw new Error(described.message);
      }
    }

    const verdictIds = data.verdicts.map((v) => v.id);
    const escalationId =
      verdictIds.find((id) => id.includes("escalate")) ??
      verdictIds[verdictIds.length - 1] ??
      "escalate";

    const confidence = clamp(Number(raw.confidence) || 0, 0, 1);
    const verdictId = verdictIds.includes(raw.verdictId) ? raw.verdictId : escalationId;
    const needsHumanReview =
      confidence < data.settings.confidenceThreshold || verdictId === escalationId;

    return {
      verdictId,
      confidence,
      rationale: raw.rationale?.trim() || "No rationale returned.",
      citedPolicyIds: uniq(raw.citedPolicyIds).filter((id) =>
        data.policies.some((p) => p.id === id),
      ),
      keyEvidence: uniq(raw.keyEvidence).slice(0, 6),
      riskFlags: uniq(raw.riskFlags).slice(0, 6),
      suggestedActions: uniq(raw.suggestedActions).slice(0, 4),
      customerMessage: raw.customerMessage?.trim() ?? "",
      needsHumanReview,
      model,
      decidedAt: new Date().toISOString(),
    };
  });

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function uniq(values: string[] | undefined): string[] {
  if (!Array.isArray(values)) return [];
  return Array.from(new Set(values.map((v) => String(v).trim()).filter(Boolean)));
}

function salvage(text: string | undefined): RawDecision | undefined {
  if (!text) return undefined;
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) return undefined;
  try {
    const parsed = JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
    return {
      verdictId: String(parsed["verdictId"] ?? ""),
      confidence: Number(parsed["confidence"] ?? 0),
      rationale: String(parsed["rationale"] ?? ""),
      citedPolicyIds: toStringArray(parsed["citedPolicyIds"]),
      keyEvidence: toStringArray(parsed["keyEvidence"]),
      riskFlags: toStringArray(parsed["riskFlags"]),
      suggestedActions: toStringArray(parsed["suggestedActions"]),
      customerMessage: String(parsed["customerMessage"] ?? ""),
    };
  } catch {
    return undefined;
  }
}

function toStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map((v) => String(v)) : [];
}
