"use client";

import AppShell from "@/components/AppShell";

export default function PrivacyPage() {
  return (
    <AppShell title="Politique de confidentialité" showBack>
      <div className="space-y-6 text-sm text-[var(--color-text-secondary)] leading-relaxed">
        {/* ─── Identité du responsable ─── */}
        <section>
          <h2 className="text-lg font-semibold text-[var(--color-text-primary)] mb-2">
            1. Responsable du traitement
          </h2>
          <p>
            <strong>UrbanFlow Mobility</strong> — plateforme de mobilité multimodale.
          </p>
          <p>
            Contact : <a href="mailto:jeandavidzamblezie@outlook.fr" className="text-[var(--color-primary)] underline">jeandavidzamblezie@outlook.fr</a>
          </p>
        </section>

        {/* ─── Données collectées ─── */}
        <section>
          <h2 className="text-lg font-semibold text-[var(--color-text-primary)] mb-2">
            2. Données personnelles collectées
          </h2>
          <p>
            Conformément au principe de minimisation (RGPD art. 5.1.c), nous ne collectons que les données strictement nécessaires :
          </p>
          <div className="overflow-x-auto mt-2">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b border-[var(--color-border)]">
                  <th className="text-left py-2 pr-2">Donnée</th>
                  <th className="text-left py-2 pr-2">Finalité</th>
                  <th className="text-left py-2 pr-2">Base légale</th>
                  <th className="text-left py-2">Durée</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                <tr>
                  <td className="py-2 pr-2">Géolocalisation</td>
                  <td className="py-2 pr-2">Calcul d&apos;itinéraire</td>
                  <td className="py-2 pr-2">Consentement (art. 6.1.a)</td>
                  <td className="py-2">Session uniquement</td>
                </tr>
                <tr>
                  <td className="py-2 pr-2">Adresse e-mail</td>
                  <td className="py-2 pr-2">Création de compte</td>
                  <td className="py-2 pr-2">Exécution du contrat (art. 6.1.b)</td>
                  <td className="py-2">Durée du compte + 30j</td>
                </tr>
                <tr>
                  <td className="py-2 pr-2">Mot de passe (haché)</td>
                  <td className="py-2 pr-2">Authentification</td>
                  <td className="py-2 pr-2">Exécution du contrat (art. 6.1.b)</td>
                  <td className="py-2">Durée du compte</td>
                </tr>
                <tr>
                  <td className="py-2 pr-2">Favoris</td>
                  <td className="py-2 pr-2">Personnalisation</td>
                  <td className="py-2 pr-2">Consentement (art. 6.1.a)</td>
                  <td className="py-2">Durée du compte</td>
                </tr>
                <tr>
                  <td className="py-2 pr-2">Historique de recherche</td>
                  <td className="py-2 pr-2">Recommandations</td>
                  <td className="py-2 pr-2">Consentement (art. 6.1.a)</td>
                  <td className="py-2">90 jours</td>
                </tr>
                <tr>
                  <td className="py-2 pr-2">Logs de navigation</td>
                  <td className="py-2 pr-2">Sécurité et debug</td>
                  <td className="py-2 pr-2">Intérêt légitime (art. 6.1.f)</td>
                  <td className="py-2">6 mois</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* ─── Consentement ─── */}
        <section>
          <h2 className="text-lg font-semibold text-[var(--color-text-primary)] mb-2">
            3. Recueil du consentement
          </h2>
          <ul className="list-disc list-inside space-y-1">
            <li><strong>Géolocalisation</strong> : bannière explicite au premier accès. Refus possible, l&apos;application reste utilisable.</li>
            <li><strong>Compte utilisateur</strong> : case à cocher non pré-cochée pour les CGU et la politique de confidentialité.</li>
            <li><strong>Cookies</strong> : bannière avec choix granulaire (nécessaires, fonctionnels, analytiques).</li>
          </ul>
          <p className="mt-2">
            Chaque consentement est enregistré avec la date, l&apos;horodatage et la version de la politique.
          </p>
        </section>

        {/* ─── Droits ─── */}
        <section>
          <h2 className="text-lg font-semibold text-[var(--color-text-primary)] mb-2">
            4. Vos droits (RGPD art. 15-22)
          </h2>
          <div className="overflow-x-auto mt-2">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b border-[var(--color-border)]">
                  <th className="text-left py-2 pr-2">Droit</th>
                  <th className="text-left py-2">Mise en œuvre</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                <tr>
                  <td className="py-2 pr-2">Droit d&apos;accès (art. 15)</td>
                  <td className="py-2">Page Profil → Consulter mes données</td>
                </tr>
                <tr>
                  <td className="py-2 pr-2">Droit de rectification (art. 16)</td>
                  <td className="py-2">Page Profil → Modifier mes informations</td>
                </tr>
                <tr>
                  <td className="py-2 pr-2">Droit à l&apos;effacement (art. 17)</td>
                  <td className="py-2">Page Profil → Supprimer mon compte</td>
                </tr>
                <tr>
                  <td className="py-2 pr-2">Droit à la portabilité (art. 20)</td>
                  <td className="py-2">Page Profil → Exporter mes données (JSON)</td>
                </tr>
                <tr>
                  <td className="py-2 pr-2">Droit d&apos;opposition (art. 21)</td>
                  <td className="py-2">Désactiver les recommandations et l&apos;historique</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="mt-2">
            Délai de réponse : 30 jours conformément à l&apos;article 12 du RGPD.
          </p>
        </section>

        {/* ─── Sous-traitants ─── */}
        <section>
          <h2 className="text-lg font-semibold text-[var(--color-text-primary)] mb-2">
            5. Sous-traitants
          </h2>
          <ul className="list-disc list-inside space-y-1">
            <li><strong>OVH</strong> (hébergeur VPS) — données sur serveurs en UE, DPA disponible</li>
            <li><strong>OpenStreetMap</strong> (cartographie) — aucune donnée personnelle transmise</li>
            <li><strong>PRIM / IDF Mobilités</strong> (données transport) — API publiques Open Data</li>
          </ul>
          <p className="mt-2">Aucun transfert hors UE.</p>
        </section>

        {/* ─── Sécurité ─── */}
        <section>
          <h2 className="text-lg font-semibold text-[var(--color-text-primary)] mb-2">
            6. Mesures de sécurité
          </h2>
          <ul className="list-disc list-inside space-y-1">
            <li>Chiffrement en transit (HTTPS obligatoire, HSTS)</li>
            <li>Mots de passe hachés (bcrypt, 12 rounds)</li>
            <li>Headers de sécurité (CSP, X-Frame-Options, X-Content-Type-Options)</li>
            <li>Rate limiting sur les endpoints sensibles</li>
            <li>Validation des entrées côté serveur</li>
            <li>Minimisation des logs (pas d&apos;IP ni d&apos;identifiant personnel)</li>
          </ul>
        </section>

        {/* ─── Cookies ─── */}
        <section>
          <h2 className="text-lg font-semibold text-[var(--color-text-primary)] mb-2">
            7. Cookies
          </h2>
          <ul className="list-disc list-inside space-y-1">
            <li><strong>Nécessaires</strong> : session JWT (httpOnly, secure) — exemptés de consentement</li>
            <li><strong>Fonctionnels</strong> : préférences de géolocalisation — consentement requis</li>
            <li><strong>Analytiques</strong> : désactivés par défaut</li>
          </ul>
        </section>

        {/* ─── Modifications ─── */}
        <section>
          <h2 className="text-lg font-semibold text-[var(--color-text-primary)] mb-2">
            8. Modifications
          </h2>
          <p>
            En cas de modification de cette politique, vous serez notifié in-app et par e-mail.
            La date de dernière mise à jour est indiquée ci-dessous.
          </p>
          <p className="mt-2 text-xs text-[var(--color-text-tertiary)]">
            Dernière mise à jour : 10 juillet 2026 — Version 1.1
          </p>
        </section>
      </div>
    </AppShell>
  );
}