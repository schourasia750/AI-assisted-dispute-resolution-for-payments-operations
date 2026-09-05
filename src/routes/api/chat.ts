import { createFileRoute } from "@tanstack/react-router";
import { convertToModelMessages, streamText, type UIMessage } from "ai";

import {
  createOpenAIProvider,
  describeOpenAIError,
  getOpenAIKey,
  MISSING_KEY_MESSAGE,
} from "@/lib/openai.server";
import { resolveModel } from "@/lib/models";

type ChatRequestBody = {
  messages?: unknown;
  system?: unknown;
  model?: unknown;
};

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = (await request.json()) as ChatRequestBody;

        if (!Array.isArray(body.messages) || body.messages.length === 0) {
          return Response.json({ error: "No messages supplied." }, { status: 400 });
        }
        if (typeof body.system !== "string" || body.system.trim().length === 0) {
          return Response.json({ error: "Missing case context." }, { status: 400 });
        }

        const apiKey = getOpenAIKey();
        if (!apiKey) {
          return Response.json({ error: MISSING_KEY_MESSAGE }, { status: 500 });
        }

        const openai = createOpenAIProvider(apiKey, "resolveflow-case-assistant");
        const model = resolveModel(typeof body.model === "string" ? body.model : undefined);

        try {
          const result = streamText({
            model: openai(model),
            system: body.system,
            messages: await convertToModelMessages(body.messages as UIMessage[]),
            // Stateless: resend full history each turn instead of referencing
            // server-stored items by id (which do not exist when store is false).
            providerOptions: { openai: { store: false } },
            onError: ({ error }) => {
              const described = describeOpenAIError(error);
              console.error("[api/chat stream]", described.status, described.message);
            },
          });

          return result.toUIMessageStreamResponse({
            originalMessages: body.messages as UIMessage[],
            onError: (error) => describeOpenAIError(error).message,
          });
        } catch (error) {
          const described = describeOpenAIError(error);
          console.error("[api/chat]", described.status, described.message);
          return Response.json({ error: described.message }, { status: described.status });
        }
      },
    },
  },
});
