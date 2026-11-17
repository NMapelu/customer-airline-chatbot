import { Brand } from "@/components/brand";

// Sign-in, sign-up and MFA pages: a dark panel with a flight route, next to one form card. On
// phones the panel shrinks to a header above the card.
export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <main className="grid min-h-dvh md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <section className="sidebar relative flex flex-col justify-between gap-8 overflow-hidden px-6 py-8 md:px-10 md:py-12">
        <FlightPath />
        <div className="relative">
          <Brand />
        </div>
        <div className="relative hidden space-y-4 md:block">
          <h2 className="max-w-sm text-4xl font-semibold leading-tight text-white">
            Your travel questions answered.
          </h2>
          <p className="max-w-sm text-base text-zinc-300">
            Baggage, check-in, refunds, special assistance and more, any time
            before you fly.
          </p>
        </div>
        <BoardingStrip />
      </section>
      <section className="auth-sky flex flex-col items-center justify-center px-4 py-10">
        <div className="card card-brand w-full max-w-md rounded-2xl p-6 shadow-xl sm:p-10">
          {children}
        </div>
      </section>
    </main>
  );
}

// A dashed route arcing across the panel with a plane on it. Decorative only.
function FlightPath() {
  return (
    <svg
      className="pointer-events-none absolute inset-0 hidden h-full w-full md:block"
      viewBox="0 0 400 600"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M-20 520 C 120 470, 260 450, 430 330"
        fill="none"
        stroke="#c8102e"
        strokeOpacity="0.6"
        strokeWidth="2"
        strokeDasharray="6 9"
      />
      <path
        d="M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5Z"
        transform="translate(331 391) rotate(62) scale(1.3) translate(-12 -12)"
        fill="#ffffff"
      />
      <g fill="#ffffff" fillOpacity="0.05">
        <ellipse cx="320" cy="70" rx="70" ry="16" />
        <ellipse cx="360" cy="58" rx="40" ry="14" />
      </g>
    </svg>
  );
}

// A strip styled like the top of a boarding pass. Decorative only: real screen readers skip it.
function BoardingStrip() {
  return (
    <div
      className="relative hidden max-w-sm items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3 md:flex"
      aria-hidden="true"
    >
      <div>
        <p className="text-[10px] uppercase tracking-widest text-zinc-400">
          From
        </p>
        <p className="text-xl font-bold text-white">NBO</p>
      </div>
      <span className="flex flex-1 items-center gap-2 text-[#c8102e]">
        <span className="h-px flex-1 border-t border-dashed border-zinc-500" />
        <svg
          viewBox="0 0 24 24"
          width="18"
          height="18"
          fill="currentColor"
          className="rotate-90"
        >
          <path d="M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5Z" />
        </svg>
        <span className="h-px flex-1 border-t border-dashed border-zinc-500" />
      </span>
      <div className="text-right">
        <p className="text-[10px] uppercase tracking-widest text-zinc-400">
          To
        </p>
        <p className="text-xl font-bold text-white">Anywhere</p>
      </div>
    </div>
  );
}
