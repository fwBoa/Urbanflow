import { changePassword, login, logout } from "@/services/auth";

jest.mock("@/services/api", () => ({
  apiService: {
    getBaseUrl: jest.fn().mockReturnValue(""),
  },
}));

describe("auth service", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = jest.fn();
    sessionStorage.clear();
  });

  afterEach(() => {
    jest.clearAllMocks();
    global.fetch = originalFetch;
  });

  describe("changePassword", () => {
    it("should send PUT request with credentials and passwords", async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({ message: "Mot de passe mis à jour" }),
      });

      const result = await changePassword(
        "old-password",
        "new-password123",
        "new-password123",
      );

      expect(global.fetch).toHaveBeenCalledWith("/api/auth/password", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword: "old-password",
          newPassword: "new-password123",
          confirmPassword: "new-password123",
        }),
      });
      expect(result).toEqual({ message: "Mot de passe mis à jour" });
    });

    it("should throw backend error message on failure", async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 401,
        json: jest.fn().mockResolvedValue({ message: "Mot de passe actuel incorrect" }),
      });

      await expect(
        changePassword("old-password", "new-password123", "new-password123"),
      ).rejects.toThrow("Mot de passe actuel incorrect");
    });

    it("should throw generic error when backend message is missing", async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 500,
        json: jest.fn().mockResolvedValue({}),
      });

      await expect(
        changePassword("old-password", "new-password123", "new-password123"),
      ).rejects.toThrow("Erreur lors du changement de mot de passe");
    });
  });

  describe("login", () => {
    it("should set auth flag on successful login", async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({
          user: {
            id: "user-123",
            email: "test@example.com",
            displayName: "Test",
            avatar: "🚇",
            preferredMode: "rapide",
            accessibilityNeeds: false,
            role: "user",
          },
        }),
      });

      await login("test@example.com", "password123");

      expect(sessionStorage.getItem("urbanflow_authenticated")).toBe("true");
    });
  });

  describe("logout", () => {
    it("should clear auth flag", async () => {
      sessionStorage.setItem("urbanflow_authenticated", "true");
      (global.fetch as jest.Mock).mockResolvedValue({ ok: true });

      await logout();

      expect(sessionStorage.getItem("urbanflow_authenticated")).toBeNull();
    });
  });
});
