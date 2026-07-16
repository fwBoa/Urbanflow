#!/usr/bin/env node
// ─── UrbanFlow Notion Sync — helpers HTTP ────────────────────────────────
// Lit le token depuis ~/.config/notion/token ou NOTION_TOKEN (env).
// Ne touche jamais au repo. Le token reste en dehors du code.

import { readFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const TOKEN_PATHS = [
  join(homedir(), ".config", "notion", "token"),
  join(homedir(), ".notion", "token"),
];

const NOTION_API = "https://api.notion.com/v1";
const NOTION_VERSION = "2022-06-28";

/**
 * Lit le token Notion depuis le fichier local ou l'env.
 * Ne throw pas : retourne null si introuvable.
 */
export function readNotionToken() {
  if (process.env.NOTION_TOKEN) return process.env.NOTION_TOKEN.trim();
  for (const p of TOKEN_PATHS) {
    if (existsSync(p)) {
      return readFileSync(p, "utf8").trim();
    }
  }
  return null;
}

export function requireNotionToken() {
  const t = readNotionToken();
  if (!t) {
    console.error("❌ Token Notion introuvable.");
    console.error("   Setup :");
    console.error("     mkdir -p ~/.config/notion");
    console.error("     echo 'ntn_...' > ~/.config/notion/token");
    console.error("     chmod 600 ~/.config/notion/token");
    console.error("   Et ajoute l'intégration à la page Notion cible.");
    process.exit(2);
  }
  if (!t.startsWith("ntn_")) {
    console.error("❌ Token Notion invalide (doit commencer par 'ntn_').");
    process.exit(2);
  }
  return t;
}

/**
 * Wrapper fetch pour l'API Notion. Retry une fois sur 429 (rate limit).
 */
export async function notionFetch(path, token, options = {}) {
  const url = `${NOTION_API}${path}`;
  const headers = {
    Authorization: `Bearer ${token}`,
    "Notion-Version": NOTION_VERSION,
    "Content-Type": "application/json",
    ...(options.headers ?? {}),
  };

  const doFetch = () => fetch(url, { ...options, headers });

  let res = await doFetch();
  if (res.status === 429) {
    const wait = Number(res.headers.get("Retry-After") ?? "1") * 1000;
    console.warn(`⏳ Rate limit Notion — pause ${wait}ms`);
    await new Promise((r) => setTimeout(r, wait));
    res = await doFetch();
  }
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Notion API ${res.status} ${res.statusText} : ${body}`);
  }
  return res.json();
}

/**
 * Auth check : appelle GET /v1/users/me.
 */
export async function checkAuth(token) {
  const me = await notionFetch("/users/me", token);
  return me;
}

/**
 * Liste tous les enfants d'un bloc (page ou parent). Suit la pagination.
 */
export async function listAllChildren(blockId, token) {
  const out = [];
  let cursor = undefined;
  do {
    const qs = cursor ? `?start_cursor=${cursor}&page_size=100` : "?page_size=100";
    const data = await notionFetch(`/blocks/${blockId}/children${qs}`, token);
    out.push(...data.results);
    cursor = data.has_more ? data.next_cursor : undefined;
  } while (cursor);
  return out;
}

/**
 * Cherche récursivement un bloc enfant par type (ex: child_database).
 * Retourne le premier match ou null.
 */
export async function findChildByType(parentId, token, type) {
  const children = await listAllChildren(parentId, token);
  return children.find((b) => b.type === type) ?? null;
}

/**
 * Cherche une database enfant par son titre.
 */
export async function findDatabaseByTitle(parentId, token, title) {
  const children = await listAllChildren(parentId, token);
  for (const child of children) {
    if (child.type !== "child_database") continue;
    const db = await notionFetch(`/databases/${child.id}`, token);
    const titleText = (db.title ?? [])
      .map((t) => t.plain_text)
      .join("")
      .trim();
    if (titleText === title) return db;
  }
  return null;
}

export { NOTION_API, NOTION_VERSION };
