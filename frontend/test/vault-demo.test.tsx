import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  VaultDemo,
  filterDemoItems,
  sampleVaultItems,
} from "../src/Landing/VaultDemo";

describe("public vault demo", () => {
  it("filters sample items by search, folder, category and shared status together", () => {
    expect(
      filterDemoItems(sampleVaultItems, "git", "Logins", "Work", true).map(
        (item) => item.name,
      ),
    ).toEqual(["GitHub"]);
    expect(
      filterDemoItems(sampleVaultItems, "", "All items", null, true).map(
        (item) => item.name,
      ),
    ).toEqual(["Notion", "GitHub"]);
    expect(
      filterDemoItems(sampleVaultItems, "", "All items", "Travel").map(
        (item) => item.name,
      ),
    ).toEqual(["Airbnb", "Travel checklist"]);
    expect(filterDemoItems(sampleVaultItems, "not-found")).toEqual([]);
  });
  it.each(["Logins", "Secure notes", "Cards", "Identities"])(
    "includes actual fictional samples for %s",
    (category) => {
      const result = filterDemoItems(sampleVaultItems, "", category);
      expect(result.length).toBeGreaterThan(0);
      expect(result.every((item) => item.type === category)).toBe(true);
    },
  );
  it("renders accessible interactive sidebar buttons and identifies fictional data", () => {
    const html = renderToStaticMarkup(<VaultDemo />);
    expect(html).toContain('aria-label="Demo navigation"');
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain("Interactive demo");
    expect(html).toContain("Reset demo");
    expect(html).not.toContain('href="/register"');
  });
});
