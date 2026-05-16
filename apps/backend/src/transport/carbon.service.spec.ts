import { Test, TestingModule } from '@nestjs/testing';
import { CarbonService } from './carbon.service';

describe('CarbonService', () => {
  let service: CarbonService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [CarbonService],
    }).compile();

    service = module.get<CarbonService>(CarbonService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ─── calculateEmissions ──────────────────────────────────────────

  describe('calculateEmissions', () => {
    it('should calculate metro emissions correctly', () => {
      const result = service.calculateEmissions('metro', 10);
      expect(result.mode).toBe('metro');
      expect(result.distanceKm).toBe(10);
      expect(result.emissionsGco2).toBe(38); // 3.8 gCO2/km × 10 km
      expect(result.factor).toBe(3.8);
      expect(result.source).toContain('ADEME');
    });

    it('should calculate bus emissions correctly', () => {
      const result = service.calculateEmissions('bus', 5);
      expect(result.emissionsGco2).toBe(475); // 95 gCO2/km × 5 km
    });

    it('should calculate RER emissions correctly', () => {
      const result = service.calculateEmissions('rer', 15);
      expect(result.emissionsGco2).toBe(78); // 5.2 gCO2/km × 15 km
    });

    it('should return 0 emissions for walking', () => {
      const result = service.calculateEmissions('marche', 3);
      expect(result.emissionsGco2).toBe(0);
    });

    it('should return 0 emissions for mechanical Vélib', () => {
      const result = service.calculateEmissions('velib_mecanique', 5);
      expect(result.emissionsGco2).toBe(0);
    });

    it('should calculate car emissions correctly', () => {
      const result = service.calculateEmissions('voiture', 20);
      expect(result.emissionsGco2).toBe(3400); // 170 gCO2/km × 20 km
    });

    it('should calculate tram emissions correctly', () => {
      const result = service.calculateEmissions('tram', 8);
      expect(result.emissionsGco2).toBe(25.6); // 3.2 gCO2/km × 8 km
    });

    it('should round distance and emissions to 2 decimal places', () => {
      const result = service.calculateEmissions('metro', 10.123);
      expect(result.distanceKm).toBe(10.12);
      expect(result.emissionsGco2).toBe(Math.round(3.8 * 10.123 * 100) / 100);
    });

    it('should use bus as default for unknown mode', () => {
      const result = service.calculateEmissions('unknown_mode', 10);
      // Default factor is bus (95 gCO2/km)
      expect(result.emissionsGco2).toBe(950);
    });
  });

  // ─── calculateFromGtfsRouteType ─────────────────────────────────

  describe('calculateFromGtfsRouteType', () => {
    it('should map GTFS route type 0 (tram) correctly', () => {
      const result = service.calculateFromGtfsRouteType(0, 5);
      expect(result.mode).toBe('tram');
      expect(result.emissionsGco2).toBe(16); // 3.2 × 5
    });

    it('should map GTFS route type 1 (metro) correctly', () => {
      const result = service.calculateFromGtfsRouteType(1, 10);
      expect(result.mode).toBe('metro');
      expect(result.emissionsGco2).toBe(38); // 3.8 × 10
    });

    it('should map GTFS route type 2 (train/RER) correctly', () => {
      const result = service.calculateFromGtfsRouteType(2, 20);
      expect(result.mode).toBe('train');
      expect(result.emissionsGco2).toBe(104); // 5.2 × 20
    });

    it('should map GTFS route type 3 (bus) correctly', () => {
      const result = service.calculateFromGtfsRouteType(3, 5);
      expect(result.mode).toBe('bus');
      expect(result.emissionsGco2).toBe(475); // 95 × 5
    });

    it('should default to bus for unknown route type', () => {
      const result = service.calculateFromGtfsRouteType(999, 5);
      expect(result.mode).toBe('bus');
    });
  });

  // ─── compareModes ────────────────────────────────────────────────

  describe('compareModes', () => {
    it('should compare metro vs car correctly', () => {
      const comparison = service.compareModes('voiture', 'metro', 10);
      expect(comparison.referenceMode).toBe('voiture');
      expect(comparison.comparedMode).toBe('metro');
      expect(comparison.savedGco2).toBe(1662); // 1700 - 38
      expect(comparison.savedPercent).toBeGreaterThan(90); // ~97.6%
      expect(comparison.carKmEquivalent).toBeGreaterThan(0);
    });

    it('should compare bus vs car correctly', () => {
      const comparison = service.compareModes('voiture', 'bus', 10);
      expect(comparison.savedGco2).toBe(750); // 1700 - 950
      expect(comparison.savedPercent).toBeGreaterThan(40); // ~44%
    });

    it('should show 0 savings when comparing same mode', () => {
      const comparison = service.compareModes('voiture', 'voiture', 10);
      expect(comparison.savedGco2).toBe(0);
      expect(comparison.savedPercent).toBe(0);
    });

    it('should show negative savings when compared mode pollutes more', () => {
      const comparison = service.compareModes('marche', 'voiture', 5);
      expect(comparison.savedGco2).toBeLessThan(0); // marche < voiture
    });
  });

  // ─── summarizeMultimodalTrip ────────────────────────────────────

  describe('summarizeMultimodalTrip', () => {
    it('should summarize a multimodal trip correctly', () => {
      const result = service.summarizeMultimodalTrip([
        { mode: 'marche', distanceKm: 0.3 },
        { mode: 'metro', distanceKm: 8 },
        { mode: 'marche', distanceKm: 0.2 },
      ]);

      expect(result.totalEmissionsGco2).toBe(30.4); // 0 + 30.4 + 0
      expect(result.segments).toHaveLength(3);
      expect(result.comparisonWithCar).not.toBeNull();
      expect(result.comparisonWithCar!.savedPercent).toBeGreaterThan(80);
    });

    it('should handle a single-mode trip', () => {
      const result = service.summarizeMultimodalTrip([
        { mode: 'bus', distanceKm: 5 },
      ]);

      expect(result.totalEmissionsGco2).toBe(475);
      expect(result.segments).toHaveLength(1);
    });

    it('should handle a zero-distance trip', () => {
      const result = service.summarizeMultimodalTrip([]);
      expect(result.totalEmissionsGco2).toBe(0);
      expect(result.segments).toHaveLength(0);
      expect(result.comparisonWithCar).toBeNull();
    });
  });
});