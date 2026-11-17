// The greeting at the top of the profile page: the person's first name, today's date and a small
// travel picture (a boarding pass and a plane over clouds). The picture is decorative.
export function ProfileBanner({ firstName, today }: { firstName: string | null; today: string }) {
  return (
    <section className="sidebar relative overflow-hidden rounded-2xl px-6 py-7 sm:px-8">
      <div className="relative z-10 max-w-sm">
        <p className="text-xs font-semibold uppercase tracking-widest text-[#ff7385]">{today}</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
          {firstName ? `Hi, ${firstName}` : 'Hi there'}
        </h1>
        <p className="mt-2 text-sm text-zinc-300">Ready for your next trip? Here is your KQ Chatbot at a glance.</p>
      </div>
      <TravelPicture />
    </section>
  );
}

function TravelPicture() {
  return (
    <svg
      viewBox="0 0 320 180"
      className="pointer-events-none absolute -right-6 bottom-0 hidden h-full w-auto opacity-95 sm:block"
      aria-hidden="true"
      focusable="false"
    >
      {/* clouds */}
      <g fill="#ffffff" fillOpacity="0.07">
        <ellipse cx="250" cy="40" rx="48" ry="12" />
        <ellipse cx="275" cy="32" rx="26" ry="10" />
        <ellipse cx="120" cy="150" rx="60" ry="12" />
      </g>
      {/* route and plane */}
      <path d="M20 150 C 90 90, 170 70, 300 30" fill="none" stroke="#c8102e" strokeWidth="2" strokeDasharray="5 7" />
      <path
        d="M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5Z"
        transform="translate(214 58) rotate(72) scale(1.2) translate(-12 -12)"
        fill="#ffffff"
      />
      {/* boarding pass */}
      <g transform="translate(150 96) rotate(-8)">
        <rect width="140" height="64" rx="8" fill="#ffffff" />
        <rect width="140" height="16" rx="8" fill="#c8102e" />
        <rect y="8" width="140" height="8" fill="#c8102e" />
        <line x1="104" y1="20" x2="104" y2="60" stroke="#d4d4d8" strokeDasharray="3 3" />
        <text x="10" y="40" fontSize="15" fontWeight="700" fill="#111114">
          NBO
        </text>
        <text x="56" y="40" fontSize="11" fill="#c8102e">
          ✈
        </text>
        <text x="70" y="40" fontSize="15" fontWeight="700" fill="#111114">
          ?
        </text>
        <rect x="10" y="48" width="80" height="4" rx="2" fill="#e4e4e7" />
        <rect x="112" y="26" width="18" height="28" rx="2" fill="#111114" fillOpacity="0.85" />
      </g>
    </svg>
  );
}
