import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { LandingPage } from "../src/Landing/LandingPage";

describe("public landing page", () => {
  it("connects navigation to real sections and existing authentication routes", () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <LandingPage />
      </MemoryRouter>,
    );
    for (const section of ["features", "security", "how-it-works"]) {
      expect(html).toContain(`href="/${section}"`);
      expect(html).toContain(`id="${section}"`);
    }
    expect(html).toContain('href="/login"');
    expect(html).toContain('href="/register"');
    expect(html).toContain("A little less");
    expect(html).toContain('srcSet=');
    expect(html).toContain('.webp');
    expect(html).not.toContain('vaultessa-hero.png');
    expect(html).toContain('aria-label="Search sample vault"');
  });

  it("describes the implemented recovery requirements without claiming trusted device recovery", () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <LandingPage />
      </MemoryRouter>,
    );
    expect(html).toContain("both email verification and that key");
    expect(html).not.toContain("Trusted device recovery");
    expect(html).not.toContain("<script");
  });
});
