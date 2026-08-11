import type { CopilotCitation } from "./types";
import { sanitizeAiContext } from "../sanitize-context";

export function cite(partial: CopilotCitation): CopilotCitation {
  return {
    ...partial,
    retrievedAt: partial.retrievedAt || new Date().toISOString(),
  };
}

export function mergeCitations(...lists: (CopilotCitation[] | undefined)[]): CopilotCitation[] {
  const out: CopilotCitation[] = [];
  const seen = new Set<string>();
  for (const list of lists) {
    for (const c of list || []) {
      const key = `${c.sourceType}:${c.sourceId || c.title}:${c.period || ""}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(c);
    }
  }
  return out.slice(0, 24);
}

/** Strip HTML + high-risk identity/credential patterns before prompt inclusion. */
export function sanitizeForPrompt(text: string, max = 1200): string {
  return sanitizeAiContext(text, max).text;
}
