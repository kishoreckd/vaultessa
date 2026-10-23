import { useEffect, useState } from "react";
import { useLocation } from "react-router";
import { publicAnalyticsPage } from "./marketingPages";

const consentKey = "vaultessa:landing-analytics";
const measurementId = import.meta.env.VITE_GA_MEASUREMENT_ID as
  string | undefined;
const enabled = !!measurementId && /^G-[A-Z0-9]+$/.test(measurementId);
type AnalyticsWindow = Window & {
  dataLayer?: unknown[];
  gtag?: (...args: unknown[]) => void;
};
let analyticsStarted = false;
let departureReload: ReturnType<typeof setTimeout> | undefined;
let lastTrackedPage: string | null = null;

export function trackPublicPage(pathname: string) {
  const page = publicAnalyticsPage(pathname);
  if (
    !page ||
    !analyticsStarted ||
    savedConsent() !== "accepted" ||
    lastTrackedPage === page.path
  )
    return;
  lastTrackedPage = page.path;
  (window as AnalyticsWindow).gtag?.("event", "page_view", {
    page_title: page.title,
    page_location: `${window.location.origin}${page.path}`,
    page_referrer: "",
  });
}

function savedConsent() {
  try {
    return localStorage.getItem(consentKey);
  } catch {
    return null;
  }
}

function startAnalytics() {
  if (!enabled || analyticsStarted) return;
  analyticsStarted = true;
  const target = window as AnalyticsWindow;
  target.dataLayer ??= [];
  target.gtag ??= function () {
    target.dataLayer!.push(arguments);
  };
  target.gtag("js", new Date());
  // Fixed public URL: never forward query strings, share fragments, emails, or vault identifiers.
  target.gtag("config", measurementId, {
    send_page_view: false,
    page_location: `${window.location.origin}/`,
    page_referrer: "",
    allow_google_signals: false,
    allow_ad_personalization_signals: false,
  });
  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${measurementId}`;
  script.dataset.vaultessaAnalytics = "true";
  document.head.appendChild(script);
  trackPublicPage(window.location.pathname);
}

export function trackLandingAction(placement: string) {
  if (!analyticsStarted || savedConsent() !== "accepted") return;
  const page = publicAnalyticsPage(window.location.pathname);
  if (!page) return;
  (window as AnalyticsWindow).gtag?.("event", "landing_signup_click", {
    placement,
    page_title: page.title,
    page_location: `${window.location.origin}${page.path}`,
    page_referrer: "",
  });
}

export function LandingIntegrations() {
  const { pathname } = useLocation();
  const [showConsent, setShowConsent] = useState(
    enabled && savedConsent() === null,
  );
  useEffect(() => {
    clearTimeout(departureReload);
    // Firebase App initialization does not start Analytics, Auth, Storage, or collection.
    void import("./firebase")
      .then(({ initializeLandingFirebase }) => initializeLandingFirebase())
      .catch(() => undefined);
    if (savedConsent() === "accepted") startAnalytics();
    const open = () => setShowConsent(true);
    window.addEventListener("vaultessa:privacy", open);
    return () => {
      window.removeEventListener("vaultessa:privacy", open);
      if (analyticsStarted) {
        // Leave the public page with a clean document: third-party scripts must not follow
        // SPA navigation into login, recovery, guest shares, or decrypted vault screens.
        departureReload = setTimeout(() => {
          if (!publicAnalyticsPage(window.location.pathname))
            window.location.reload();
        }, 0);
      }
    };
  }, []);

  useEffect(() => {
    trackPublicPage(pathname);
  }, [pathname]);

  function choose(accepted: boolean) {
    try {
      localStorage.setItem(consentKey, accepted ? "accepted" : "declined");
    } catch {
      /* Session-only choice when storage is blocked. */
    }
    setShowConsent(false);
    if (accepted) startAnalytics();
    else if (analyticsStarted) window.location.reload();
  }
  if (!showConsent) return null;
  return (
    <aside className="landing-consent" aria-label="Analytics preferences">
      <strong>Your privacy, your choice.</strong>
      <p>
        {enabled
          ? "Allow optional Google Analytics on this public page to help us understand visits. We do not send your vault contents, passwords, or recovery keys."
          : "Optional analytics is not configured. Your vault data is not used for landing-page analytics."}
      </p>
      <div>
        {enabled && (
          <button onClick={() => choose(true)}>Allow analytics</button>
        )}
        <button onClick={() => choose(false)}>
          {enabled ? "Decline" : "Close"}
        </button>
      </div>
    </aside>
  );
}
