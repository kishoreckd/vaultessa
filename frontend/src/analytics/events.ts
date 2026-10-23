// Only static route templates and enumerated actions cross the analytics boundary.
const routes: Record<string, string> = {
  "/features": "Features",
  "/security": "Security overview",
  "/how-it-works": "How it works",
  "/login": "Login",
  "/register": "Registration",
  "/unlock": "Unlock",
  "/verify-email": "Email verification",
  "/forgot-password": "Forgot password",
  "/recover": "Vault recovery",
  "/vault/security": "Vault security",
  "/generator": "Password generator",
  "/links": "Shared links",
  "/activity": "Activity",
  "/settings": "Settings",
  "/teams": "Teams",
  "/developer": "Developer",
};
export function analyticsPage(pathname: string, unlocked = false) {
  const path = pathname.split(/[?#]/)[0]!.replace(/\/+$/, "") || "/";
  if (path === "/")
    return {
      path: unlocked ? "/vault" : "/",
      title: unlocked ? "Vault" : "Home",
    };
  if (/^\/s\/[^/]+$/.test(path))
    return { path: "/s/:id", title: "Guest share" };
  return routes[path]
    ? { path, title: routes[path]! }
    : { path: "/not-found", title: "Not found" };
}
const actions: Record<string, string> = {
  "Get started": "get_started",
  "Create your vault": "create_vault",
  "Log in": "login",
  "Sign in": "login",
  "Sign out": "logout",
  Features: "features",
  Security: "security",
  "How it works": "how_it_works",
  "Explore features": "explore_features",
  "Take a closer look": "closer_look",
  "All items": "all_items",
  Folders: "folders",
  Shared: "shared",
  Settings: "settings",
  "Reset demo": "reset_demo",
  Logins: "logins",
  "Secure notes": "secure_notes",
  Cards: "cards",
  Identities: "identities",
  "Add item": "add_item",
  "Add sample": "add_sample",
  Cancel: "cancel",
  Save: "save",
  Copy: "copy",
  Reveal: "reveal",
  Hide: "hide",
  Generate: "generate",
  "Privacy preferences": "privacy_preferences",
  "Allow analytics": "allow_analytics",
  Decline: "decline_analytics",
};
export function safeAction(text: string | null | undefined) {
  return (
    actions[
      (text ?? "")
        .replace(/[＋+↓→]/g, "")
        .replace(/\s+/g, " ")
        .trim()
    ] ?? "control"
  );
}

export function safeDestination(href: string, origin: string) {
  try {
    const url = new URL(href, origin);
    if (url.origin !== origin) return "external";
    if (href.startsWith("#"))
      return /^#(details|detail-[1-4]|main)$/.test(href) ? href : "section";
    return analyticsPage(url.pathname).path;
  } catch {
    return "unknown";
  }
}
