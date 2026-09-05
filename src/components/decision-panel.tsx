import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertTriangle,
  Check,
  Copy,
  Gavel,
  Loader2,
  RefreshCw,
  ShieldAlert,
  Sparkles,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Chip, ConfidenceMeter } from "@/components/chips";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useConfig } from "@/lib/config";
import { decideCase } from "@/lib/decision.functions";
import { MODEL_LABELS } from "@/lib/models";
import type { Decision, DisputeCase, Tone } from "@/lib/types";
import { formatDate } from "@/lib/ui";

export function DecisionPanel({ dispute }: { dispute: DisputeCase }) {
  const { config, decisions, saveDecision, clearDecision, updateCase } = useConfig();
  const decide = useServerFn(decideCase);
  const [instruction, setInstruction] = useState("");
  const decision = decisions[dispute.id];

  const mutation = useMutation({
    mutationFn: (extraInstruction?: string) =>
      decide({
        data: {
          dispute,
          settings: config.settings,
          categories: config.categories,
          agents: config.agents,
          policies: config.policies,
          verdicts: config.verdicts,
          ...(extraInstruction ? { extraInstruction } : {}),
        },
      }) as Promise<Decision>,
    onSuccess: (result) => {
      saveDecision(dispute.id, result);
      toast.success("AI review complete", {
        description: `${config.verdicts.find((v) => v.id === result.verdictId)?.label ?? result.verdictId} · ${Math.round(result.confidence * 100)}% confidence`,
      });
    },
    onError: (error: Error) => {
      toast.error("AI review failed", { description: error.message });
    },
  });

  const verdict = decision ? config.verdicts.find((v) => v.id === decision.verdictId) : undefined;
  const tone: Tone = verdict?.tone ?? "quiet";

  function applyDecision() {
    if (!decision) return;
    const status = decision.needsHumanReview ? "escalated" : "resolved";
    updateCase(dispute.id, {
      status,
      timeline: [
        ...dispute.timeline,
        {
          at: new Date().toISOString(),
          actor: `${config.settings.assistantName} (AI) · accepted by agent`,
          note: `${verdict?.label ?? decision.verdictId} — ${Math.round(decision.confidence * 100)}% confidence.`,
        },
      ],
    });
    toast.success(status === "resolved" ? "Case resolved" : "Case escalated for human review");
  }

  function overrideVerdict(verdictId: string) {
    if (!decision) return;
    const nextVerdict = config.verdicts.find((v) => v.id === verdictId);
    saveDecision(dispute.id, { ...decision, verdictId, needsHumanReview: false });
    toast.success(`Verdict overridden to ${nextVerdict?.label ?? verdictId}`);
  }

  return (
    <section className="panel p-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="eyebrow flex items-center gap-1.5">
            <Sparkles className="size-3" /> AI decision engine
          </p>
          <h2 className="mt-1 text-lg font-semibold">Resolution verdict</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {MODEL_LABELS[config.settings.model] ?? config.settings.model} · policies and thresholds
            from your JSON configuration
          </p>
        </div>
        <Button
          onClick={() => mutation.mutate(instruction.trim() || undefined)}
          disabled={mutation.isPending}
        >
          {mutation.isPending ? (
            <>
              <Loader2 className="size-4 animate-spin" /> Reviewing…
            </>
          ) : decision ? (
            <>
              <RefreshCw className="size-4" /> Re-run review
            </>
          ) : (
            <>
              <Gavel className="size-4" /> Run AI review
            </>
          )}
        </Button>
      </header>

      <div className="mt-4">
        <Textarea
          value={instruction}
          onChange={(event) => setInstruction(event.target.value)}
          placeholder="Optional steer for this run — e.g. 'the customer has now supplied a police report'"
          rows={2}
          className="resize-none text-sm"
        />
      </div>

      {!decision && !mutation.isPending ? (
        <p className="panel-inset mt-4 p-4 text-sm text-muted-foreground">
          No verdict yet. The model reads this case, its evidence and every policy that matches
          category <span className="text-foreground">{dispute.category}</span> (plus all blocking
          rules), then returns one verdict from <code className="text-xs">verdicts.json</code>.
        </p>
      ) : null}

      {mutation.isPending ? (
        <div className="panel-inset mt-4 flex items-center gap-3 p-4 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin text-primary" />
          Weighing {dispute.evidence.length} pieces of evidence against the policy book…
        </div>
      ) : null}

      {decision && !mutation.isPending ? (
        <div className="mt-5 space-y-5">
          <div className="flex flex-wrap items-center gap-3">
            <Chip tone={tone} className="px-3 py-1 text-sm">
              <Gavel className="size-3.5" />
              {verdict?.label ?? decision.verdictId}
            </Chip>
            {decision.needsHumanReview ? (
              <Chip tone="escalate">
                <ShieldAlert className="size-3" /> Human review required
              </Chip>
            ) : (
              <Chip tone="approve">
                <Check className="size-3" /> Clear to action
              </Chip>
            )}
            <span className="text-xs text-muted-foreground">
              Decided {formatDate(decision.decidedAt)} UTC
            </span>
          </div>

          <ConfidenceMeter
            value={decision.confidence}
            threshold={config.settings.confidenceThreshold}
          />

          <div>
            <p className="eyebrow">Rationale</p>
            <p className="mt-1.5 text-sm leading-relaxed">{decision.rationale}</p>
          </div>

          {decision.citedPolicyIds.length ? (
            <div>
              <p className="eyebrow">Policies applied</p>
              <ul className="mt-2 space-y-2">
                {decision.citedPolicyIds.map((id) => {
                  const policy = config.policies.find((p) => p.id === id);
                  return (
                    <li key={id} className="panel-inset p-3 text-sm">
                      <div className="flex items-center gap-2">
                        <code className="font-mono text-xs text-primary">{id}</code>
                        <span className="font-medium">{policy?.title ?? "Unknown policy"}</span>
                        {policy?.severity === "blocking" ? (
                          <Chip tone="reject">blocking</Chip>
                        ) : null}
                      </div>
                      {policy ? (
                        <p className="mt-1 text-xs text-muted-foreground">{policy.rule}</p>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}

          {decision.keyEvidence.length ? (
            <div>
              <p className="eyebrow">Evidence the model leaned on</p>
              <ul className="mt-2 space-y-1.5 text-sm">
                {decision.keyEvidence.map((item) => (
                  <li key={item} className="flex gap-2">
                    <Check className="mt-0.5 size-3.5 shrink-0 text-primary" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {decision.riskFlags.length ? (
            <div>
              <p className="eyebrow">Risk flags</p>
              <ul className="mt-2 space-y-1.5 text-sm">
                {decision.riskFlags.map((item) => (
                  <li key={item} className="flex gap-2">
                    <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warning" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {decision.suggestedActions.length ? (
            <div>
              <p className="eyebrow">Next actions</p>
              <ol className="mt-2 space-y-1.5 text-sm">
                {decision.suggestedActions.map((item, index) => (
                  <li key={item} className="flex gap-2">
                    <span className="font-display text-xs text-muted-foreground">{index + 1}.</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ol>
            </div>
          ) : null}

          {decision.customerMessage ? (
            <div>
              <div className="flex items-center justify-between">
                <p className="eyebrow">Draft reply to customer</p>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    void navigator.clipboard.writeText(decision.customerMessage);
                    toast.success("Draft copied to clipboard");
                  }}
                >
                  <Copy className="size-3.5" /> Copy
                </Button>
              </div>
              <p className="panel-inset mt-1.5 p-3 text-sm leading-relaxed whitespace-pre-wrap">
                {decision.customerMessage}
              </p>
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
            <Button onClick={applyDecision}>
              <Check className="size-4" />
              {decision.needsHumanReview ? "Escalate case" : "Accept & resolve"}
            </Button>
            <Select value={decision.verdictId} onValueChange={overrideVerdict}>
              <SelectTrigger className="w-[220px]">
                <SelectValue placeholder="Override verdict" />
              </SelectTrigger>
              <SelectContent>
                {config.verdicts.map((option) => (
                  <SelectItem key={option.id} value={option.id}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="ghost" onClick={() => clearDecision(dispute.id)}>
              Discard
            </Button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
