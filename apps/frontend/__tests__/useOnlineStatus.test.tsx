import { renderHook, act } from "@testing-library/react";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";

/**
 * jsdom expose navigator.onLine en getter sur Navigator.prototype :
 * on le redéfinit là (et non sur window.navigator, non configurable).
 */
function setOnline(value: boolean) {
  Object.defineProperty(window.navigator, "onLine", {
    value,
    configurable: true,
  });
}

describe("useOnlineStatus", () => {
  it("retourne true quand navigator.onLine est true", () => {
    setOnline(true);
    const { result } = renderHook(() => useOnlineStatus());
    expect(result.current).toBe(true);
  });

  it("bascule à false quand navigator passe hors ligne + événement offline", () => {
    setOnline(true);
    const { result } = renderHook(() => useOnlineStatus());
    act(() => {
      setOnline(false);
      window.dispatchEvent(new Event("offline"));
    });
    expect(result.current).toBe(false);
  });

  it("rebascule à true au retour (événement online)", () => {
    setOnline(false);
    const { result } = renderHook(() => useOnlineStatus());
    act(() => {
      setOnline(false);
      window.dispatchEvent(new Event("offline"));
    });
    expect(result.current).toBe(false);
    act(() => {
      setOnline(true);
      window.dispatchEvent(new Event("online"));
    });
    expect(result.current).toBe(true);
  });
});