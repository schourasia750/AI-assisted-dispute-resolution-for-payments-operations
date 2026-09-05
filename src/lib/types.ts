export type Priority = "low" | "medium" | "high" | "critical";
export type CaseStatus = "open" | "waiting" | "resolved" | "escalated";
export type Tone = "approve" | "reject" | "escalate" | "neutral" | "quiet";

export type Settings = {
  appName: string;
  tagline: string;
  organization: string;
  currency: string;
  currencySymbol: string;
  assistantName: string;
  model: string;
  autoApproveMaxAmount: number;
  confidenceThreshold: number;
  escalationSlaHours: number;
  highValueThreshold: number;
  repeatDisputeLimit: number;
  decisionSystemPrompt: string;
  chatSystemPrompt: string;
};

export type Verdict = {
  id: string;
  label: string;
  tone: Tone;
  description: string;
};

export type Category = {
  id: string;
  label: string;
  defaultPriority: Priority;
  description: string;
};

export type Policy = {
  id: string;
  title: string;
  category: string;
  severity: "standard" | "blocking";
  rule: string;
};

export type Agent = {
  id: string;
  name: string;
  role: string;
  initials: string;
};

export type Evidence = {
  id: string;
  type: string;
  label: string;
  detail: string;
  submittedBy: string;
};

export type TimelineEntry = {
  at: string;
  actor: string;
  note: string;
};

export type DisputeCase = {
  id: string;
  title: string;
  category: string;
  status: CaseStatus;
  priority: Priority;
  amount: number;
  orderId: string;
  submittedAt: string;
  assignedTo: string;
  channel: string;
  customer: {
    name: string;
    email: string;
    tier: string;
    lifetimeValue: number;
    priorDisputes: number;
    accountAgeMonths: number;
  };
  summary: string;
  evidence: Evidence[];
  timeline: TimelineEntry[];
};

export type Decision = {
  verdictId: string;
  confidence: number;
  rationale: string;
  citedPolicyIds: string[];
  keyEvidence: string[];
  riskFlags: string[];
  suggestedActions: string[];
  customerMessage: string;
  needsHumanReview: boolean;
  model: string;
  decidedAt: string;
};

export type ConfigBundle = {
  settings: Settings;
  verdicts: Verdict[];
  categories: Category[];
  policies: Policy[];
  agents: Agent[];
  cases: DisputeCase[];
};

export type ConfigKey = keyof ConfigBundle;
