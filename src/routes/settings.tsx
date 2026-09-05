import { createFileRoute } from "@tanstack/react-router";
import { Check, Download, RotateCcw, Save, Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Chip } from "@/components/chips";
import { CredentialsPanel } from "@/components/credentials-panel";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { CONFIG_FILES, useConfig } from "@/lib/config";
import { ALLOWED_MODELS, MODEL_LABELS } from "@/lib/models";
import type { ConfigKey } from "@/lib/types";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Configuration — ResolveFlow" },
      {
        name: "description",
        content:
          "Edit every ResolveFlow data file in place: policies, verdicts, categories, agents, cases, thresholds and the AI prompts that drive decisions.",
      },
      { property: "og:title", content: "Configuration — ResolveFlow" },
      {
        property: "og:description",
        content: "Edit ResolveFlow's policy book, verdicts, thresholds and AI prompts as JSON.",
      },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const { config, overrides, resetAll, hydrated } = useConfig();
  const [active, setActive] = useState<ConfigKey>("settings");
  const fileInput = useRef<HTMLInputElement>(null);
  const activeFile = CONFIG_FILES.find((f) => f.key === active)!;

  function exportAll() {
    const blob = new Blob([JSON.stringify(config, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "resolveflow-config.json";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="mx-auto max-w-7xl px-6 py-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Data & rules</p>
          <h1 className="mt-2 text-3xl font-semibold">Configuration</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            ResolveFlow holds no hardcoded content. Each file below ships as JSON in{" "}
            <code className="font-mono text-xs">src/data/</code> and can be edited here. Saved edits
            are kept in this browser and override the file on disk until you reset.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={exportAll}>
            <Download className="size-4" /> Export all
          </Button>
          <Button variant="ghost" onClick={() => fileInput.current?.click()}>
            <Upload className="size-4" /> Import
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              resetAll();
              toast.success("All files reset to the shipped defaults");
            }}
          >
            <RotateCcw className="size-4" /> Reset all
          </Button>
        </div>
      </header>

      <input
        ref={fileInput}
        type="file"
        accept="application/json"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (!file) return;
          void file.text().then((text) => {
            try {
              const parsed = JSON.parse(text) as Record<string, unknown>;
              let count = 0;
              for (const { key } of CONFIG_FILES) {
                if (parsed[key] !== undefined) {
                  window.localStorage.setItem(
                    "resolveflow:config:" + key,
                    JSON.stringify(parsed[key]),
                  );
                  count += 1;
                }
              }
              if (count === 0) throw new Error("no recognised sections");
              toast.success(`Imported ${count} section(s)`, { description: "Reloading…" });
              window.location.reload();
            } catch (error) {
              toast.error("Import failed", {
                description: error instanceof Error ? error.message : "Invalid JSON",
              });
            }
          });
          event.target.value = "";
        }}
      />

      <div className="mt-8 grid gap-6 lg:grid-cols-[16rem_1fr]">
        <nav className="space-y-1.5">
          {CONFIG_FILES.map((file) => (
            <button
              key={file.key}
              onClick={() => setActive(file.key)}
              className={`w-full rounded-lg border px-3.5 py-2.5 text-left transition-colors ${
                active === file.key
                  ? "border-primary/40 bg-secondary"
                  : "border-border bg-transparent hover:bg-secondary/60"
              }`}
            >
              <span className="flex items-center justify-between gap-2">
                <code className="font-mono text-xs">{file.file}</code>
                {overrides[file.key] ? <Chip tone="approve">edited</Chip> : null}
              </span>
              <span className="mt-1 block text-xs text-muted-foreground">{file.description}</span>
            </button>
          ))}
        </nav>

        <div className="space-y-6">
          {active === "settings" ? <CredentialsPanel /> : null}
          {active === "settings" ? <ModelPicker /> : null}
          {hydrated ? (
            <JsonEditor key={active} sectionKey={active} label={activeFile.file} />
          ) : (
            <div className="panel p-6 text-sm text-muted-foreground">Loading configuration…</div>
          )}
        </div>
      </div>
    </main>
  );
}

function ModelPicker() {
  const { config, saveSection } = useConfig();

  return (
    <section className="panel p-5">
      <h2 className="text-sm font-semibold">Decision model</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Powers both the verdict engine and the case assistant. Stored as{" "}
        <code className="font-mono">settings.model</code>.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {ALLOWED_MODELS.map((model) => {
          const isActive = config.settings.model === model;
          return (
            <Button
              key={model}
              size="sm"
              variant={isActive ? "default" : "secondary"}
              onClick={() => saveSection("settings", { ...config.settings, model })}
            >
              {isActive ? <Check className="size-3.5" /> : null}
              {MODEL_LABELS[model] ?? model}
            </Button>
          );
        })}
      </div>
    </section>
  );
}

function JsonEditor({ sectionKey, label }: { sectionKey: ConfigKey; label: string }) {
  const { config, saveSection, resetSection, overrides } = useConfig();
  const serialized = JSON.stringify(config[sectionKey], null, 2);
  const [draft, setDraft] = useState(serialized);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDraft(serialized);
    setError(null);
  }, [serialized]);

  const dirty = draft !== serialized;

  function save() {
    try {
      const parsed = JSON.parse(draft) as unknown;
      if (sectionKey === "settings" && (typeof parsed !== "object" || Array.isArray(parsed))) {
        throw new Error("settings.json must be a JSON object");
      }
      if (sectionKey !== "settings" && !Array.isArray(parsed)) {
        throw new Error(`${label} must be a JSON array`);
      }
      saveSection(sectionKey, parsed);
      setError(null);
      toast.success(`${label} saved`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Invalid JSON";
      setError(message);
      toast.error("Could not save", { description: message });
    }
  }

  return (
    <section className="panel p-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-mono text-sm font-semibold">{label}</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {dirty ? "Unsaved changes" : overrides[sectionKey] ? "Edited copy in use" : "Shipped default"}
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" onClick={save} disabled={!dirty}>
            <Save className="size-3.5" /> Save
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              resetSection(sectionKey);
              toast.success(`${label} reset to default`);
            }}
          >
            <RotateCcw className="size-3.5" /> Reset file
          </Button>
        </div>
      </header>

      {error ? <p className="mt-3 rounded-md px-3 py-2 text-xs tone-reject">{error}</p> : null}

      <Textarea
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        spellCheck={false}
        className="mt-4 min-h-[32rem] font-mono text-xs leading-relaxed"
      />
    </section>
  );
}
