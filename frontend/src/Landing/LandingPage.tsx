import { useEffect, useState } from "react";
import { Link } from "react-router";
import {
  ArrowRight,
  Check,
  ChevronDown,
  Copy,
  KeyRound,
  LockKeyhole,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";
import { VaultessaLogo } from "@/components/common/brand";
import { LandingIntegrations, trackLandingAction } from "./integrations";
import "./landing.css";
import heroImage from "./assets/vaultessa-hero.png";
import { VaultDemo } from "./VaultDemo";
import { MarketingHeader } from "./MarketingHeader";

const benefits = [
  {
    icon: LockKeyhole,
    title: "Encrypted in your browser",
    text: "Your vault data is encrypted on your device before it reaches our servers.",
  },
  {
    icon: ShieldCheck,
    title: "Your keys, your control",
    text: "Unlock with your master password. Keep a recovery key safely in your hands.",
  },
  {
    icon: Users,
    title: "Secure sharing",
    text: "Share selected items with people you trust, without sharing your master password.",
  },
];
const features = [
  {
    icon: Sparkles,
    title: "Password generator",
    text: "Create strong, unique passwords in seconds.",
    points: [
      "Customise length and characters",
      "Use a different password everywhere",
    ],
  },
  {
    icon: KeyRound,
    title: "Vault recovery",
    text: "Prepare a way back before you need it.",
    points: [
      "Save your recovery key or QR",
      "Recover with email verification and your key",
    ],
  },
  {
    icon: Users,
    title: "Secure sharing",
    text: "Give the right people access to selected items.",
    points: [
      "Share with individuals or your team",
      "Manage access and permissions",
    ],
  },
];
function SignupLink({
  children = "Get started",
  location = "navigation",
}: {
  children?: React.ReactNode;
  location?: string;
}) {
  return (
    <Link
      className="landing-button"
      to="/register"
      onClick={() => trackLandingAction(location)}
    >
      {children}
      <ArrowRight size={17} aria-hidden="true" />
    </Link>
  );
}

function GeneratorSample() {
  const [copied, setCopied] = useState(false);
  return (
    <div className="sample-password">
      <code>r7K!q9Zp#e2Lm4vQ</code>
      <button
        aria-label="Copy example password"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText("r7K!q9Zp#e2Lm4vQ");
            setCopied(true);
          } catch {
            setCopied(false);
          }
        }}
      >
        {copied ? <Check size={15} /> : <Copy size={15} />}
      </button>
      <span className="sr-only" role="status">
        {copied
          ? "Example copied. Generate a unique password in your vault."
          : ""}
      </span>
    </div>
  );
}

export function LandingPage() {
  useEffect(() => {
    const previous = document.title;
    document.title = "Vaultessa — A little less to remember";
    return () => {
      document.title = previous;
    };
  }, []);
  return (
    <div className="landing-page">
      <LandingIntegrations />
      <a className="landing-skip" href="#main">
        Skip to content
      </a>
      <MarketingHeader />
      <main id="main">
        <section className="landing-hero landing-container">
          <div className="hero-copy">
            <p className="landing-eyebrow">Your private password vault</p>
            <h1>
              A little less
              <br />
              to remember.
            </h1>
            <p className="hero-description">
              Keep your passwords organised, share securely, and stay in control
              of your keys.
            </p>
            <div className="hero-actions">
              <SignupLink location="hero">Create your vault</SignupLink>
              <a className="landing-text-link" href="/features">
                Explore features <ArrowRight size={18} />
              </a>
            </div>
          </div>
          <div className="hero-art">
            <img
              src={heroImage}
              alt="Three people using their devices beside a secure vault, surrounded by protected login cards"
              width="1536"
              height="1024"
              fetchPriority="high"
            />
          </div>
        </section>
        <section
          className="landing-benefits landing-container"
          aria-label="Why Vaultessa"
        >
          {benefits.map(({ icon: Icon, title, text }) => (
            <article key={title}>
              <span className="landing-icon">
                <Icon />
              </span>
              <div>
                <h2>{title}</h2>
                <p>{text}</p>
              </div>
            </article>
          ))}
        </section>
        <section id="features" className="landing-features">
          <div className="landing-container">
            <p className="landing-eyebrow">A smarter way to manage passwords</p>
            <h2 className="landing-section-title">
              Everything important. Safely together.
            </h2>
            <p className="landing-section-description">
              A clean, powerful vault for your logins, secure notes and more —
              designed for everyday life.
            </p>
            <div className="features-grid">
              <VaultDemo />
              <div className="feature-cards">
                {features.map(({ icon: Icon, title, text, points }, i) => (
                  <article className="landing-feature-card" key={title}>
                    <div className="feature-card-heading">
                      <span className="landing-icon">
                        <Icon />
                      </span>
                      <div>
                        <h3>{title}</h3>
                        <p>{text}</p>
                      </div>
                    </div>
                    {i === 0 && <GeneratorSample />}
                    <ul>
                      {points.map((point) => (
                        <li key={point}>
                          <Check size={14} />
                          {point}
                        </li>
                      ))}
                    </ul>
                  </article>
                ))}
              </div>
            </div>
          </div>
        </section>
        <section id="security" className="landing-security landing-container">
          <div>
            <p className="landing-eyebrow">Security starts on your device</p>
            <h2 className="landing-section-title">
              Private by design.
              <br />
              Protected by you.
            </h2>
            <p className="landing-section-description">
              Your master password unlocks your vault in your browser. Our
              servers store encrypted vault data and protected keys.
            </p>
            <Link className="landing-text-link" to="/register">
              Take control of your passwords <ArrowRight size={18} />
            </Link>
          </div>
          <div className="security-grid">
            {[
              {
                icon: LockKeyhole,
                title: "Browser-side encryption",
                text: "Vault contents are encrypted with AES-GCM before being sent to the backend.",
              },
              {
                icon: ShieldCheck,
                title: "An extra layer at sign-in",
                text: "Use an authenticator app for two-step verification and keep your backup codes safe.",
              },
              {
                icon: KeyRound,
                title: "A recovery key you keep",
                text: "Save your recovery key outside Vaultessa. Recovering your vault requires both email verification and that key.",
              },
              {
                icon: Users,
                title: "Share with intention",
                text: "Choose which items to share and manage who can access them.",
              },
            ].map(({ icon: Icon, title, text }) => (
              <article key={title}>
                <span className="landing-icon">
                  <Icon />
                </span>
                <h3>{title}</h3>
                <p>{text}</p>
              </article>
            ))}
          </div>
        </section>
        <section id="how-it-works" className="landing-how">
          <div className="landing-container">
            <p className="landing-eyebrow">Simple from the start</p>
            <h2 className="landing-section-title">
              Three steps to a little more peace of mind.
            </h2>
            <div className="steps-grid">
              {[
                [
                  "Create your vault",
                  "Choose a strong master password and verify your email. Your browser prepares your encryption keys.",
                ],
                [
                  "Make yourself at home",
                  "Add logins and notes, organise them into folders, and generate unique passwords.",
                ],
                [
                  "Keep your way back",
                  "Set up two-step verification and save your vault recovery key somewhere secure outside Vaultessa.",
                ],
              ].map(([title, text], i) => (
                <article key={title}>
                  <span className="step-number">0{i + 1}</span>
                  <h3>{title}</h3>
                  <p>{text}</p>
                </article>
              ))}
            </div>
          </div>
        </section>
        <section className="landing-faq landing-container">
          <p className="landing-eyebrow">A few things you might be wondering</p>
          <h2 className="landing-section-title">
            Good questions. Clear answers.
          </h2>
          {[
            [
              "Can Vaultessa read my saved passwords?",
              "Your vault contents are encrypted in your browser. The backend stores encrypted data, rather than your readable vault contents.",
            ],
            [
              "What if I forget my master password?",
              "If you have set up vault recovery, verify your registered email and use your saved recovery key to set a new master password. Without your master password or recovery key, your encrypted vault cannot be unlocked.",
            ],
            [
              "Can I share a password without sharing my vault?",
              "Yes. Share selected items with other users or create a secure sharing link. Manage the access and limits available for that sharing method.",
            ],
            [
              "Do I need to install anything?",
              "You can use Vaultessa in your browser. Create an account or log in to access your vault.",
            ],
          ].map(([question, answer]) => (
            <details key={question}>
              <summary>
                {question}
                <ChevronDown size={18} />
              </summary>
              <p>{answer}</p>
            </details>
          ))}
        </section>
        <section className="landing-cta landing-container">
          <Sparkles className="cta-sparkle" size={46} />
          <h2>Make room for peace of mind.</h2>
          <p>
            Your passwords, your data, your control — all in one secure place.
          </p>
          <SignupLink location="footer">Get started</SignupLink>
        </section>
      </main>
      <footer className="landing-footer landing-container">
        <VaultessaLogo />
        <p>© {new Date().getFullYear()} Vaultessa</p>
        <a href="/security">Security</a>
        <Link to="/login">Log in</Link>
        <button
          onClick={() => window.dispatchEvent(new Event("vaultessa:privacy"))}
        >
          Privacy preferences
        </button>
      </footer>
    </div>
  );
}
