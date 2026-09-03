import { renderHook, act } from "@testing-library/react";
import { usePolling } from "@/hooks/useTransport";

/**
 * usePolling : re-exécute la callback à l'intervalle donné, avec pause en
 * arrière-plan et hors-ligne, et re-fetch immédiat au retour de visibilité
 * ou de réseau.
 */
describe("usePolling", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    // jsdom : onLine true, page visible par défaut.
    Object.defineProperty(window.navigator, "onLine", {
      value: true,
      configurable: true,
    });
    Object.defineProperty(document, "hidden", {
      value: false,
      configurable: true,
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("exécute la callback à chaque intervalle", () => {
    const cb = jest.fn();
    renderHook(() => usePolling(cb, 1000));
    expect(cb).not.toHaveBeenCalled();
    act(() => {
      jest.advanceTimersByTime(1000);
    });
    expect(cb).toHaveBeenCalledTimes(1);
    act(() => {
      jest.advanceTimersByTime(1000);
    });
    expect(cb).toHaveBeenCalledTimes(2);
  });

  it("ne s'exécute pas quand la page est masquée, rattrape au retour", () => {
    const cb = jest.fn();
    renderHook(() => usePolling(cb, 1000));
    Object.defineProperty(document, "hidden", {
      value: true,
      configurable: true,
    });
    act(() => {
      jest.advanceTimersByTime(5000);
    });
    expect(cb).not.toHaveBeenCalled();
    // Retour sur l'onglet → tick immédiat (visibilitychange).
    Object.defineProperty(document, "hidden", {
      value: false,
      configurable: true,
    });
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("ne s'exécute pas hors ligne, reprend au retour du réseau", () => {
    const cb = jest.fn();
    Object.defineProperty(window.navigator, "onLine", {
      value: false,
      configurable: true,
    });
    renderHook(() => usePolling(cb, 1000));
    act(() => {
      jest.advanceTimersByTime(5000);
    });
    expect(cb).not.toHaveBeenCalled();
    act(() => {
      Object.defineProperty(window.navigator, "onLine", {
        value: true,
        configurable: true,
      });
      window.dispatchEvent(new Event("online"));
    });
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("s'arrête au démontage", () => {
    const cb = jest.fn();
    const { unmount } = renderHook(() => usePolling(cb, 1000));
    unmount();
    act(() => {
      jest.advanceTimersByTime(5000);
    });
    expect(cb).not.toHaveBeenCalled();
  });
});