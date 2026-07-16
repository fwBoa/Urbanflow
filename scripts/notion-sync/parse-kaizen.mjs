#!/usr/bin/env node
// ─── Parseur KAIZEN.md ─────────────────────────────────────────────────────
// Lit le fichier KAIZEN.md local et extrait la liste des blocs.
// Chaque bloc commence par `## Bloc N — Titre (YYYY-MM-DD)`.
// Le corps est structuré en sections préfixées `- **Problème** :`, `- **Solution** :`, etc.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..", "..");
const KAIZEN_PATH = resolve(ROOT, "KAIZEN.md");

const HEADING_RE = /^##\s+Bloc\s+(\d+)\s+—\s+(.+?)\s*(?:\((\d{4}-\d{2}-\d{2})\))?\s*$/;
const SECTION_RE = /^-\s+\*\*([^*]+)\*\*\s*:\s*(.*)$/;

/**
 * Parse KAIZEN.md et retourne la liste des blocs.
 * @returns {Array<{ number: number, title: string, date: string|null, sections: Record<string, string>, commits: string[] }>}
 */
export function parseKaizenBlocs(text = readFileSync(KAIZEN_PATH, "utf8")) {
  const lines = text.split("\n");
  const blocs = [];
  let current = null;

  for (const line of lines) {
    const m = line.match(HEADING_RE);
    if (m) {
      if (current) blocs.push(current);
      current = {
        number: Number(m[1]),
        title: m[2].trim(),
        date: m[3] ?? null,
        sections: {},
        commits: [],
      };
      continue;
    }
    if (!current) continue;

    const s = line.match(SECTION_RE);
    if (s) {
      const key = s[1].trim();
      const value = s[2].trim();
      current.sections[key] = value;
      // Si la section "Commit" existe, on extrait le(s) SHA court(s)
      if (key === "Commit" || key === "Commits") {
        const shas = value.match(/[0-9a-f]{7,40}/g);
        if (shas) current.commits.push(...shas);
      }
    }
  }
  if (current) blocs.push(current);
  return blocs;
}

// ─── CLI ───────────────────────────────────────────────────────────────────
if (import.meta.url === `file://${process.argv[1]}`) {
  const blocs = parseKaizenBlocs();
  console.log(`📚 ${blocs.length} blocs parsés depuis KAIZEN.md`);
  for (const b of blocs) {
    console.log(
      `  #${String(b.number).padStart(2, "0")} (${b.date ?? "?"}) ${b.title} — ${b.commits.length} commit(s)`,
    );
  }
}
