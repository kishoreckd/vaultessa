import { useEffect, useState, type MouseEvent } from "react";
import { Link } from "react-router";
import {
  ArrowDown,
  ArrowRight,
  Check,
  ShieldCheck,
  Laptop,
  Cloud,
  KeyRound,
  Fingerprint,
  Folder,
  Sparkles,
  Users,
  UserPlus,
  LockKeyhole,
} from "lucide-react";
import { VaultessaLogo } from "@/components/common/brand";
import { MarketingHeader } from "./MarketingHeader";
import { LandingIntegrations, trackLandingAction } from "./integrations";
import { marketingPages, type MarketingPageKey } from "./marketingPages";
import featuresImage from "./assets/features.png";
import securityImage from "./assets/security.png";
import howImage from "./assets/how-it-works.png";
import "./landing.css";

const images = {
  features: featuresImage,
  security: securityImage,
  "how-it-works": howImage,
};
const chapterIcons = {
  features: [Folder, Sparkles, Users, KeyRound],
  security: [Laptop, Cloud, Fingerprint, KeyRound],
  "how-it-works": [UserPlus, Folder, KeyRound, LockKeyhole],
};

function scrollToChapter(event: MouseEvent<HTMLAnchorElement>) {
  if (
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  )
    return;
  const hash = event.currentTarget.hash;
  const target = document.getElementById(hash.slice(1));
  if (!target) return;
  event.preventDefault();
  target.focus({ preventScroll: true });
  target.scrollIntoView({
    behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ? "auto"
      : "smooth",
    block: "start",
  });
  window.history.replaceState(window.history.state, "", hash);
}
export function MarketingPage({ pageKey }: { pageKey: MarketingPageKey }) {
  const page = marketingPages[pageKey];
  const [activeChapter, setActiveChapter] = useState<number | null>(null);
  useEffect(() => {
    setActiveChapter(null);
    if (!("IntersectionObserver" in window)) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort(
            (a, b) => a.boundingClientRect.top - b.boundingClientRect.top,
          )[0];
        if (visible)
          setActiveChapter(
            Number(visible.target.id.replace("detail-", "")) - 1,
          );
      },
      { rootMargin: "-15% 0px -55% 0px", threshold: 0 },
    );
    document
      .querySelectorAll(".marketing-detail")
      .forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, [pageKey]);
  useEffect(() => {
    const title = document.title;
    document.title = `${page.title} — Vaultessa`;
    const target = document.getElementById(window.location.hash.slice(1));
    if (target && (target.id === 'details' || /^detail-[1-4]$/.test(target.id))) {
      target.scrollIntoView({ behavior: 'auto', block: 'start' });
    } else {
      window.scrollTo(0, 0);
    }
    return () => {
      document.title = title;
    };
  }, [page]);
  return (
    <div className="landing-page marketing-page">
      <LandingIntegrations />
      <a className="landing-skip" href="#main">
        Skip to content
      </a>
      <MarketingHeader />
      <main id="main">
        <section className="landing-hero landing-container">
          <div className="hero-copy">
            <p className="landing-eyebrow">{page.eyebrow}</p>
            <h1>
              {page.headline.split("\n").map((line, i) => (
                <span key={line}>
                  {i > 0 && <br />}
                  {line}
                </span>
              ))}
            </h1>
            <p className="hero-description">{page.description}</p>
            <div className="hero-actions">
              <Link
                className="landing-button"
                to="/register"
                onClick={() => trackLandingAction(`${pageKey}_hero`)}
              >
                Create your vault
                <ArrowRight size={17} />
              </Link>
              <a
                className="landing-text-link closer-look"
                href="#details"
                onClick={scrollToChapter}
              >
                <span className="closer-look-icon">
                  <ArrowDown size={18} aria-hidden="true" />
                </span>
                Take a closer look
              </a>
            </div>
          </div>
          <div className="hero-art">
            <img
              src={images[page.image]}
              alt={page.alt}
              width="1536"
              height="1024"
              fetchPriority="high"
            />
          </div>
        </section>
        <nav
          className="chapter-guide landing-container"
          aria-label="Explore the chapters"
        >
          <div className="chapter-guide-heading">
            <div>
              <p className="landing-eyebrow">Explore at your own pace</p>
              <h2>Get the full picture.</h2>
            </div>
            <span>Four chapters. Pick what matters to you.</span>
          </div>
          <div className="chapter-grid">
            {page.sections.map((section, i) => {
              const Icon = chapterIcons[pageKey][i] ?? ShieldCheck;
              return (
                <a
                  className={`chapter-card${activeChapter === i ? " chapter-active" : ""}`}
                  href={`#detail-${i + 1}`}
                  key={section.title}
                  onClick={scrollToChapter}
                  aria-current={activeChapter === i ? "location" : undefined}
                >
                  <div className="chapter-card-top">
                    <span className="chapter-icon">
                      <Icon size={23} aria-hidden="true" />
                    </span>
                    <span className="chapter-count">0{i + 1}</span>
                  </div>
                  <span className="chapter-label">
                    {section.eyebrow.replace(/^\d+ · /, "")}
                  </span>
                  <strong>{section.title}</strong>
                  <span className="chapter-card-bottom">
                    Explore chapter
                    <ArrowRight size={17} aria-hidden="true" />
                  </span>
                </a>
              );
            })}
          </div>
        </nav>
        <div id="details" tabIndex={-1}>
          {page.sections.map((section, i) => (
            <section
              className={`marketing-detail${i % 2 === 0 ? " marketing-tint" : ""}`}
              id={`detail-${i + 1}`}
              tabIndex={-1}
              key={section.title}
            >
              <div className="landing-container marketing-detail-grid">
                <div className="marketing-visual" aria-hidden="true">
                  <span className="marketing-detail-number">0{i + 1}</span>
                  <ShieldCheck size={70} strokeWidth={1} />
                  <div className="marketing-visual-cards">
                    {section.points.map((point) => (
                      <span key={point}>
                        <Check size={16} />
                        {point}
                      </span>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="landing-eyebrow">{section.eyebrow}</p>
                  <h2 className="landing-section-title">{section.title}</h2>
                  <p className="landing-section-description">{section.text}</p>
                  <ul className="marketing-checklist">
                    {section.points.map((point) => (
                      <li key={point}>
                        <Check size={17} />
                        {point}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </section>
          ))}
        </div>
        <section className="landing-cta landing-container">
          <p className="landing-eyebrow">Your next step</p>
          <h2>Make room for peace of mind.</h2>
          <p>Start with your own vault, or keep exploring.</p>
          <div className="marketing-cta-links">
            <Link
              className="landing-button"
              to="/register"
              onClick={() => trackLandingAction(`${pageKey}_footer`)}
            >
              Get started
              <ArrowRight size={17} />
            </Link>
            <Link className="landing-text-link" to={page.next}>
              {page.nextLabel}
              <ArrowRight size={17} />
            </Link>
          </div>
        </section>
      </main>
      <footer className="landing-footer landing-container">
        <Link to="/">
          <VaultessaLogo />
        </Link>
        <p>© {new Date().getFullYear()} Vaultessa</p>
        <Link to="/features">Features</Link>
        <Link to="/security">Security</Link>
        <Link to="/how-it-works">How it works</Link>
        <button
          onClick={() => window.dispatchEvent(new Event("vaultessa:privacy"))}
        >
          Privacy preferences
        </button>
      </footer>
    </div>
  );
}
