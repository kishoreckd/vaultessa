import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { MarketingPage } from "../src/Landing/MarketingPage";
import {
  marketingPages,
  publicAnalyticsPage,
  type MarketingPageKey,
} from "../src/Landing/marketingPages";
import { authDestination } from "../src/lib/auth-destination";

describe("dedicated public pages", () => {
  it.each(Object.keys(marketingPages) as MarketingPageKey[])(
    "renders %s with its own artwork, content and navigation",
    (pageKey) => {
      const page = marketingPages[pageKey];
      const html = renderToStaticMarkup(
        <MemoryRouter initialEntries={[page.path]}>
          <MarketingPage pageKey={pageKey} />
        </MemoryRouter>,
      );
      expect(html).toContain(page.alt);
      expect(html).toContain('aria-current="page"');
      for (const section of page.sections)
        expect(html).toContain(section.title);
      for (const path of [
        "/features",
        "/security",
        "/how-it-works",
        "/register",
      ])
        expect(html).toContain(`href="${path}"`);
      expect(html).toContain('id="detail-4"');
    },
  );
  it("only admits known public paths to analytics", () => {
    for (const path of ["/", "/features", "/security", "/how-it-works"])
      expect(publicAnalyticsPage(path)?.path).toBe(path);
    for (const path of [
      "/login",
      "/register",
      "/vault/security",
      "/recover",
      "/s/private-id",
      "/features?email=private",
      "/security#private",
    ])
      expect(publicAnalyticsPage(path)).toBeNull();
  });
  it("keeps the authenticated security dashboard as a safe authentication destination", () => {
    expect(authDestination({ from: "/vault/security" })).toBe(
      "/vault/security",
    );
    expect(authDestination({ from: "/security" })).toBe("/");
  });
});
