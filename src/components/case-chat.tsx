import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { Bot, CornerDownLeft, Loader2, Square, User } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useConfig } from "@/lib/config";
import { buildChatSystemPrompt } from "@/lib/prompt";
import type { DisputeCase } from "@/lib/types";
import { cn } from "@/lib/utils";

const SUGGESTIONS = [
  "What is the strongest argument against refunding this?",
  "Which policy decides this case, and why?",
  "What evidence is still missing?",
  "Draft a reply asking for what we need.",
];

export function CaseChat({ dispute }: { dispute: DisputeCase }) {
  const { config } = useConfig();
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const system = useMemo(
    () =>
      buildChatSystemPrompt(dispute, {
        settings: config.settings,
        categories: config.categories,
        agents: config.agents,
        policies: config.policies,
      }),
    [dispute, config.settings, config.categories, config.agents, config.policies],
  );

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        body: { system, model: config.settings.model },
      }),
    [system, config.settings.model],
  );

  const { messages, sendMessage, status, stop, error } = useChat({
    id: `case-${dispute.id}`,
    transport,
    onError: (err) => toast.error("Assistant unavailable", { description: err.message }),
  });

  const isBusy = status === "submitted" || status === "streaming";

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, status]);

  function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || isBusy) return;
    setInput("");
    void sendMessage({ text: trimmed });
  }

  return (
    <section className="panel flex h-[620px] flex-col">
      <header className="flex items-center gap-3 border-b border-border px-5 py-4">
        <span className="grid size-9 place-items-center rounded-full tone-approve">
          <Bot className="size-4" />
        </span>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">
            {config.settings.assistantName} · case assistant
          </h2>
          <p className="truncate text-xs text-muted-foreground">
            Grounded in {dispute.id}, its evidence and your policy book
          </p>
        </div>
      </header>

      <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
        {messages.length === 0 ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Ask about this dispute. {config.settings.assistantName} can only see the case record
              and the policies that apply to it.
            </p>
            <div className="flex flex-wrap gap-2">
              {SUGGESTIONS.map((suggestion) => (
                <button
                  key={suggestion}
                  onClick={() => send(suggestion)}
                  className="panel-inset px-3 py-1.5 text-left text-xs text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {messages.map((message) => {
          const text = message.parts
            .map((part) => (part.type === "text" ? part.text : ""))
            .join("");
          const isUser = message.role === "user";

          return (
            <div key={message.id} className={cn("flex gap-3", isUser && "flex-row-reverse")}>
              <span
                className={cn(
                  "mt-0.5 grid size-7 shrink-0 place-items-center rounded-full",
                  isUser ? "tone-quiet" : "tone-approve",
                )}
              >
                {isUser ? <User className="size-3.5" /> : <Bot className="size-3.5" />}
              </span>
              <div
                className={cn(
                  "max-w-[85%] rounded-xl px-3.5 py-2.5",
                  isUser
                    ? "bg-secondary text-secondary-foreground"
                    : "panel-inset text-card-foreground",
                )}
              >
                {text ? (
                  <div className="prose-flow">
                    <ReactMarkdown>{text}</ReactMarkdown>
                  </div>
                ) : (
                  <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
                )}
              </div>
            </div>
          );
        })}

        {error ? (
          <p className="rounded-lg px-3 py-2 text-xs tone-reject">{error.message}</p>
        ) : null}
      </div>

      <form
        className="border-t border-border p-3"
        onSubmit={(event) => {
          event.preventDefault();
          send(input);
        }}
      >
        <div className="panel-inset flex items-end gap-2 p-2">
          <Textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                send(input);
              }
            }}
            rows={1}
            placeholder={`Ask ${config.settings.assistantName} about ${dispute.id}…`}
            className="max-h-32 min-h-9 resize-none border-0 bg-transparent p-1.5 text-sm shadow-none focus-visible:ring-0"
          />
          {isBusy ? (
            <Button type="button" size="icon" variant="secondary" onClick={() => stop()}>
              <Square className="size-3.5" />
            </Button>
          ) : (
            <Button type="submit" size="icon" disabled={!input.trim()}>
              <CornerDownLeft className="size-4" />
            </Button>
          )}
        </div>
      </form>
    </section>
  );
}
