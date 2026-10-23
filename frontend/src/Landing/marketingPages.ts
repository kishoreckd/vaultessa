export const marketingPages = {
  features: {
    path: "/features",
    title: "Features",
    eyebrow: "A home for your digital life",
    headline: "Everything you need.\nOne calmer place.",
    description:
      "Bring your logins, notes and shared secrets together in a vault built for everyday life.",
    image: "features",
    alt: "People organising login cards and sharing a protected item beside a laptop",
    sections: [
      {
        eyebrow: "Your everyday essentials",
        title: "Find what you need. Get on with your day.",
        text: "Keep logins and secure notes together, organise items into folders, and search your vault when you need something. Your readable vault stays on your device while it is unlocked.",
        points: [
          "Organise with folders",
          "Search saved items",
          "Keep logins and notes together",
        ],
      },
      {
        eyebrow: "Stronger habits, less effort",
        title: "A fresh password for every account.",
        text: "Generate passwords with the length and character options you choose. Save unique credentials in your vault instead of reusing a memorable password across services.",
        points: [
          "Choose length and character sets",
          "Generate in your browser",
          "Save the result with its login",
        ],
      },
      {
        eyebrow: "Share deliberately",
        title: "The right item. The right people.",
        text: "Share individual items with other users, work with your organisation, or create a secure sharing link. Review the permissions and limits available for each sharing method before sending.",
        points: [
          "Individual item sharing",
          "Organisation and team workflows",
          "Manage sharing access",
        ],
      },
      {
        eyebrow: "Prepare your way back",
        title: "Recovery starts before you need it.",
        text: "Set up vault recovery and save your recovery key or QR outside Vaultessa. If you forget your master password, email verification and your saved recovery key are both required.",
        points: [
          "Save a recovery key or QR",
          "Keep the key outside your vault",
          "Separate vault recovery from two-step backup codes",
        ],
      },
    ],
    next: "/how-it-works",
    nextLabel: "See how it works",
  },
  security: {
    path: "/security",
    title: "Security",
    eyebrow: "Understand what protects your vault",
    headline: "Your secrets.\nYour side of the lock.",
    description:
      "Security should be understandable. Here is what happens on your device, what our backend stores, and where your responsibility begins.",
    image: "security",
    alt: "People protecting a laptop with a key and shield beside encrypted cloud storage",
    sections: [
      {
        eyebrow: "On your device",
        title: "Encryption begins in your browser.",
        text: "Your browser derives keys from your master password and encrypts vault contents with AES-GCM before sending them to the backend. Unlocking decrypts the data locally; unlocked keys are held in application memory.",
        points: [
          "Browser-side vault encryption",
          "Password-based key derivation",
          "Unlocked vault keys held in memory",
        ],
      },
      {
        eyebrow: "On our backend",
        title: "Protected storage, not a readable vault.",
        text: "The database stores encrypted vault data and protected keys. Authentication uses a derived proof rather than sending the raw master password. Account and operational metadata still exist; encryption of vault contents does not make all activity anonymous.",
        points: [
          "Encrypted vault contents",
          "Protected key material",
          "Account metadata is separate from secret contents",
        ],
      },
      {
        eyebrow: "More than a password",
        title: "Add another step to sign-in.",
        text: "Enable an authenticator app for two-step verification, save its recovery codes safely, and review active sessions. These backup codes help with two-step verification; they do not replace your vault recovery key.",
        points: [
          "Authenticator-based verification",
          "Two-step recovery codes",
          "Session review and revocation",
        ],
      },
      {
        eyebrow: "Know the limits",
        title: "Keep your recovery key. Protect your device.",
        text: "Vault recovery needs both your registered email and saved recovery key. Without your master password or recovery key, encrypted vault contents cannot be unlocked. A compromised device or malicious browser extension can still put an unlocked vault at risk.",
        points: [
          "Store recovery material separately",
          "Use a strong master password",
          "Keep devices and browsers updated",
        ],
      },
    ],
    next: "/how-it-works",
    nextLabel: "Walk through the setup",
  },
  "how-it-works": {
    path: "/how-it-works",
    title: "How it works",
    eyebrow: "From getting started to feeling settled",
    headline: "A few small steps.\nA little more peace of mind.",
    description:
      "Create your vault, make it your own, and prepare a recovery plan. Here is what to expect along the way.",
    image: "how-it-works",
    alt: "Three people creating a vault, organising passwords and saving a recovery key",
    sections: [
      {
        eyebrow: "01 · Create your account",
        title: "Start with a password only you know.",
        text: "Enter your name and email, choose a strong master password, and verify your email. Your browser prepares the encryption keys used for your vault. Choose something strong that you can remember and keep private.",
        points: [
          "Choose a unique master password",
          "Verify your email address",
          "Browser prepares your vault keys",
        ],
      },
      {
        eyebrow: "02 · Make yourself at home",
        title: "Add your first few essentials.",
        text: "Save a login or secure note, create folders, and use the password generator when updating an account. Saving a new password in Vaultessa does not automatically change it on the original service.",
        points: [
          "Save a login or secure note",
          "Organise items into folders",
          "Update the original service when changing passwords",
        ],
      },
      {
        eyebrow: "03 · Prepare a recovery plan",
        title: "Give your future self a way back.",
        text: "Set up vault recovery and save the recovery key or QR somewhere safe outside your vault. Add an authenticator app for two-step verification and keep its backup codes separately. These are two different recovery mechanisms.",
        points: [
          "Save the vault recovery key",
          "Enable two-step verification",
          "Keep two-step backup codes safe",
        ],
      },
      {
        eyebrow: "04 · Use it every day",
        title: "Open, organise, share, and lock.",
        text: "Unlock your vault when you need it, search for saved items, and share only what is needed. Review permissions and sessions periodically, then lock your vault when you are finished.",
        points: [
          "Unlock with your master password",
          "Review sharing permissions",
          "Lock when you step away",
        ],
      },
    ],
    next: "/features",
    nextLabel: "Explore all features",
  },
} as const;
export type MarketingPageKey = keyof typeof marketingPages;

export function publicAnalyticsPage(path: string) {
  if (path === "/") return { path, title: "Vaultessa landing page" };
  const page = Object.values(marketingPages).find(
    (entry) => entry.path === path,
  );
  return page ? { path: page.path, title: `${page.title} — Vaultessa` } : null;
}
