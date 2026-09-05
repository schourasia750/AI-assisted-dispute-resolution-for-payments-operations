import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, CheckCircle2, Loader2, PlugZap, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { Chip } from "@/components/chips";
import { Button } from "@/components/ui/button";
import {
  getCredentialStatus,
  testCredentials,
  type CredentialStatus,
  type CredentialTest,
} from "@/lib/credentials.functions";

/**
 * Shows exactly which credentials the server reads from its environment
 * (never their values) and can prove them with one live call each.
 */
export function CredentialsPanel() {
  const loadStatus = useServerFn(getCredentialStatus);
  const runTest = useServerFn(testCredentials);

  const [status, setStatus] = useState<CredentialStatus | null>(null);
  const [test, setTest] = useState<CredentialTest | null>(null);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const refresh = useCallback(() => {
    void loadStatus({}).then(setStatus);
  }, [loadStatus]);

  useEffect(refresh, [refresh]);

  async function check() {
    setBusy(true);
    setTest(null);
    setFailure(null);
    try {
      setTest(await runTest({}));
      refresh();
    } catch (error) {
      setFailure(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">Credentials</h2>
          <p className="mt-1 max-w-xl text-xs leading-relaxed text-muted-foreground">
            Read only from the server environment — a local{" "}
            <code className="font-mono">.env</code> file when you run the app yourself, or the
            environment variables of wherever it is hosted. Nothing is stored in this browser and no
            value is ever sent to it.
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="ghost" onClick={refresh}>
            <RefreshCw className="size-3.5" /> Refresh
          </Button>
          <Button size="sm" onClick={check} disabled={busy}>
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : <PlugZap className="size-3.5" />}
            {busy ? "Testing…" : "Test connection"}
          </Button>
        </div>
      </div>

      {status ? (
        <p className="mt-4 rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs">
          Running on: <span className="font-semibold">{status.host}</span>. The keys listed below are
          the ones this copy of the app is using — a different copy (for example your own hosted
          site) has its own.
        </p>
      ) : null}

      {status ? (
        <dl className="mt-4 grid gap-3 sm:grid-cols-2">
          <Row
            name="OPENAI_API_KEY"
            ok={status.openai.configured}
            value={status.openai.keyMask ?? "not set"}
          />
          <Row name="OPENAI_BASE_URL" ok value={status.openai.baseUrl} />
          <Row
            name="LANGSMITH_API_KEY"
            ok={status.langsmith.configured}
            value={status.langsmith.keyMask ?? "not set"}
          />
          <Row
            name="LANGSMITH_TRACING"
            ok={status.langsmith.enabled}
            value={
              status.langsmith.enabled
                ? `on → project "${status.langsmith.project}"`
                : "off (no traces are sent)"
            }
          />
        </dl>
      ) : (
        <p className="mt-4 text-xs text-muted-foreground">Reading environment…</p>
      )}

      {failure ? (
        <p className="mt-4 text-xs text-destructive">The check could not run: {failure}</p>
      ) : null}

      {test ? (
        <div className="mt-4 space-y-2">
          <Result label="OpenAI" ok={test.openai.ok} detail={`${test.openai.detail} (${test.openai.ms} ms)`} />
          <Result label="LangSmith" ok={test.langsmith.ok} detail={test.langsmith.detail} />
          <p className="text-xs text-muted-foreground">
            OpenAI records these under Logs for the project the key belongs to; usage graphs can lag
            a few minutes behind.
          </p>
        </div>
      ) : null}
    </section>
  );
}

function Row({ name, ok, value }: { name: string; ok: boolean; value: string }) {
  return (
    <div className="rounded-lg border border-border px-3 py-2">
      <dt className="flex items-center justify-between gap-2">
        <code className="font-mono text-xs">{name}</code>
        <Chip tone={ok ? "approve" : "escalate"}>{ok ? "detected" : "missing"}</Chip>
      </dt>
      <dd className="mt-1 truncate font-mono text-xs text-muted-foreground">{value}</dd>
    </div>
  );
}

function Result({ label, ok, detail }: { label: string; ok: boolean; detail: string }) {
  return (
    <p className="flex items-start gap-2 text-xs">
      {ok ? (
        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-500" />
      ) : (
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-500" />
      )}
      <span>
        <span className="font-semibold">{label}:</span> {detail}
      </span>
    </p>
  );
}
