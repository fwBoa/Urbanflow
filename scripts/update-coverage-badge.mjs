#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// Génère un badge SVG de couverture de tests à partir du summary Jest.
// Usage:
//   node scripts/update-coverage-badge.mjs [input.json] [output.svg]
// Défauts : apps/backend/coverage/coverage-summary.json → badge/coverage-backend.svg
// ─────────────────────────────────────────────────────────────────────────────

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const inputPath = resolve(root, process.argv[2] || 'apps/backend/coverage/coverage-summary.json');
const outputPath = resolve(root, process.argv[3] || 'badge/coverage-backend.svg');

const summary = JSON.parse(readFileSync(inputPath, 'utf8'));
const pct = summary.total?.lines?.pct ?? summary.total?.statements?.pct ?? 0;

function colorFor(value) {
  if (value < 50) return '#e05d44';
  if (value < 70) return '#dfb317';
  if (value < 80) return '#a4a61d';
  return '#4c1';
}

const color = colorFor(pct);
const label = 'coverage';
const valueText = `${pct.toFixed(1)}%`;

const labelWidth = 70;
const valueWidth = 54;
const totalWidth = labelWidth + valueWidth;

const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth}" height="20" role="img" aria-label="${label}: ${valueText}">
  <title>${label}: ${valueText}</title>
  <g shape-rendering="crispEdges">
    <rect width="${labelWidth}" height="20" fill="#555"/>
    <rect x="${labelWidth}" width="${valueWidth}" height="20" fill="${color}"/>
  </g>
  <g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" font-size="11">
    <text x="${labelWidth / 2}" y="14">${label}</text>
    <text x="${labelWidth + valueWidth / 2}" y="14">${valueText}</text>
  </g>
</svg>
`;

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, svg, 'utf8');
console.log(`Coverage badge: ${valueText} → ${outputPath}`);
