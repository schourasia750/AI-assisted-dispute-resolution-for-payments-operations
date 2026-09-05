import { cn } from "@/lib/utils";
import { toneClass } from "@/lib/ui";
import type { Tone } from "@/lib/types";

export function Chip({
  tone = "quiet",
  className,
  children,
}: {
  tone?: Tone;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap",
        toneClass(tone),
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Dot({ tone = "quiet" }: { tone?: Tone }) {
  return (
    <span
      className={cn("size-1.5 shrink-0 rounded-full", toneClass(tone))}
      style={{ background: "currentColor" }}
    />
  );
}

export function ConfidenceMeter({ value, threshold }: { value: number; threshold: number }) {
  const pct = Math.round(value * 100);
  const tone: Tone = value >= threshold ? "approve" : "escalate";
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between">
        <span className="eyebrow">Model confidence</span>
        <span className="font-display text-sm font-semibold">{pct}%</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn("h-full rounded-full transition-all", toneClass(tone))}
          style={{ width: `${Math.max(3, pct)}%`, background: "currentColor" }}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        Human review threshold {Math.round(threshold * 100)}%
      </p>
    </div>
  );
}
