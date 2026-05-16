import { Injectable, Logger } from '@nestjs/common';

/**
 * Facteurs d'émission CO2 par mode de transport (gCO2/km/passager)
 * Source : ADEME — Base Carbone v2024
 * https://base-empreinte.ademe.fr/
 *
 * Ces facteurs sont des moyennes pour l'Île-de-France.
 * Ils incluent l'énergie de traction + l'infrastructure.
 */
const ADEME_EMISSION_FACTORS: Record<string, number> = {
  // Métro
  metro: 3.8,
  // RER / Transilien (train régional)
  rer: 5.2,
  transilien: 5.2,
  train: 5.2,
  // Tramway
  tram: 3.2,
  tramway: 3.2,
  // Bus
  bus: 95.0,
  // Bus électrique
  bus_electrique: 30.0,
  // Trolleybus
  trolleybus: 25.0,
  // Vélib' (vélo mécanique)
  velib_mecanique: 0,
  // Vélib' électrique
  velib_electrique: 5.0,
  // Marche à pied
  marche: 0,
  // Voiture (moyenne IDF, 1 passager)
  voiture: 170.0,
  // Covoiturage (2 passagers)
  covoiturage: 85.0,
  // Trottinette électrique en libre-service
  trottinette_electrique: 35.0,
  // Funiviaire
  funiculaire: 10.0,
  // Navette fluviale
  navette_fluviale: 15.0,
};

/**
 * Mapping des route_type GTFS vers les modes ADEME
 * Référence GTFS : https://gtfs.org/documentation/schedule/reference/#routestxt
 */
const GTFS_ROUTE_TYPE_TO_MODE: Record<number, string> = {
  0: 'tram',        // Tramway
  1: 'metro',       // Subway/Metro
  2: 'train',       // Rail (RER/Transilien)
  3: 'bus',         // Bus
  4: 'navette_fluviale', // Ferry
  5: 'trolleybus',  // Cable tram
  6: 'trolleybus',  // Gondola
  7: 'funiculaire', // Funicular
};

/**
 * Résultat du calcul carbone
 */
export interface CarbonResult {
  /** Mode de transport */
  mode: string;
  /** Distance en km */
  distanceKm: number;
  /** Émissions en gCO2 */
  emissionsGco2: number;
  /** Facteur d'émission utilisé (gCO2/km/passager) */
  factor: number;
  /** Source du facteur */
  source: string;
}

/**
 * Comparaison carbone entre deux modes
 */
export interface CarbonComparison {
  /** Mode de référence (ex: voiture) */
  referenceMode: string;
  /** Mode comparé (ex: métro) */
  comparedMode: string;
  /** Économie en gCO2 */
  savedGco2: number;
  /** Pourcentage d'économie */
  savedPercent: number;
  /** Équivalence en km de voiture */
  carKmEquivalent: number;
}

/**
 * Service de calcul d'empreinte carbone
 *
 * Utilise les facteurs d'émission ADEME (Base Carbone)
 * pour calculer l'impact CO2 des trajets.
 *
 * Compense le manque du champ `co2_emission` de Navitia
 * en implémentant un calcul local basé sur :
 * - Le mode de transport (GTFS route_type)
 * - La distance parcourue
 * - Les facteurs ADEME à jour
 */
@Injectable()
export class CarbonService {
  private readonly logger = new Logger(CarbonService.name);

  /**
   * Calcule l'empreinte carbone d'un trajet
   */
  calculateEmissions(
    mode: string,
    distanceKm: number,
  ): CarbonResult {
    const factor = this.getEmissionFactor(mode);

    return {
      mode,
      distanceKm: Math.round(distanceKm * 100) / 100,
      emissionsGco2: Math.round(factor * distanceKm * 100) / 100,
      factor,
      source: 'ADEME Base Carbone v2024',
    };
  }

  /**
   * Calcule l'empreinte carbone à partir d'un route_type GTFS
   */
  calculateFromGtfsRouteType(
    routeType: number,
    distanceKm: number,
  ): CarbonResult {
    const mode = GTFS_ROUTE_TYPE_TO_MODE[routeType] || 'bus';
    return this.calculateEmissions(mode, distanceKm);
  }

  /**
   * Compare deux modes de transport sur le même trajet
   */
  compareModes(
    referenceMode: string,
    comparedMode: string,
    distanceKm: number,
  ): CarbonComparison {
    const refResult = this.calculateEmissions(referenceMode, distanceKm);
    const compResult = this.calculateEmissions(comparedMode, distanceKm);

    const savedGco2 = refResult.emissionsGco2 - compResult.emissionsGco2;
    const savedPercent =
      refResult.emissionsGco2 > 0
        ? Math.round((savedGco2 / refResult.emissionsGco2) * 10000) / 100
        : 0;

    // Équivalence en km de voiture
    const carFactor = ADEME_EMISSION_FACTORS['voiture'] || 170;
    const carKmEquivalent =
      carFactor > 0
        ? Math.round((savedGco2 / carFactor) * 100) / 100
        : 0;

    return {
      referenceMode,
      comparedMode,
      savedGco2: Math.round(savedGco2 * 100) / 100,
      savedPercent,
      carKmEquivalent,
    };
  }

  /**
   * Génère un résumé carbone pour un trajet multimodal
   */
  summarizeMultimodalTrip(
    segments: { mode: string; distanceKm: number }[],
  ): {
    totalEmissionsGco2: number;
    segments: CarbonResult[];
    comparisonWithCar: CarbonComparison | null;
  } {
    const segmentResults = segments.map((seg) =>
      this.calculateEmissions(seg.mode, seg.distanceKm),
    );

    const totalEmissionsGco2 = segmentResults.reduce(
      (sum, r) => sum + r.emissionsGco2,
      0,
    );

    const totalDistanceKm = segments.reduce(
      (sum, seg) => sum + seg.distanceKm,
      0,
    );

    const comparisonWithCar =
      totalDistanceKm > 0
        ? this.compareModes('voiture', 'metro', totalDistanceKm)
        : null;

    return {
      totalEmissionsGco2: Math.round(totalEmissionsGco2 * 100) / 100,
      segments: segmentResults,
      comparisonWithCar,
    };
  }

  /**
   * Récupère le facteur d'émission pour un mode donné
   */
  getEmissionFactor(mode: string): number {
    const normalizedMode = mode.toLowerCase().trim();

    // Recherche directe
    if (ADEME_EMISSION_FACTORS[normalizedMode] !== undefined) {
      return ADEME_EMISSION_FACTORS[normalizedMode];
    }

    // Recherche partielle
    for (const [key, value] of Object.entries(ADEME_EMISSION_FACTORS)) {
      if (key.includes(normalizedMode) || normalizedMode.includes(key)) {
        return value;
      }
    }

    // Fallback : bus (mode le plus courant en IDF si inconnu)
    this.logger.warn(`Unknown transport mode "${mode}", using bus emission factor as fallback`);
    return ADEME_EMISSION_FACTORS['bus'];
  }

  /**
   * Retourne tous les facteurs d'émission disponibles
   */
  getAllFactors(): Record<string, { factor: number; unit: string; source: string }> {
    const result: Record<string, { factor: number; unit: string; source: string }> = {};
    for (const [mode, factor] of Object.entries(ADEME_EMISSION_FACTORS)) {
      result[mode] = {
        factor,
        unit: 'gCO2/km/passager',
        source: 'ADEME Base Carbone v2024',
      };
    }
    return result;
  }
}