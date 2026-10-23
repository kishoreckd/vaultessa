import { useState } from "react";
import { Link, NavLink } from "react-router";
import { ArrowRight, Menu, X } from "lucide-react";
import { VaultessaLogo } from "@/components/common/brand";
import { trackLandingAction } from "./integrations";

export function MarketingHeader() {
  const [open, setOpen] = useState(false);
  return (
    <header className="landing-header landing-container">
      <Link to="/" aria-label="Vaultessa home">
        <VaultessaLogo className="landing-logo" />
      </Link>
      <button
        className="mobile-menu-toggle"
        aria-label={open ? "Close navigation" : "Open navigation"}
        aria-expanded={open}
        aria-controls="landing-navigation"
        onClick={() => setOpen(!open)}
      >
        {open ? <X /> : <Menu />}
      </button>
      <nav
        id="landing-navigation"
        className={`landing-nav${open ? " is-open" : ""}`}
        aria-label="Main navigation"
      >
        {[
          ["/features", "Features"],
          ["/security", "Security"],
          ["/how-it-works", "How it works"],
        ].map(([path, label]) => (
          <NavLink key={path} to={path!} onClick={() => setOpen(false)}>
            {label}
          </NavLink>
        ))}
      </nav>
      <div className="landing-auth">
        <Link
          className="landing-button"
          to="/register"
          onClick={() => trackLandingAction("navigation")}
        >
          Get started
          <ArrowRight size={17} />
        </Link>
      </div>
    </header>
  );
}
