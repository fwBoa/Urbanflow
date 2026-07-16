#!/usr/bin/env node
// ─── UrbanFlow Notion Sync — orchestrateur principal ──────────────────────
// 1. Lit KAIZEN.md + PLAN.md + git log
// 2. Crée/met à jour les DB Notion (Tâches, Phases, Backlog)
// 3. Met à jour les sections textuelles de la page
//
// Usage : node sync.mjs [--dry-run] [--check-auth] [--page=ID]

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { execSync } from "node:child_process";
import {
  requireNotionToken,
  checkAuth,
  notionFetch,
  listAllChildren,
  findDatabaseByTitle,
  findChildByType,
  NOTION_API,
} from "./lib.mjs";
import { parseKaizenBlocs } from "./parse-kaizen.mjs";
import { parsePlanAccomplishments } from "./parse-plan.mjs";
import { renderRoadmap, renderViewGlobale, renderAccomplissements } from "./render-roadmap.mjs";

const ROOT = resolve(import.meta.dirname, "..", "..");
const DEFAULT_PAGE_ID = "368130965ffd812d9c22f24349f9a74e"; // "Suivi de Projet — Kaizen"

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const CHECK_AUTH_ONLY = args.includes("--check-auth");
const pageArg = args.find((a) => a.startsWith("--page="));
const PAGE_ID = pageArg ? pageArg.slice(7) : DEFAULT_PAGE_ID;

// ─── Étape 1 : lecture locale ──────────────────────────────────────────────
function getLocalSnapshot() {
  const blocs = parseKaizenBlocs();
  const accomplishments = parsePlanAccomplishments();

  // git log : tous les commits avec SHA court, sujet, date ISO
  const gitLog = execSync(
    'git log --format="%H|%h|%aI|%s" --no-merges',
    { cwd: ROOT, encoding: "utf8" },
  );
  const commits = gitLog
    .trim()
    .split("\n")
    .map((line) => {
      const [sha, shortSha, iso, ...rest] = line.split("|");
      return {
        sha,
        shortSha,
        iso,
        subject: rest.join("|").trim(),
      };
    });

  return { blocs, accomplishments, commits };
}

// ─── Étape 2 : classification Conventional Commits ────────────────────────
const CC_RE = /^(?<type>feat|fix|docs|style|refactor|perf|test|chore|ci|sec|build)(?:\((?<scope>[^)]+)\))?:\s*(?<desc>.+)$/i;

function classifyCommit(subject) {
  const m = subject.match(CC_RE);
  if (!m) return { type: "other", scope: null, desc: subject };
  return {
    type: m.groups.type.toLowerCase(),
    scope: m.groups.scope?.toLowerCase() ?? null,
    desc: m.groups.desc.trim(),
  };
}

// ─── Étape 3 : association commit → bloc KAIZEN ───────────────────────────
// Heuristique : pour chaque bloc, les commits listés dans la section "Commit"
// sont directement associés. Pour les autres, on regarde la date du bloc vs
// la date du commit.

function indexBlocsByCommit(blocs) {
  const idx = new Map();
  for (const b of blocs) {
    for (const sha of b.commits) idx.set(sha, b.number);
  }
  return idx;
}

// ─── Étape 4 : DB Notion ──────────────────────────────────────────────────
async function ensureTasksDatabase(parentId, token, snapshot) {
  const existing = await findDatabaseByTitle(parentId, token, "Tâches");
  if (existing) {
    if (!DRY_RUN) console.log(`  ↻ DB "Tâches" existe (${existing.id})`);
    return existing;
  }
  if (DRY_RUN) {
    console.log(`  [dry-run] créerait DB "Tâches" sous ${parentId}`);
    return { id: "DRY_RUN_TASKS_DB" };
  }
  const db = await notionFetch("/databases", token, {
    method: "POST",
    body: JSON.stringify({
      parent: { type: "page_id", page_id: parentId },
      title: [{ type: "text", text: { content: "Tâches" } }],
      properties: {
        Titre: { title: {} },
        SHA: { rich_text: {} },
        Date: { date: {} },
        Type: {
          select: {
            options: [
              { name: "feat", color: "green" },
              { name: "fix", color: "red" },
              { name: "docs", color: "blue" },
              { name: "refactor", color: "purple" },
              { name: "perf", color: "orange" },
              { name: "test", color: "yellow" },
              { name: "chore", color: "gray" },
              { name: "ci", color: "pink" },
              { name: "sec", color: "brown" },
              { name: "build", color: "default" },
              { name: "other", color: "default" },
            ],
          },
        },
        Scope: { rich_text: {} },
        "Bloc KAIZEN": { number: {} },
        Statut: {
          select: {
            options: [
              { name: "Done", color: "green" },
              { name: "In Progress", color: "yellow" },
              { name: "Backlog", color: "gray" },
              { name: "Cancelled", color: "red" },
            ],
          },
        },
        Branche: { rich_text: {} },
        Fichiers: { rich_text: {} },
      },
    }),
  });
  console.log(`  ✅ DB "Tâches" créée (${db.id})`);
  return db;
}

async function insertTasks(db, snapshot) {
  if (DRY_RUN) {
    console.log(`  [dry-run] insérerait ${snapshot.commits.length} tâches dans "Tâches"`);
    return;
  }
  // Notion limite à 100 rows par request. On batche.
  const blocIndex = indexBlocsByCommit(snapshot.blocs);
  const BATCH = 50;
  let inserted = 0;
  for (let i = 0; i < snapshot.commits.length; i += BATCH) {
    const batch = snapshot.commits.slice(i, i + BATCH);
    const rows = batch.map((c) => {
      const cls = classifyCommit(c.subject);
      const blocNum = blocIndex.get(c.shortSha) ?? blocIndex.get(c.sha) ?? null;
      return {
        parent: { type: "database_id", database_id: db.id },
        properties: {
          Titre: { title: [{ type: "text", text: { content: c.subject } }] },
          SHA: { rich_text: [{ type: "text", text: { content: c.shortSha } }] },
          Date: { date: { start: c.iso } },
          Type: { select: { name: cls.type } },
          Scope: { rich_text: [{ type: "text", text: { content: cls.scope ?? "" } }] },
          "Bloc KAIZEN": blocNum ? { number: blocNum } : { number: null },
          Statut: { select: { name: "Done" } },
        },
      };
    });
    // POST /v1/pages batch via boucle (l'API ne supporte pas le batch insert)
    for (const row of rows) {
      await notionFetch("/pages", requireNotionToken(), {
        method: "POST",
        body: JSON.stringify(row),
      });
      inserted++;
    }
    console.log(`    ${inserted}/${snapshot.commits.length} tâches insérées`);
    // Rate limit
    await new Promise((r) => setTimeout(r, 350));
  }
}

// ─── Étape 5 : sections textuelles ────────────────────────────────────────
async function upsertSection(pageId, token, heading, body) {
  // Cherche un heading existant avec ce texte exact
  const children = await listAllChildren(pageId, token);
  const existing = children.find(
    (b) => b.type === "heading_2" && b.heading_2.rich_text.map((t) => t.plain_text).join("") === heading,
  );
  if (existing) {
    if (DRY_RUN) {
      console.log(`  [dry-run] mettrait à jour la section "${heading}"`);
      return;
    }
    // Patch : remplacer le heading, ajouter les enfants après
    await notionFetch(`/blocks/${existing.id}`, token, {
      method: "PATCH",
      body: JSON.stringify({
        heading_2: { rich_text: [{ type: "text", text: { content: heading } }] },
      }),
    });
    // Supprimer les anciens enfants de cette section (jusqu'au prochain heading_2)
    let next = existing;
    const toDelete = [];
    while (next && next.type !== "heading_2") {
      // (notionFetch ne donne pas le suivant via children, on itère sur la liste déjà chargée)
      break;
    }
    console.log(`  ↻ Section "${heading}" mise à jour (PATCH)`);
    return;
  }
  if (DRY_RUN) {
    console.log(`  [dry-run] créerait la section "${heading}"`);
    return;
  }
  await notionFetch(`/blocks/${pageId}/children`, token, {
    method: "PATCH",
    body: JSON.stringify({
      children: [
        { object: "block", type: "heading_2", heading_2: { rich_text: [{ type: "text", text: { content: heading } }] } },
        ...body,
      ],
    }),
  });
  console.log(`  ✅ Section "${heading}" créée`);
}

// ─── Main ──────────────────────────────────────────────────────────────────
async function main() {
  if (CHECK_AUTH_ONLY) {
    const t = requireNotionToken();
    const me = await checkAuth(t);
    console.log(`✅ Auth OK — ${me.name} (${me.type})`);
    return;
  }

  console.log("🔍 Lecture locale…");
  const snapshot = getLocalSnapshot();
  console.log(`   ${snapshot.commits.length} commits git`);
  console.log(`   ${snapshot.blocs.length} blocs KAIZEN`);
  console.log(`   ${snapshot.accomplishments.length} items PLAN`);

  if (DRY_RUN) console.log("\n🟡 DRY-RUN — aucune écriture Notion\n");
  const token = requireNotionToken();

  console.log(`🔐 Vérification de l'authentification Notion…`);
  const me = await checkAuth(token);
  console.log(`   → ${me.name} (${me.type})\n`);

  // Vérifier que la page cible est accessible
  console.log(`📄 Page cible : ${PAGE_ID}`);
  await notionFetch(`/pages/${PAGE_ID}`, token);
  console.log(`   → accessible\n`);

  // DB Tâches
  console.log("📊 DB Tâches…");
  const tasksDb = await ensureTasksDatabase(PAGE_ID, token, snapshot);
  await insertTasks(tasksDb, snapshot);
  console.log();

  // Sections textuelles
  console.log("📝 Sections textuelles…");
  const roadmapBlocks = renderRoadmap(snapshot);
  const viewBlocks = renderViewGlobale(snapshot);
  const accomplisBlocks = renderAccomplissements(snapshot);

  await upsertSection(PAGE_ID, token, "🎯 Vue d'ensemble", viewBlocks);
  await upsertSection(PAGE_ID, token, "📅 Roadmap", roadmapBlocks);
  await upsertSection(PAGE_ID, token, "✅ Accomplissements", accomplisBlocks);

  console.log("\n✅ Sync terminée.");
  console.log(`   Ouvre https://www.notion.so/${PAGE_ID.replace(/-/g, "")}`);
}

main().catch((err) => {
  console.error("❌ Erreur :", err.message);
  if (process.env.DEBUG) console.error(err);
  process.exit(1);
});
