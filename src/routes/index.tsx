import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowUpRight, Gavel, Inbox, ShieldAlert, Timer } from "lucide-react";
import { useMemo, useState } from "react";

import { BatchReview } from "@/components/batch-review";
import { Chip } from "@/components/chips";
import { Button } from "@/components/ui/button";
import { useConfig } from "@/lib/config";
import { formatMoney } from "@/lib/prompt";
import type { DisputeCase } from "@/lib/types";
import { priorityRank, priorityTone, relativeAge, statusTone, STATUS_LABELS } from "@/lib/ui";
import { cn } from "@/lib/utils";


export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "ResolveFlow — AI dispute resolution queue" },
      {
        name: "description",
        content:
          "Triage customer disputes with an AI decision engine that applies your own policy book, thresholds and verdicts — all editable as JSON.",
      },
      { property: "og:title", content: "ResolveFlow — AI dispute resolution queue" },
      {
        property: "og:description",
        content:
          "An AI-assisted resolution desk: policy-grounded verdicts, confidence thresholds and a case assistant.",
      },
    ],
  }),
  component: QueuePage,
});

function QueuePage() {
  const { config, decisions, hydrated } = useConfig();
  const [category, setCategory] = useState("all");
  const [status, setStatus] = useState("all");
  const [visible, setVisible] = useState(25);
  const now = useMemo(() => Date.now(), []);


  const cases = useMemo(() => {
    return [...config.cases]
      .filter((c) => (category === "all" ? true : c.category === category))
      .filter((c) => (status === "all" ? true : c.status === status))
      .sort((a, b) => {
        if (a.status === "resolved" && b.status !== "resolved") return 1;
        if (b.status === "resolved" && a.status !== "resolved") return -1;
        const byPriority = priorityRank(a.priority) - priorityRank(b.priority);
        if (byPriority !== 0) return byPriority;
        return a.submittedAt.localeCompare(b.submittedAt);
      });
  }, [config.cases, category, status]);

  const stats = useMemo(() => {
    const openCases = config.cases.filter((c) => c.status !== "resolved");
    const reviewed = config.cases.filter((c) => decisions[c.id]);
    const flagged = reviewed.filter((c) => decisions[c.id]?.needsHumanReview);
    const exposure = openCases.reduce((sum, c) => sum + c.amount, 0);
    return {
      open: openCases.length,
      reviewed: reviewed.length,
      flagged: flagged.length,
      exposure,
    };
  }, [config.cases, decisions]);

  return (
    <main className="mx-auto max-w-7xl px-6 py-10">
      <section>
        <p className="eyebrow">{config.settings.organization} · resolution desk</p>
        <h1 className="mt-2 text-3xl font-semibold sm:text-4xl">{config.settings.tagline}</h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Every case, policy, verdict and threshold below is loaded from editable JSON. Open a case
          to have the model weigh the evidence against your rule book, then talk it through with the
          case assistant.
        </p>
      </section>

      <section className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={<Inbox className="size-4" />}
          label="Cases in queue"
          value={String(stats.open)}
          hint={`${config.cases.length} total on file`}
        />
        <StatCard
          icon={<Gavel className="size-4" />}
          label="AI-reviewed"
          value={String(stats.reviewed)}
          hint={hydrated ? "Verdicts stored locally" : "Loading…"}
        />
        <StatCard
          icon={<ShieldAlert className="size-4" />}
          label="Needs a human"
          value={String(stats.flagged)}
          hint={`Below ${Math.round(config.settings.confidenceThreshold * 100)}% confidence`}
          tone={stats.flagged > 0 ? "escalate" : "quiet"}
        />
        <StatCard
          icon={<Timer className="size-4" />}
          label="Open exposure"
          value={formatMoney(stats.exposure, config.settings)}
          hint={`SLA ${config.settings.escalationSlaHours}h`}
        />
      </section>

      <section className="mt-10">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h2 className="text-lg font-semibold">Dispute queue</h2>
          <div className="flex flex-wrap gap-2">
            <FilterGroup
              value={status}
              onChange={setStatus}
              options={[
                { id: "all", label: "All statuses" },
                ...Object.entries(STATUS_LABELS).map(([id, label]) => ({ id, label })),
              ]}
            />
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <FilterGroup
            value={category}
            onChange={setCategory}
            options={[
              { id: "all", label: "All categories" },
              ...config.categories.map((c) => ({ id: c.id, label: c.label })),
            ]}
          />
        </div>

        <div className="mt-5">
          <BatchReview cases={cases} />
        </div>

        <div className="mt-5 space-y-3">
          {cases.slice(0, visible).map((dispute) => (
            <CaseRow key={dispute.id} dispute={dispute} now={now} />
          ))}
          {cases.length === 0 ? (
            <p className="panel-inset p-8 text-center text-sm text-muted-foreground">
              No cases match this filter.
            </p>
          ) : null}
          {cases.length > visible ? (
            <div className="pt-2 text-center">
              <Button variant="outline" onClick={() => setVisible((v) => v + 25)}>
                Show 25 more · {cases.length - visible} remaining
              </Button>
            </div>
          ) : null}
        </div>

      </section>
    </main>
  );
}

function StatCard({
  icon,
  label,
  value,
  hint,
  tone = "quiet",
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint: string;
  tone?: "quiet" | "escalate";
}) {
  return (
    <div className="panel p-5">
      <div className="flex items-center justify-between">
        <p className="eyebrow">{label}</p>
        <span
          className={cn(
            "grid size-7 place-items-center rounded-lg",
            tone === "escalate" ? "tone-escalate" : "tone-quiet",
          )}
        >
          {icon}
        </span>
      </div>
      <p className="metric mt-3">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

function FilterGroup({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (next: string) => void;
  options: { id: string; label: string }[];
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((option) => (
        <Button
          key={option.id}
          size="sm"
          variant={value === option.id ? "secondary" : "ghost"}
          onClick={() => onChange(option.id)}
          className="h-7 rounded-full px-3 text-xs"
        >
          {option.label}
        </Button>
      ))}
    </div>
  );
}

function CaseRow({ dispute, now }: { dispute: DisputeCase; now: number }) {
  const { config, decisions } = useConfig();
  const category = config.categories.find((c) => c.id === dispute.category);
  const agent = config.agents.find((a) => a.id === dispute.assignedTo);
  const decision = decisions[dispute.id];
  const verdict = decision ? config.verdicts.find((v) => v.id === decision.verdictId) : undefined;

  return (
    <Link
      to="/cases/$caseId"
      params={{ caseId: dispute.id }}
      className="panel group block p-5 transition-colors hover:border-primary/40"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <code className="font-mono text-xs text-primary">{dispute.id}</code>
            <Chip tone={priorityTone(dispute.priority)}>{dispute.priority}</Chip>
            <Chip tone={statusTone(dispute.status)}>
              {STATUS_LABELS[dispute.status] ?? dispute.status}
            </Chip>
            {verdict ? <Chip tone={verdict.tone}>{verdict.label}</Chip> : null}
          </div>
          <h3 className="mt-2 text-base font-semibold group-hover:text-primary">{dispute.title}</h3>
          <p className="mt-1 line-clamp-1 text-sm text-muted-foreground">{dispute.summary}</p>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span>{category?.label ?? dispute.category}</span>
            <span>{dispute.customer.name}</span>
            <span className="capitalize">{dispute.customer.tier} tier</span>
            <span>{agent?.name ?? dispute.assignedTo}</span>
            <span>{relativeAge(dispute.submittedAt, now)}</span>
          </div>
        </div>
        <div className="text-right">
          <p className="font-display text-lg font-semibold">
            {formatMoney(dispute.amount, config.settings)}
          </p>
          <span className="mt-2 inline-flex items-center gap-1 text-xs text-muted-foreground group-hover:text-primary">
            Open case <ArrowUpRight className="size-3" />
          </span>
        </div>
      </div>
    </Link>
  );
}
