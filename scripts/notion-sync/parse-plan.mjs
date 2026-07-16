#!/usr/bin/env node
// ─── Parseur PLAN.md ──────────────────────────────────────────────────────
// Lit le tableau d'accomplissements (## Accomplissements récents).
// Chaque ligne : `| # | Tâche | Fichiers | Statut |`

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..", "..");
const PLAN_PATH = resolve(ROOT, "PLAN.md");

const TABLE_HEADER_RE = /^\|\s*#\s*\|\s*Tâche\s*\|\s*Fichiers modifiés\s*\|\s*Statut\s*\|\s*$/;
const ROW_RE = /^\|\s*(\d+)\s*\|\s*(.+?)\s*\|\s*(.+?)\s*\|\s*(.+?)\s*\|\s*$/;

/**
 * Parse le tableau d'accomplissements du PLAN.md.
 * @returns {Array<{ number: number, task: string, files: string, status: string, blocRef: string|null }>}
 */
export function parsePlanAccomplishments(text = readFileSync(PLAN_PATH, "utf8")) {
  const lines = text.split("\n");
  const items = [];
  let inTable = false;

  for (const line of lines) {
    if (TABLE_HEADER_RE.test(line)) {
      inTable = true;
      continue;
    }
    if (!inTable) continue;

    // Ligne séparateur (|---|---|...)
    if (/^\|[-\s|]+\|$/.test(line)) continue;

    // Fin du tableau (ligne vide ou autre heading)
    if (line.trim() === "" || line.startsWith("#")) {
      inTable = false;
      continue;
    }

    const m = line.match(ROW_RE);
    if (m) {
      const status = m[4].trim();
      const blocMatch = status.match(/Bloc\s+(\d+)/i);
      items.push({
        number: Number(m[1]),
        task: m[2].trim(),
        files: m[3].trim(),
        status,
        blocRef: blocMatch ? Number(blocMatch[1]) : null,
      });
    }
  }
  return items;
}

// ─── CLI ───────────────────────────────────────────────────────────────────
if (import.meta.url === `file://${process.argv[1]}`) {
  const items = parsePlanAccomplishments();
  console.log(`📋 ${items.length} items d'accomplissement parsés depuis PLAN.md`);
  for (const it of items.slice(-5)) {
    console.log(`  #${it.number} [Bloc ${it.blocRef ?? "?"}] ${it.task.slice(0, 80)}…`);
  }
}
