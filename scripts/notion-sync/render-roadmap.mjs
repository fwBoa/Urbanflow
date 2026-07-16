#!/usr/bin/env node
// ─── Renderers markdown → blocs Notion (esprit Kaizen) ────────────────────
// Kaizen = documentation de l'amélioration continue, pas une todo list.
// - Pas de "to_do" cases à cocher (l'historique est dans git, pas dans des checkbox)
// - Métriques factuelles, pas de "weekly review"
// - Sections alignées sur KAIZEN.md / PLAN.md, pas sur un second brain

/**
 * Section "🎯 Vue d'ensemble" : bilan + métriques factuelles.
 */
export function renderViewGlobale(snapshot) {
  const nbCommits = snapshot.commits.length;
  const nbBlocs = snapshot.blocs.length;
  const nbItems = snapshot.accomplishments.length;
  const lastCommit = snapshot.commits[0];
  const firstCommit = snapshot.commits[snapshot.commits.length - 1];
  return [
    {
      object: "block",
      type: "callout",
      callout: {
        rich_text: [
          {
            type: "text",
            text: {
              content:
                `Projet UrbanFlow — ${nbCommits} commits, ${nbBlocs} blocs KAIZEN, ${nbItems} items PLAN.\n` +
                `Dernier commit : ${lastCommit?.shortSha ?? "?"} (${lastCommit?.subject ?? "?"}).\n` +
                `Premier commit : ${firstCommit?.iso?.slice(0, 10) ?? "?"}.`,
            },
          },
        ],
        icon: { type: "emoji", emoji: "📊" },
        color: "blue_background",
      },
    },
    {
      object: "block",
      type: "heading_3",
      heading_3: { rich_text: [{ type: "text", text: { content: "Métriques" } }] },
    },
    {
      object: "block",
      type: "bulleted_list_item",
      bulleted_list_item: { rich_text: [{ type: "text", text: { content: `Commits : ${nbCommits}` } }] },
    },
    {
      object: "block",
      type: "bulleted_list_item",
      bulleted_list_item: { rich_text: [{ type: "text", text: { content: `Blocs KAIZEN : ${nbBlocs} (1-${nbBlocs})` } }] },
    },
    {
      object: "block",
      type: "bulleted_list_item",
      bulleted_list_item: { rich_text: [{ type: "text", text: { content: `Items PLAN : ${nbItems}` } }] },
    },
    {
      object: "block",
      type: "bulleted_list_item",
      bulleted_list_item: {
        rich_text: [{ type: "text", text: { content: "App en prod : https://urbanflow-mobility.fr" } }],
      },
    },
  ];
}

/**
 * Section "📅 Roadmap" : phases datées sous forme de liste descriptive.
 * Statut = label textuel, pas de checkbox (l'historique des statuts est dans git).
 */
export function renderRoadmap(snapshot) {
  const phases = [
    { n: "1", title: "Nettoyage code mort", statut: "✅ Terminée" },
    { n: "1.5", title: "Bugs UX (mocks, filtre cheap)", statut: "✅ Terminée" },
    { n: "1.6", title: "Scope géographique Paris", statut: "✅ Terminée" },
    { n: "1.7", title: "Doc recherche d'adresses", statut: "✅ Terminée" },
    { n: "1.8", title: "Optimisation GTFS bounding box", statut: "✅ Terminée" },
    { n: "1.9", title: "Position GPS hors zone", statut: "✅ Terminée" },
    { n: "1.10", title: "GTFS PostgreSQL + reload atomique", statut: "✅ Terminée" },
    { n: "2", title: "Qualité des résultats (RAPTOR + alertes)", statut: "✅ Terminée" },
    { n: "3", title: "UX & Navigation", statut: "✅ Terminée" },
    { n: "4", title: "PWA & Offline", statut: "✅ Terminée" },
    { n: "5", title: "Tests & Documentation finale", statut: "✅ Terminée" },
    { n: "6", title: "Bugfix UX / Admin / Notifications / PWA", statut: "✅ Terminée" },
    { n: "7", title: "Audit de sécurité et durcissement", statut: "✅ Terminée" },
    { n: "8", title: "Déploiement production OVH", statut: "✅ Terminée" },
    { n: "9", title: "Maintenance post-rendu", statut: "🔄 En cours" },
  ];
  return phases.map((p) => ({
    object: "block",
    type: "bulleted_list_item",
    bulleted_list_item: {
      rich_text: [
        { type: "text", text: { content: `Phase ${p.n} — ${p.title} — ${p.statut}` } },
      ],
    },
  }));
}

/**
 * Section "✅ Accomplissements" : 5 derniers items du PLAN.md.
 */
export function renderAccomplissements(snapshot) {
  const last5 = snapshot.accomplishments.slice(-5);
  return last5.map((it) => ({
    object: "block",
    type: "bulleted_list_item",
    bulleted_list_item: {
      rich_text: [
        {
          type: "text",
          text: {
            content: `Bloc ${it.blocRef ?? "?"} — ${it.task.slice(0, 120)}${it.task.length > 120 ? "…" : ""}`,
          },
        },
      ],
    },
  }));
}
