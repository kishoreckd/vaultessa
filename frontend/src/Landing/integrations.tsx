import { useEffect } from "react";
export { trackSignupPlacement as trackLandingAction } from "../analytics/Analytics";

/** Firebase initialization is independent of optional analytics collection. */
export function LandingIntegrations() {
  useEffect(() => {
    void import("./firebase")
      .then(({ initializeLandingFirebase }) => initializeLandingFirebase())
      .catch(() => undefined);
  }, []);
  return null;
}
