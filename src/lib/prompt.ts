import type { ConfigBundle, DisputeCase, Policy, Settings, Verdict } from "./types";

/** Replaces {{token}} placeholders in a prompt template with settings values. */
export function renderTemplate(template: string, settings: Settings): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (match, key: string) => {
    const value = (settings as unknown as Record<string, unknown>)[key];
    return value === undefined || value === null ? match : String(value);
  });
}

export function formatMoney(amount: number, settings: Settings): string {
  return `${settings.currencySymbol}${amount.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })} ${settings.currency}`;
}

export function relevantPolicies(policies: Policy[], category: string): Policy[] {
  return policies.filter((p) => p.category === category || p.severity === "blocking");
}

export function renderPolicyBook(policies: Policy[]): string {
  return policies
    .map((p, i) => `${i + 1}. [${p.id}] ${p.title} (${p.severity})\n   ${p.rule}`)
    .join("\n");
}

export function renderVerdictOptions(verdicts: Verdict[]): string {
  return verdicts.map((v) => `- ${v.id} — ${v.label}: ${v.description}`).join("\n");
}

/** A plain-text brief of one case, used as grounding for both AI surfaces. */
export function renderCaseBrief(
  dispute: DisputeCase,
  config: Pick<ConfigBundle, "settings" | "categories" | "agents">,
): string {
  const { settings, categories, agents } = config;
  const category = categories.find((c) => c.id === dispute.category);
  const agent = agents.find((a) => a.id === dispute.assignedTo);
  const c = dispute.customer;

  return [
    `CASE ${dispute.id} — ${dispute.title}`,
    `Category: ${category ? category.label : dispute.category}`,
    `Status: ${dispute.status} | Priority: ${dispute.priority} | Channel: ${dispute.channel}`,
    `Disputed amount: ${formatMoney(dispute.amount, settings)} | Order: ${dispute.orderId}`,
    `Submitted: ${dispute.submittedAt} | Assigned to: ${agent ? `${agent.name} (${agent.role})` : dispute.assignedTo}`,
    "",
    "CUSTOMER",
    `${c.name} <${c.email}> | tier: ${c.tier} | account age: ${c.accountAgeMonths} months`,
    `Lifetime value: ${formatMoney(c.lifetimeValue, settings)} | Prior disputes: ${c.priorDisputes}`,
    "",
    "SUMMARY",
    dispute.summary,
    "",
    "EVIDENCE ON FILE",
    dispute.evidence.length
      ? dispute.evidence
          .map((e) => `- [${e.id}] ${e.label} (${e.type}, from ${e.submittedBy}): ${e.detail}`)
          .join("\n")
      : "- None supplied.",
    "",
    "CASE TIMELINE",
    dispute.timeline.map((t) => `- ${t.at} — ${t.actor}: ${t.note}`).join("\n"),
  ].join("\n");
}

export function buildDecisionPrompt(
  dispute: DisputeCase,
  config: Pick<ConfigBundle, "settings" | "categories" | "agents" | "policies" | "verdicts">,
): { system: string; prompt: string } {
  const policies = relevantPolicies(config.policies, dispute.category);

  const system = renderTemplate(config.settings.decisionSystemPrompt, config.settings);

  const prompt = [
    renderCaseBrief(dispute, config),
    "",
    "APPLICABLE POLICIES",
    renderPolicyBook(policies),
    "",
    "ALLOWED VERDICTS (choose exactly one id)",
    renderVerdictOptions(config.verdicts),
    "",
    "Return the decision now. Keep the rationale under 120 words, list at most 4 suggested actions, and keep the customer message under 130 words.",
  ].join("\n");

  return { system, prompt };
}

export function buildChatSystemPrompt(
  dispute: DisputeCase,
  config: Pick<ConfigBundle, "settings" | "categories" | "agents" | "policies">,
): string {
  const policies = relevantPolicies(config.policies, dispute.category);

  return [
    renderTemplate(config.settings.chatSystemPrompt, config.settings),
    "",
    "=== CASE RECORD ===",
    renderCaseBrief(dispute, config),
    "",
    "=== APPLICABLE POLICIES ===",
    renderPolicyBook(policies),
  ].join("\n");
}
