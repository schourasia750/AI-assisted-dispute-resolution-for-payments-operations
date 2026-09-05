import { createServerFn } from "@tanstack/react-start";
import { streamText } from "ai";

import { langSmithStatus, pingLangSmith } from "./langsmith.server";
import { DEFAULT_MODEL, resolveModel } from "./models";
import { createOpenAIProvider, describeOpenAIError, getOpenAIKey } from "./openai.server";

export type CredentialStatus = {
  host: string;
  openai: {
    configured: boolean;
    keyMask: string | null;
    baseUrl: string;
    defaultModel: string;
  };
  langsmith: {
    configured: boolean;
    enabled: boolean;
    project: string;
    endpoint: string;
    keyMask: string | null;
  };
};

function mask(value: string): string {
  return value.length <= 12 ? "****" : `${value.slice(0, 7)}…${value.slice(-4)}`;
}

/** Plain-language name for the place this server code is running right now. */
function describeHost(): string {
  const env = process.env;
  if (env["NETLIFY"] || env["NETLIFY_SITE_NAME"] || env["DEPLOY_PRIME_URL"]) {
    const site = env["NETLIFY_SITE_NAME"] ?? env["SITE_NAME"];
    return site ? `Netlify site "${site}"` : "Netlify";
  }
  if (env["VERCEL"]) return "Vercel";
  if (env["NODE_ENV"] === "development") return "Local machine (development server)";
  return "Hosted preview (keys supplied by the builder)";
}

/** Reports which environment variables the server actually sees. Never returns key values. */
export const getCredentialStatus = createServerFn({ method: "GET" }).handler(
  async (): Promise<CredentialStatus> => {
    const key = getOpenAIKey();
    const ls = langSmithStatus();
    return {
      host: describeHost(),
      openai: {
        configured: Boolean(key),
        keyMask: key ? mask(key) : null,
        baseUrl: process.env["OPENAI_BASE_URL"]?.trim() || "https://api.openai.com/v1",
        defaultModel: DEFAULT_MODEL,
      },
      langsmith: {
        configured: ls.configured,
        enabled: ls.enabled,
        project: ls.project,
        endpoint: ls.endpoint,
        keyMask: ls.keyMask,
      },
    };
  },
);

export type CredentialTest = {
  openai: { ok: boolean; detail: string; ms: number; model: string };
  langsmith: { ok: boolean; detail: string };
};

/** Makes one real OpenAI call and writes one real LangSmith run, then reports both. */
export const testCredentials = createServerFn({ method: "POST" }).handler(
  async (): Promise<CredentialTest> => {
    const key = getOpenAIKey();
    const model = resolveModel(DEFAULT_MODEL);
    const started = Date.now();

    let openai: CredentialTest["openai"] = {
      ok: false,
      detail: "OPENAI_API_KEY is not set on the server.",
      ms: 0,
      model,
    };

    if (key) {
      try {
        const provider = createOpenAIProvider(key, "resolveflow-connection-test");
        const result = streamText({
          model: provider(model),
          prompt: "Reply with the single word: ready",
        });
        const text = (await result.text).trim();
        openai = {
          ok: true,
          detail: `OpenAI answered "${text.slice(0, 40)}" using ${model}.`,
          ms: Date.now() - started,
          model,
        };
      } catch (error) {
        const described = describeOpenAIError(error);
        openai = { ok: false, detail: described.message, ms: Date.now() - started, model };
      }
    }

    const langsmith = await pingLangSmith();
    return { openai, langsmith };
  },
);
