"use client";

import AppShell from "@/components/AppShell";

export default function LegalPage() {
  return (
    <AppShell title="Mentions légales" showBack>
      <div className="space-y-6 text-sm text-[var(--color-text-secondary)] leading-relaxed">
        {/* ─── Éditeur ─── */}
        <section>
          <h2 className="text-lg font-semibold text-[var(--color-text-primary)] mb-2">
            1. Éditeur du site
          </h2>
          <p>
            <strong>UrbanFlow Mobility</strong> — Projet académique de plateforme de mobilité multimodale.
          </p>
          <ul className="mt-2 space-y-1">
            <li>Type : Projet étudiant (T6 CDSD)</li>
            <li>Contact : <a href="mailto:contact@urbanflow.app" className="text-[var(--color-primary)] underline">contact@urbanflow.app</a></li>
            <li>Directeur de la publication : Le responsable du projet UrbanFlow Mobility</li>
          </ul>
        </section>

        {/* ─── Hébergeur ─── */}
        <section>
          <h2 className="text-lg font-semibold text-[var(--color-text-primary)] mb-2">
            2. Hébergeur
          </h2>
          <ul className="space-y-1">
            <li><strong>OVHcloud</strong></li>
            <li>OVH SAS, 2 rue Kellermann, 59100 Roubaix, France</li>
            <li>Infrastructure : VPS OVHcloud, datacenter européen (Roubaix/Gravelines)</li>
            <li>Site : <a href="https://www.ovhcloud.com/fr/" target="_blank" rel="noopener noreferrer" className="text-[var(--color-primary)] underline">ovhcloud.com</a></li>
          </ul>
        </section>

        {/* ─── Propriété intellectuelle ─── */}
        <section>
          <h2 className="text-lg font-semibold text-[var(--color-text-primary)] mb-2">
            3. Propriété intellectuelle
          </h2>
          <p>
            L&apos;ensemble des contenus du site (textes, images, logos, icônes) est la propriété d&apos;UrbanFlow Mobility
            ou fait l&apos;objet d&apos;une licence d&apos;utilisation.
          </p>
          <p className="mt-2">
            <strong>Cartographie</strong> : Les tuiles cartographiques sont fournies par{" "}
            <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer" className="text-[var(--color-primary)] underline">
              OpenStreetMap
            </a>{" "}
            et ses contributeurs, sous licence ODbL. Attribution requise conformément à la{" "}
            <a href="https://operations.osmfoundation.org/policies/tiles/" target="_blank" rel="noopener noreferrer" className="text-[var(--color-primary)] underline">
              politique d&apos;utilisation des tuiles OSM
            </a>.
          </p>
        </section>

        {/* ─── Sources de données ─── */}
        <section>
          <h2 className="text-lg font-semibold text-[var(--color-text-primary)] mb-2">
            4. Sources de données de transport
          </h2>
          <ul className="space-y-1">
            <li>
              <strong>PRIM Île-de-France Mobilités</strong> — Données de transport en Open Data (lignes, arrêts, GTFS, GTFS-RT)
              <br />
              <a href="https://prim.iledefrance-mobilites.fr" target="_blank" rel="noopener noreferrer" className="text-[var(--color-primary)] underline text-xs">
                prim.iledefrance-mobilites.fr
              </a>
            </li>
            <li>
              <strong>Open Data Paris</strong> — Stations Vélib&apos; Métropole
              <br />
              <a href="https://opendata.paris.fr" target="_blank" rel="noopener noreferrer" className="text-[var(--color-primary)] underline text-xs">
                opendata.paris.fr
              </a>
            </li>
            <li>
              <strong>PRIM / JCDecaux</strong> — Disponibilité temps réel Vélib&apos;
            </li>
            <li>
              <strong>OSRM</strong> — Calcul d&apos;itinéraires piéton/vélo/voiture
              <br />
              <a href="https://project-osrm.org" target="_blank" rel="noopener noreferrer" className="text-[var(--color-primary)] underline text-xs">
                project-osrm.org
              </a>
            </li>
            <li>
              <strong>data.gouv.fr</strong> — Géocodage d&apos;adresses
            </li>
          </ul>
        </section>

        {/* ─── Facteurs d'émission CO₂ ─── */}
        <section>
          <h2 className="text-lg font-semibold text-[var(--color-text-primary)] mb-2">
            5. Facteurs d&apos;émission CO₂
          </h2>
          <p>
            Les calculs d&apos;empreinte carbone utilisent les facteurs d&apos;émission de l&apos;{" "}
            <a href="https://www.bilans-ges.ademe.fr" target="_blank" rel="noopener noreferrer" className="text-[var(--color-primary)] underline">
              ADEME Base Carbone
            </a>{" "}
            (gCO₂/km/passager).
          </p>
        </section>

        {/* ─── Services optionnels (notifications, badges) ─── */}
        <section>
          <h2 className="text-lg font-semibold text-[var(--color-text-primary)] mb-2">
            6. Services optionnels
          </h2>
          <ul className="space-y-1">
            <li>
              <strong>Notifications push</strong> (Web Push / VAPID) — envoyées
              uniquement avec ton consentement explicite, pour les perturbations
              sur tes lignes suivies, les rappels de départ, ton récap hebdomadaire
              et tes succès débloqués. Désactivables à tout moment depuis le profil.
            </li>
            <li>
              <strong>Succès (badges)</strong> — attribués selon ton usage de
              l&apos;application (nombre de trajets, CO₂ économisé, favoris).
              Consultables et effacés avec ton compte.
            </li>
          </ul>
        </section>

        {/* ─── Limitation de responsabilité ─── */}
        <section>
          <h2 className="text-lg font-semibold text-[var(--color-text-primary)] mb-2">
            7. Limitation de responsabilité
          </h2>
          <p>
            UrbanFlow Mobility est un projet académique. Les informations de transport sont fournies à titre indicatif
            et ne sauraient se substituer aux informations officielles des opérateurs de transport.
            L&apos;application ne garantit pas l&apos;exactitude des horaires, la disponibilité des véhicules
            ou l&apos;absence de perturbations.
          </p>
        </section>

        {/* ─── Contact ─── */}
        <section>
          <h2 className="text-lg font-semibold text-[var(--color-text-primary)] mb-2">
            8. Contact
          </h2>
          <ul className="space-y-1">
            <li>Questions générales : <a href="mailto:contact@urbanflow.app" className="text-[var(--color-primary)] underline">contact@urbanflow.app</a></li>
            <li>Données personnelles : <a href="mailto:privacy@urbanflow.app" className="text-[var(--color-primary)] underline">privacy@urbanflow.app</a></li>
          </ul>
        </section>

        <p className="text-xs text-[var(--color-text-tertiary)]">
          Dernière mise à jour : 3 septembre 2026
        </p>
      </div>
    </AppShell>
  );
}