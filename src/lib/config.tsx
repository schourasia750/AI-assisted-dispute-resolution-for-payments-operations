import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import agentsJson from "@/data/agents.json";
import casesJson from "@/data/cases.json";
import categoriesJson from "@/data/categories.json";
import policiesJson from "@/data/policies.json";
import settingsJson from "@/data/settings.json";
import verdictsJson from "@/data/verdicts.json";
import type {
  Agent,
  Category,
  ConfigBundle,
  ConfigKey,
  Decision,
  DisputeCase,
  Policy,
  Settings,
  Verdict,
} from "./types";

/**
 * Every value the app renders comes from these JSON files — nothing is
 * hardcoded in a component. Edits made on the Configuration page are stored as
 * per-file overrides in localStorage, so the JSON on disk stays the pristine
 * default that "Reset" restores.
 */
export const DEFAULT_CONFIG: ConfigBundle = {
  settings: settingsJson as Settings,
  verdicts: verdictsJson as Verdict[],
  categories: categoriesJson as Category[],
  policies: policiesJson as Policy[],
  agents: agentsJson as Agent[],
  cases: casesJson as DisputeCase[],
};

export const CONFIG_FILES: { key: ConfigKey; file: string; description: string }[] = [
  {
    key: "settings",
    file: "settings.json",
    description: "Branding, money formatting, decision thresholds, model and both AI prompts.",
  },
  {
    key: "verdicts",
    file: "verdicts.json",
    description: "The exact set of outcomes the model may choose from, and their colour tone.",
  },
  {
    key: "categories",
    file: "categories.json",
    description: "Dispute types used for routing, filtering and policy matching.",
  },
  {
    key: "policies",
    file: "policies.json",
    description: "The rule book handed to the model. 'blocking' rules override everything else.",
  },
  { key: "agents", file: "agents.json", description: "Resolution team members and their roles." },
  { key: "cases", file: "cases.json", description: "The dispute queue, including evidence and timelines." },
];

const STORAGE_PREFIX = "resolveflow:config:";
const DECISIONS_KEY = "resolveflow:decisions";

type ConfigContextValue = {
  config: ConfigBundle;
  hydrated: boolean;
  overrides: Partial<Record<ConfigKey, boolean>>;
  saveSection: (key: ConfigKey, value: unknown) => void;
  resetSection: (key: ConfigKey) => void;
  resetAll: () => void;
  decisions: Record<string, Decision>;
  saveDecision: (caseId: string, decision: Decision) => void;
  clearDecision: (caseId: string) => void;
  updateCase: (caseId: string, patch: Partial<DisputeCase>) => void;
};

const ConfigContext = createContext<ConfigContextValue | undefined>(undefined);

export function ConfigProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<ConfigBundle>(DEFAULT_CONFIG);
  const [overrides, setOverrides] = useState<Partial<Record<ConfigKey, boolean>>>({});
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});
  const [hydrated, setHydrated] = useState(false);

  // Read persisted state after hydration so SSR and first client render match.
  useEffect(() => {
    const next = { ...DEFAULT_CONFIG };
    const seen: Partial<Record<ConfigKey, boolean>> = {};

    for (const { key } of CONFIG_FILES) {
      try {
        const stored = window.localStorage.getItem(STORAGE_PREFIX + key);
        if (!stored) continue;
        (next as Record<string, unknown>)[key] = JSON.parse(stored);
        seen[key] = true;
      } catch {
        window.localStorage.removeItem(STORAGE_PREFIX + key);
      }
    }

    try {
      const storedDecisions = window.localStorage.getItem(DECISIONS_KEY);
      if (storedDecisions) setDecisions(JSON.parse(storedDecisions) as Record<string, Decision>);
    } catch {
      window.localStorage.removeItem(DECISIONS_KEY);
    }

    setConfig(next);
    setOverrides(seen);
    setHydrated(true);
  }, []);

  const saveSection = useCallback((key: ConfigKey, value: unknown) => {
    setConfig((current) => ({ ...current, [key]: value }) as ConfigBundle);
    setOverrides((current) => ({ ...current, [key]: true }));
    window.localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(value));
  }, []);

  const resetSection = useCallback((key: ConfigKey) => {
    setConfig((current) => ({ ...current, [key]: DEFAULT_CONFIG[key] }) as ConfigBundle);
    setOverrides((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
    window.localStorage.removeItem(STORAGE_PREFIX + key);
  }, []);

  const resetAll = useCallback(() => {
    for (const { key } of CONFIG_FILES) window.localStorage.removeItem(STORAGE_PREFIX + key);
    window.localStorage.removeItem(DECISIONS_KEY);
    setConfig(DEFAULT_CONFIG);
    setOverrides({});
    setDecisions({});
  }, []);

  const saveDecision = useCallback((caseId: string, decision: Decision) => {
    setDecisions((current) => {
      const next = { ...current, [caseId]: decision };
      window.localStorage.setItem(DECISIONS_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const clearDecision = useCallback((caseId: string) => {
    setDecisions((current) => {
      const next = { ...current };
      delete next[caseId];
      window.localStorage.setItem(DECISIONS_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const updateCase = useCallback((caseId: string, patch: Partial<DisputeCase>) => {
    setConfig((current) => {
      const cases = current.cases.map((c) => (c.id === caseId ? { ...c, ...patch } : c));
      window.localStorage.setItem(STORAGE_PREFIX + "cases", JSON.stringify(cases));
      return { ...current, cases };
    });
    setOverrides((current) => ({ ...current, cases: true }));
  }, []);

  const value = useMemo<ConfigContextValue>(
    () => ({
      config,
      hydrated,
      overrides,
      saveSection,
      resetSection,
      resetAll,
      decisions,
      saveDecision,
      clearDecision,
      updateCase,
    }),
    [
      config,
      hydrated,
      overrides,
      saveSection,
      resetSection,
      resetAll,
      decisions,
      saveDecision,
      clearDecision,
      updateCase,
    ],
  );

  return <ConfigContext.Provider value={value}>{children}</ConfigContext.Provider>;
}

export function useConfig(): ConfigContextValue {
  const context = useContext(ConfigContext);
  if (!context) throw new Error("useConfig must be used inside <ConfigProvider>");
  return context;
}

/** Lookup helpers so components never re-implement id resolution. */
export function useLookups() {
  const { config } = useConfig();
  return useMemo(
    () => ({
      category: (id: string) => config.categories.find((c) => c.id === id),
      verdict: (id: string) => config.verdicts.find((v) => v.id === id),
      agent: (id: string) => config.agents.find((a) => a.id === id),
      policy: (id: string) => config.policies.find((p) => p.id === id),
    }),
    [config],
  );
}
