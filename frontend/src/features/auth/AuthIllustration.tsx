/** Decorative, logo-free artwork that follows the app's light/dark palette. */
export function AuthIllustration({ recovery = false }: { recovery?: boolean }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 280 150"
      className="mx-auto mb-3 h-32 w-full max-w-64 text-primary"
      fill="none"
    >
      <ellipse cx="140" cy="132" rx="88" ry="9" fill="currentColor" opacity=".07" />
      <circle cx="140" cy="73" r="62" fill="currentColor" opacity=".06" />
      <path
        d="M40 45h10m-5-5v10M228 97h10m-5-5v10"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        opacity=".45"
      />
      <circle cx="225" cy="36" r="4" fill="currentColor" opacity=".3" />
      <rect x="66" y="52" width="148" height="74" rx="14" fill="currentColor" opacity=".12" />
      <rect
        x="95"
        y="23"
        width="91"
        height="88"
        rx="12"
        className="fill-card"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path
        d="M112 42h55M112 53h37"
        stroke="currentColor"
        strokeWidth="4"
        strokeLinecap="round"
        opacity=".25"
      />
      {[0, 1, 2, 3, 4, 5].map((n) => (
        <circle key={n} cx={113 + n * 11} cy="72" r="3" fill="currentColor" />
      ))}
      <path
        d="m68 62 64 43a15 15 0 0 0 16 0l64-43v51a13 13 0 0 1-13 13H81a13 13 0 0 1-13-13Z"
        className="fill-card"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path d="m71 122 46-34m92 34-46-34" stroke="currentColor" strokeWidth="2" opacity=".25" />
      <circle cx="202" cy="104" r="24" className="fill-card" stroke="currentColor" strokeWidth="2" />
      {recovery ? (
        <path
          d="M197 105a7 7 0 1 1 7-7m-7 7-7 12m4-7 4 3m-6 0 4 3"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
        />
      ) : (
        <path
          d="m191 104 7 7 15-16"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
    </svg>
  );
}
