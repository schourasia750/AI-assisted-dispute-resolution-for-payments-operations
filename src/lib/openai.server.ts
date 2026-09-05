import { createOpenAI } from "@ai-sdk/openai";

import { createTracingFetch } from "./langsmith.server";

/**
 * Direct OpenAI provider. Uses the project's own OPENAI_API_KEY secret and
 * talks to api.openai.com — no Lovable AI gateway involved.
 * Read the key inside request/handler boundaries only; never ship it to the client.
 */
export function getOpenAIKey(): string | undefined {
  return process.env["OPENAI_API_KEY"]?.trim() || undefined;
}

export function createOpenAIProvider(apiKey: string, traceName = "resolveflow") {
  // Optional LangSmith mirroring; undefined when tracing is not configured.
  const tracingFetch = createTracingFetch(traceName);
  return createOpenAI({
    apiKey,
    // Optional override for Azure/proxy setups; defaults to https://api.openai.com/v1
    ...(process.env["OPENAI_BASE_URL"] ? { baseURL: process.env["OPENAI_BASE_URL"] } : {}),
    ...(tracingFetch ? { fetch: tracingFetch } : {}),
  });
}

/** Maps an OpenAI API failure onto a user-facing message. Only 429/5xx are retryable. */
export function describeOpenAIError(error: unknown): { status: number; message: string } {
  const status =
    typeof error === "object" && error !== null && "statusCode" in error
      ? Number((error as { statusCode?: unknown }).statusCode)
      : 500;
  const raw = error instanceof Error ? error.message : String(error);

  if (status === 429) {
    return {
      status,
      message: "OpenAI is rate limiting this key (or the quota is used up). Try again shortly.",
    };
  }
  if (status === 401 || status === 403) {
    return {
      status,
      message: "OpenAI rejected the API key. Check that OPENAI_API_KEY is valid and has access.",
    };
  }
  if (status === 400) {
    return { status, message: `OpenAI rejected the request: ${raw}` };
  }
  return { status: status || 500, message: raw || "OpenAI failed unexpectedly." };
}

export const MISSING_KEY_MESSAGE =
  "OpenAI is not configured yet — add your OPENAI_API_KEY secret to enable AI decisions and chat.";
