import { useEffect, useState } from "react";
import { useLocation } from "react-router";
import { useSession } from "@/stores/session";
import { analyticsPage, safeAction, safeDestination } from "./events";

// Only public marketing pages may load or emit analytics.
const consentKey = "vaultessa:analytics:marketing:v3";
const measurementId = import.meta.env.VITE_GA_MEASUREMENT_ID as
  string | undefined;
const enabled = !!measurementId && /^G-[A-Z0-9]+$/.test(measurementId);
type AnalyticsWindow = Window & {
  dataLayer?: unknown[];
  gtag?: (...args: unknown[]) => void;
};
let choice: string | null = null;
let started = false;
let lastView = "";
function consent() {
  try {
    return choice ?? localStorage.getItem(consentKey);
  } catch {
    return choice;
  }
}
function page() {
  return analyticsPage(
    window.location.pathname,
    useSession.getState().status !== "loggedOut",
  );
}
function emit(name: string, parameters: Record<string, string> = {}) {
  if (!enabled || !started || consent() !== "accepted") return;
  const current = page();
  if (!current) return;
  (window as AnalyticsWindow).gtag?.("event", name, {
    ...parameters,
    page_title: current.title,
    page_location: `${window.location.origin}${current.path}`,
    page_referrer: "",
  });
}
function start() {
  if (!enabled || started || consent() !== "accepted") return;
  const current = page();
  if (!current) return;
  started = true;
  const target = window as AnalyticsWindow;
  target.dataLayer ??= [];
  target.gtag ??= function () {
    target.dataLayer!.push(arguments);
  };
  target.gtag("consent", "default", {
    analytics_storage: "granted",
    ad_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied",
  });
  target.gtag("js", new Date());
  target.gtag("config", measurementId, {
    send_page_view: false,
    page_location: `${window.location.origin}${current.path}`,
    page_title: current.title,
    page_referrer: "",
    allow_google_signals: false,
    allow_ad_personalization_signals: false,
  });
  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${measurementId}`;
  document.head.appendChild(script);
}
export function trackSignupPlacement(placement: string) {
  const allowed = new Set([
    "navigation",
    "hero",
    "footer",
    "features_hero",
    "features_footer",
    "security_hero",
    "security_footer",
    "how-it-works_hero",
    "how-it-works_footer",
  ]);
  if (allowed.has(placement)) emit("signup_cta_click", { placement });
}

export function trackEnquirySuccess() {
  emit("generate_lead", { form_type: "enquiry" });
}

export function Analytics() {
  const location = useLocation();
  const status = useSession((s) => s.status);
  const [open, setOpen] = useState(enabled && consent() === null);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (status === "booting") return;
    const eligible = page();
    if (!eligible) {
      lastView = "";
      if (started) {
        (window as AnalyticsWindow).gtag?.("consent", "update", {
          analytics_storage: "denied",
        });
        window.location.reload();
      }
      return;
    }
    start();
    if (!started || consent() !== "accepted") return;
    const current = page();
    if (!current) return;
    // Only screen changes count; hash/query-only updates and StrictMode replays do not.
    // Returning A -> B -> A still records the second A visit.
    const key = current.path;
    if (key !== lastView) {
      lastView = key;
      (window as AnalyticsWindow).gtag?.("set", {
        page_location: `${window.location.origin}${current.path}`,
        page_title: current.title,
        page_referrer: "",
      });
      emit("page_view");
    }
  }, [location.key, location.pathname, status, revision]);
  useEffect(() => {
    const openPreferences = () => setOpen(true);
    window.addEventListener("vaultessa:privacy", openPreferences);
    const click = (event: MouseEvent) => {
      if (
        !page() ||
        consent() !== "accepted" ||
        !(event.target instanceof Element)
      )
        return;
      const control = event.target.closest(
        'button,a,summary,select,input,[role="button"],[role="tab"],[role="menuitem"],[role="checkbox"],[role="switch"]',
      );
      if (!control || control.closest("[data-analytics-ignore]")) return;
      const role = control.getAttribute("role");
      const kind = ["button", "tab", "menuitem", "checkbox", "switch"].includes(
        role ?? "",
      )
        ? role!
        : control.tagName.toLowerCase();
      const parameters: Record<string, string> = {
        control_type: kind,
        action: safeAction(
          control.getAttribute("aria-label") ?? control.textContent,
        ),
      };
      if (control.matches(".chapter-card")) parameters.action = "chapter_open";
      if (control.tagName === "SUMMARY") parameters.action = "faq_toggle";
      if (control.tagName === "A")
        parameters.destination = safeDestination(
          control.getAttribute("href") ?? "",
          window.location.origin,
        );
      emit("ui_click", parameters);
    };
    const submit = () => emit("form_submit"); // No field names, values, form action URL or form ID.
    document.addEventListener("click", click, true);
    document.addEventListener("submit", submit, true);
    return () => {
      window.removeEventListener("vaultessa:privacy", openPreferences);
      document.removeEventListener("click", click, true);
      document.removeEventListener("submit", submit, true);
    };
  }, []);
  function choose(accepted: boolean) {
    choice = accepted ? "accepted" : "declined";
    try {
      localStorage.setItem(consentKey, choice);
    } catch {
      /* In-memory consent when storage is unavailable. */
    }
    if (!accepted && started) {
      (window as AnalyticsWindow).gtag?.("consent", "update", {
        analytics_storage: "denied",
      });
      window.location.reload();
    }
    setOpen(false);
    setRevision((value) => value + 1);
  }
  if (
    !analyticsPage(location.pathname, status !== "loggedOut") ||
    status === "booting"
  )
    return null;
  return (
    <>
      <button
        className="fixed bottom-3 right-3 z-40 rounded-full border bg-background px-3 py-2 text-xs text-foreground shadow-sm"
        onClick={() => setOpen(true)}
        data-analytics-ignore
      >
        Analytics preferences
      </button>
      {open && (
        <aside
          className="fixed bottom-16 left-4 right-4 z-50 max-w-sm rounded-xl border bg-background p-5 text-sm text-foreground shadow-xl"
          aria-label="Analytics preferences"
          data-analytics-ignore
        >
          <strong>Your privacy, your choice.</strong>
          <p className="my-3 text-muted-foreground">
            {enabled
              ? "Allow optional Google Analytics to measure page visits and control clicks on our public landing, Features, Security and How it works pages only. We exclude form values, passwords, vault contents, recovery keys and item identifiers. Google may use analytics cookies and technical device information."
              : "Analytics is not configured. No analytics events are sent."}
          </p>
          <div className="flex gap-3">
            {enabled && (
              <button
                className="rounded-md bg-primary px-3 py-2 text-primary-foreground"
                onClick={() => choose(true)}
              >
                Allow analytics
              </button>
            )}
            <button
              className="rounded-md border px-3 py-2"
              onClick={() => choose(false)}
            >
              {enabled ? "Decline" : "Close"}
            </button>
          </div>
        </aside>
      )}
    </>
  );
}
