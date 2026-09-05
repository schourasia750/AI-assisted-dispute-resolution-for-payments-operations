import { useServerFn } from "@tanstack/react-start";
import { Loader2, OctagonX, Sparkles } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useConfig } from "@/lib/config";
import { decideCase } from "@/lib/decision.functions";
import type { Decision, DisputeCase } from "@/lib/types";

const BATCH_OPTIONS = ["10", "50", "all"] as const;
const CONCURRENCY = 4;

/**
 * Central "run the AI over the queue" control. Reviews N cases from the list it
 * is given, four at a time, and stores each verdict as it lands.
 */
export function BatchReview({ cases }: { cases: DisputeCase[] }) {
  const { config, decisions, saveDecision } = useConfig();
  const decide = useServerFn(decideCase);
  const [size, setSize] = useState<string>("10");
  const [skipReviewed, setSkipReviewed] = useState(true);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0, failed: 0 });
  const cancelled = useRef(false);

  const pending = skipReviewed ? cases.filter((c) => !decisions[c.id]) : cases;
  const limit = size === "all" ? pending.length : Number(size);
  const target = pending.slice(0, limit);

  async function run() {
    if (target.length === 0) {
      toast.info("Nothing to review", {
        description: skipReviewed
          ? "Every case in this view already has an AI verdict."
          : "No cases match the current filters.",
      });
      return;
    }

    cancelled.current = false;
    setRunning(true);
    setProgress({ done: 0, total: target.length, failed: 0 });

    const queue = [...target];
    let failed = 0;

    async function worker() {
      while (!cancelled.current) {
        const dispute = queue.shift();
        if (!dispute) return;
        try {
          const result = (await decide({
            data: {
              dispute,
              settings: config.settings,
              categories: config.categories,
              agents: config.agents,
              policies: config.policies,
              verdicts: config.verdicts,
            },
          })) as Decision;
          saveDecision(dispute.id, result);
        } catch {
          failed += 1;
        }
        setProgress((p) => ({ ...p, done: p.done + 1, failed }));
      }
    }

    await Promise.all(
      Array.from({ length: Math.min(CONCURRENCY, target.length) }, () => worker()),
    );

    setRunning(false);
    const reviewed = target.length - queue.length - failed;
    if (cancelled.current) {
      toast.info("Batch review stopped", { description: `${reviewed} case(s) reviewed.` });
    } else if (failed > 0) {
      toast.warning("Batch review finished with errors", {
        description: `${reviewed} reviewed, ${failed} failed. Check the OpenAI key and rate limits.`,
      });
    } else {
      toast.success("Batch review complete", { description: `${reviewed} case(s) reviewed.` });
    }
  }

  const pct = progress.total ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <div className="panel p-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Bulk AI review</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Runs the decision engine over the filtered queue, {CONCURRENCY} cases at a time, and
            stores every verdict.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant={skipReviewed ? "secondary" : "ghost"}
            size="sm"
            className="h-9 rounded-full px-3 text-xs"
            onClick={() => setSkipReviewed((v) => !v)}
            disabled={running}
          >
            {skipReviewed ? "Skipping reviewed" : "Re-reviewing all"}
          </Button>
          <Select value={size} onValueChange={setSize} disabled={running}>
            <SelectTrigger className="h-9 w-[150px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {BATCH_OPTIONS.map((option) => (
                <SelectItem key={option} value={option}>
                  {option === "all" ? `All (${pending.length})` : `${option} cases`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {running ? (
            <Button
              variant="outline"
              onClick={() => {
                cancelled.current = true;
              }}
            >
              <OctagonX className="size-4" /> Stop
            </Button>
          ) : (
            <Button onClick={run}>
              <Sparkles className="size-4" /> Run AI check ({target.length})
            </Button>
          )}
        </div>
      </div>

      {progress.total > 0 ? (
        <div className="mt-4">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-2">
              {running ? <Loader2 className="size-3 animate-spin" /> : null}
              {progress.done} / {progress.total} reviewed
              {progress.failed > 0 ? ` · ${progress.failed} failed` : ""}
            </span>
            <span>{pct}%</span>
          </div>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
