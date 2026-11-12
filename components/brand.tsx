// The app's name with a small plane mark. Not the airline's logo: this is an independent project.
export function Brand({ tone = 'dark' }: { tone?: 'dark' | 'light' }) {
  return (
    <span className="flex items-center gap-2">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-[#c8102e] text-white" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" focusable="false">
          <path d="M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5Z" />
        </svg>
      </span>
      <span className="leading-tight">
        <span className={`block text-sm font-bold ${tone === 'dark' ? 'text-white' : 'text-foreground'}`}>KQ Chatbot</span>
        <span className={`block text-[11px] ${tone === 'dark' ? 'text-zinc-400' : 'text-muted'}`}>Your travel questions answered</span>
      </span>
    </span>
  );
}
