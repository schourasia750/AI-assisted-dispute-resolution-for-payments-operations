/**
 * Minimal, dependency-free LangSmith tracing.
 *
 * Wraps the fetch used by the OpenAI provider so every model call is mirrored
 * to LangSmith as a run. Tracing is entirely opt-in: with no LANGSMITH_API_KEY
 * configured the wrapper returns plain fetch and nothing is sent anywhere.
 *
 * Env (see .env.example):
 *   LANGSMITH_TRACING=true          enable/disable (default: on when key set)
 *   LANGSMITH_API_KEY=lsv2_pt_...   required to trace
 *   LANGSMITH_PROJECT=resolveflow   destination project name
 *   LANGSMITH_ENDPOINT=https://api.smith.langchain.com
 */

type FetchFn = typeof fetch;

function config() {
  const apiKey = process.env["LANGSMITH_API_KEY"]?.trim();
  const flag = process.env["LANGSMITH_TRACING"]?.trim().toLowerCase();
  const enabled = Boolean(apiKey) && flag !== "false" && flag !== "0";
  return {
    enabled,
    apiKey,
    project: process.env["LANGSMITH_PROJECT"]?.trim() || "resolveflow",
    endpoint: (
      process.env["LANGSMITH_ENDPOINT"]?.trim() || "https://api.smith.langchain.com"
    ).replace(/\/$/, ""),
  };
}

export function isLangSmithEnabled(): boolean {
  return config().enabled;
}

async function send(path: string, method: "POST" | "PATCH", payload: unknown) {
  const { apiKey, endpoint } = config();
  if (!apiKey) return;
  try {
    const res = await fetch(`${endpoint}${path}`, {
      method,
      headers: { "Content-Type": "application/json", "x-api-key": apiKey },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      console.warn("[langsmith]", method, path, res.status, await res.text());
    }
  } catch (error) {
    console.warn("[langsmith] trace failed", error);
  }
}

/** Extracts assistant text out of a buffered or streamed OpenAI response body. */
function extractText(raw: string): string {
  const chunks: string[] = [];
  for (const line of raw.split("\n")) {
    if (!line.startsWith("data:")) continue;
    const data = line.slice(5).trim();
    if (!data || data === "[DONE]") continue;
    try {
      const event = JSON.parse(data) as {
        delta?: unknown;
        type?: string;
        choices?: Array<{ delta?: { content?: string } }>;
      };
      if (typeof event.delta === "string" && event.type?.includes("output_text")) {
        chunks.push(event.delta);
      }
      const content = event.choices?.[0]?.delta?.content;
      if (typeof content === "string") chunks.push(content);
    } catch {
      /* ignore non-JSON keepalives */
    }
  }
  if (chunks.length > 0) return chunks.join("");
  try {
    const parsed = JSON.parse(raw) as {
      output_text?: string;
      choices?: Array<{ message?: { content?: string } }>;
    };
    return parsed.output_text ?? parsed.choices?.[0]?.message?.content ?? raw.slice(0, 4000);
  } catch {
    return raw.slice(0, 4000);
  }
}

/**
 * Returns a fetch that mirrors each model call to LangSmith.
 * `name` labels the run (e.g. "resolveflow-decision", "resolveflow-chat").
 */
export function createTracingFetch(name: string): FetchFn | undefined {
  const { enabled, project } = config();
  if (!enabled) return undefined;

  const tracing: FetchFn = async (input, init) => {
    const runId = crypto.randomUUID();
    const startTime = new Date().toISOString();

    let inputs: unknown = {};
    let model: string | undefined;
    try {
      const body = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
      inputs = body ?? {};
      model = typeof body?.model === "string" ? body.model : undefined;
    } catch {
      /* non-JSON body: trace metadata only */
    }

    void send("/runs", "POST", {
      id: runId,
      // LangSmith only lists runs that carry a trace id and a dotted order;
      // without these the POST succeeds but nothing appears in the project.
      trace_id: runId,
      dotted_order: `${dottedTimestamp(startTime)}Z${runId}`,
      name,
      run_type: "llm",
      session_name: project,
      start_time: startTime,
      inputs,
      extra: { metadata: { model, app: "resolveflow" } },
    });


    try {
      const response = await fetch(input as RequestInfo, init);

      if (!response.body) {
        const text = await response.clone().text();
        void send(`/runs/${runId}`, "PATCH", {
          end_time: new Date().toISOString(),
          outputs: { output: extractText(text) },
          ...(response.ok ? {} : { error: `HTTP ${response.status}: ${text.slice(0, 2000)}` }),
        });
        return response;
      }

      const [toCaller, toTrace] = response.body.tee();
      void (async () => {
        let raw = "";
        try {
          const reader = toTrace.getReader();
          const decoder = new TextDecoder();
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            raw += decoder.decode(value, { stream: true });
          }
        } catch (error) {
          raw += `\n[stream error] ${String(error)}`;
        }
        await send(`/runs/${runId}`, "PATCH", {
          end_time: new Date().toISOString(),
          outputs: { output: extractText(raw) },
          ...(response.ok ? {} : { error: `HTTP ${response.status}: ${raw.slice(0, 2000)}` }),
        });
      })();

      return new Response(toCaller, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      });
    } catch (error) {
      void send(`/runs/${runId}`, "PATCH", {
        end_time: new Date().toISOString(),
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  };

  return tracing;
}

/** `2026-09-04T14:51:02.123Z` -> `20260904T145102123000` (LangSmith dotted-order prefix). */
function dottedTimestamp(iso: string): string {
  const [date, time] = iso.replace("Z", "").split("T");
  return `${date!.replace(/-/g, "")}T${time!.replace(/[:.]/g, "")}000`;
}

export type LangSmithStatus = {
  configured: boolean;
  enabled: boolean;
  project: string;
  endpoint: string;
  keyMask: string | null;
};

export function langSmithStatus(): LangSmithStatus {
  const { enabled, apiKey, project, endpoint } = config();
  return {
    configured: Boolean(apiKey),
    enabled,
    project,
    endpoint,
    keyMask: apiKey ? mask(apiKey) : null,
  };
}

/** Verifies the LangSmith key by writing one real run into the project. */
export async function pingLangSmith(): Promise<{ ok: boolean; detail: string }> {
  const { enabled, apiKey, project, endpoint } = config();
  if (!apiKey) return { ok: false, detail: "LANGSMITH_API_KEY is not set." };
  if (!enabled) return { ok: false, detail: "LANGSMITH_TRACING is switched off." };

  const id = crypto.randomUUID();
  const start = new Date().toISOString();
  try {
    const res = await fetch(`${endpoint}/runs`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey },
      body: JSON.stringify({
        id,
        trace_id: id,
        dotted_order: `${dottedTimestamp(start)}Z${id}`,
        name: "resolveflow-connection-test",
        run_type: "chain",
        session_name: project,
        start_time: start,
        end_time: new Date().toISOString(),
        inputs: { note: "Connection test from the ResolveFlow configuration page." },
        outputs: { ok: true },
      }),
    });
    if (!res.ok) {
      return { ok: false, detail: `LangSmith replied ${res.status}: ${(await res.text()).slice(0, 200)}` };
    }
    return { ok: true, detail: `Test run written to project "${project}".` };
  } catch (error) {
    return { ok: false, detail: error instanceof Error ? error.message : String(error) };
  }
}

function mask(value: string): string {
  return value.length <= 8 ? "****" : `${value.slice(0, 5)}…${value.slice(-4)}`;
}
