import type { CaseStatus, Priority, Tone } from "./types";

/** The single mapping from semantic state to design-system tone utilities. */
export function toneClass(tone: Tone): string {
  switch (tone) {
    case "approve":
      return "tone-approve";
    case "reject":
      return "tone-reject";
    case "escalate":
      return "tone-escalate";
    case "neutral":
      return "tone-neutral";
    default:
      return "tone-quiet";
  }
}

export const STATUS_LABELS: Record<CaseStatus, string> = {
  open: "Open",
  waiting: "Waiting on customer",
  resolved: "Resolved",
  escalated: "Escalated",
};

export function statusTone(status: string): Tone {
  switch (status) {
    case "resolved":
      return "approve";
    case "escalated":
      return "reject";
    case "waiting":
      return "escalate";
    default:
      return "neutral";
  }
}

export function priorityTone(priority: string): Tone {
  switch (priority) {
    case "critical":
      return "reject";
    case "high":
      return "escalate";
    case "medium":
      return "neutral";
    default:
      return "quiet";
  }
}

export const PRIORITY_ORDER: Priority[] = ["critical", "high", "medium", "low"];

export function priorityRank(priority: string): number {
  const index = PRIORITY_ORDER.indexOf(priority as Priority);
  return index === -1 ? PRIORITY_ORDER.length : index;
}

export function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  });
}

export function relativeAge(iso: string, now: number): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "--";
  const hours = Math.max(0, Math.round((now - then) / 3_600_000));
  if (hours < 1) return "just now";
  if (hours < 24) return `${hours}h old`;
  return `${Math.round(hours / 24)}d old`;
}
