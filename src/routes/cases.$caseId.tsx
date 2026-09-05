import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { ArrowLeft, FileText, Mail, ScrollText, UserRound } from "lucide-react";

import { CaseChat } from "@/components/case-chat";
import { Chip } from "@/components/chips";
import { DecisionPanel } from "@/components/decision-panel";
import { useConfig } from "@/lib/config";
import { formatMoney, relevantPolicies } from "@/lib/prompt";
import { formatDate, priorityTone, statusTone, STATUS_LABELS } from "@/lib/ui";

export const Route = createFileRoute("/cases/$caseId")({
  head: ({ params }) => ({
    meta: [
      { title: `Case ${params.caseId} — ResolveFlow` },
      {
        name: "description",
        content: `Review dispute ${params.caseId}: evidence, the applicable policy book, an AI verdict with confidence, and an AI case assistant.`,
      },
      { property: "og:title", content: `Case ${params.caseId} — ResolveFlow` },
      {
        property: "og:description",
        content: `Evidence, policies, AI verdict and case assistant for dispute ${params.caseId}.`,
      },
    ],
  }),
  component: CaseDetailPage,
});

function CaseDetailPage() {
  const { caseId } = Route.useParams();
  const { config, hydrated } = useConfig();
  const dispute = config.cases.find((c) => c.id === caseId);

  if (!dispute) {
    if (!hydrated) return <main className="mx-auto max-w-7xl px-6 py-10" />;
    throw notFound();
  }

  const category = config.categories.find((c) => c.id === dispute.category);
  const agent = config.agents.find((a) => a.id === dispute.assignedTo);
  const policies = relevantPolicies(config.policies, dispute.category);
  const customer = dispute.customer;
  const isRepeatRisk = customer.priorDisputes >= config.settings.repeatDisputeLimit;

  return (
    <main className="mx-auto max-w-7xl px-6 py-8">
      <Link
        to="/"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" /> Back to queue
      </Link>

      <header className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <code className="font-mono text-xs text-primary">{dispute.id}</code>
            <Chip tone={priorityTone(dispute.priority)}>{dispute.priority}</Chip>
            <Chip tone={statusTone(dispute.status)}>
              {STATUS_LABELS[dispute.status] ?? dispute.status}
            </Chip>
            <Chip>{category?.label ?? dispute.category}</Chip>
            {isRepeatRisk ? <Chip tone="reject">repeat dispute risk</Chip> : null}
          </div>
          <h1 className="mt-2 text-2xl font-semibold sm:text-3xl">{dispute.title}</h1>
          <p className="mt-1.5 text-xs text-muted-foreground">
            Order {dispute.orderId} · via {dispute.channel} · submitted{" "}
            {formatDate(dispute.submittedAt)} UTC · owner {agent?.name ?? dispute.assignedTo}
          </p>
        </div>
        <div className="text-right">
          <p className="eyebrow">Disputed</p>
          <p className="metric mt-1">{formatMoney(dispute.amount, config.settings)}</p>
        </div>
      </header>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_minmax(0,26rem)]">
        <div className="space-y-6">
          <DecisionPanel dispute={dispute} />

          <section className="panel p-5">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <FileText className="size-4 text-primary" /> Case summary
            </h2>
            <p className="mt-2.5 text-sm leading-relaxed">{dispute.summary}</p>

            <h3 className="eyebrow mt-6">Evidence on file ({dispute.evidence.length})</h3>
            <ul className="mt-2.5 space-y-2.5">
              {dispute.evidence.map((item) => (
                <li key={item.id} className="panel-inset p-3.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <code className="font-mono text-xs text-muted-foreground">{item.id}</code>
                    <span className="text-sm font-medium">{item.label}</span>
                    <Chip>{item.type}</Chip>
                    <span className="text-xs text-muted-foreground">from {item.submittedBy}</span>
                  </div>
                  <p className="mt-1.5 text-sm text-muted-foreground">{item.detail}</p>
                </li>
              ))}
              {dispute.evidence.length === 0 ? (
                <li className="panel-inset p-4 text-sm text-muted-foreground">
                  No evidence supplied yet.
                </li>
              ) : null}
            </ul>

            <h3 className="eyebrow mt-6">Timeline</h3>
            <ol className="mt-2.5 space-y-3 border-l border-border pl-4">
              {dispute.timeline.map((entry, index) => (
                <li key={`${entry.at}-${index}`} className="relative">
                  <span className="absolute top-1.5 -left-[1.3rem] size-2 rounded-full bg-primary" />
                  <p className="text-sm">{entry.note}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {entry.actor} · {formatDate(entry.at)} UTC
                  </p>
                </li>
              ))}
            </ol>
          </section>
        </div>

        <div className="space-y-6">
          <CaseChat dispute={dispute} />

          <section className="panel p-5">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <UserRound className="size-4 text-primary" /> Customer
            </h2>
            <p className="mt-2.5 text-sm font-medium">{customer.name}</p>
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Mail className="size-3" /> {customer.email}
            </p>
            <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <Fact label="Tier" value={customer.tier} />
              <Fact label="Account age" value={`${customer.accountAgeMonths} months`} />
              <Fact
                label="Lifetime value"
                value={formatMoney(customer.lifetimeValue, config.settings)}
              />
              <Fact
                label="Prior disputes"
                value={`${customer.priorDisputes} / limit ${config.settings.repeatDisputeLimit}`}
              />
            </dl>
          </section>

          <section className="panel p-5">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <ScrollText className="size-4 text-primary" /> Policies in play ({policies.length})
            </h2>
            <p className="mt-1.5 text-xs text-muted-foreground">
              Matched on category plus every blocking rule. Edit these in{" "}
              <Link to="/settings" className="text-primary underline">
                policies.json
              </Link>
              .
            </p>
            <ul className="mt-3 space-y-2.5">
              {policies.map((policy) => (
                <li key={policy.id} className="panel-inset p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <code className="font-mono text-xs text-muted-foreground">{policy.id}</code>
                    <span className="text-sm font-medium">{policy.title}</span>
                    {policy.severity === "blocking" ? <Chip tone="reject">blocking</Chip> : null}
                  </div>
                  <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                    {policy.rule}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </main>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="eyebrow">{label}</dt>
      <dd className="mt-0.5 capitalize">{value}</dd>
    </div>
  );
}
