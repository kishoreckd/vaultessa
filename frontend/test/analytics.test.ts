import { describe, expect, it } from "vitest";
import {
  analyticsPage,
  safeAction,
  safeDestination,
} from "../src/analytics/events";
describe("marketing-only analytics boundary", () => {
  it.each(["/", "/features", "/security", "/how-it-works"])(
    "allows public page %s",
    (path) => {
      expect(analyticsPage(path)?.path).toBe(path);
    },
  );
  it.each([
    "/login",
    "/register",
    "/unlock",
    "/verify-email",
    "/recover",
    "/forgot-password",
    "/vault/security",
    "/settings",
    "/teams",
    "/developer",
    "/links",
    "/generator",
    "/activity",
    "/s/private-id",
    "/unknown",
  ])("excludes %s", (path) => {
    expect(analyticsPage(path)).toBeNull();
  });
  it("excludes the signed-in vault at the root path", () => {
    expect(analyticsPage("/", true)).toBeNull();
    expect(analyticsPage("/features", true)?.path).toBe("/features");
  });
  it("removes parameters and rejects arbitrary labels", () => {
    expect(analyticsPage("/features?email=private#key")?.path).toBe(
      "/features",
    );
    expect(safeAction("private@example.com")).toBe("control");
    expect(safeAction("Create your vault")).toBe("create_vault");
  });
  it("never sends private link destinations", () => {
    const origin = "https://vaultessa.example";
    expect(safeDestination("/s/private-token#private-key", origin)).toBe(
      "private",
    );
    expect(safeDestination("/settings?email=private", origin)).toBe("private");
    expect(safeDestination("/features?email=private", origin)).toBe(
      "/features",
    );
    expect(
      safeDestination("https://private.example/path?secret=value", origin),
    ).toBe("external");
  });
});
