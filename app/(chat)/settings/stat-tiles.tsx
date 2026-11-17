import type { ReactNode } from "react";
import { ChatIcon } from "@/components/icons";
import type { ProfileStats } from "@/lib/profile/stats";

const TONES = {
  red: "bg-[#c8102e] text-white",
  ink: "bg-[#111114] text-white",
  soft: "bg-brand-soft text-foreground",
  plain: "card text-foreground",
} as const;

function Tile({
  value,
  label,
  icon,
  tone,
}: {
  value: string;
  label: string;
  icon: ReactNode;
  tone: keyof typeof TONES;
}) {
  return (
    <div className={`flex items-center gap-3 rounded-xl p-4 ${TONES[tone]}`}>
      <span
        className={`flex size-10 shrink-0 items-center justify-center rounded-lg ${tone === "red" || tone === "ink" ? "bg-white/15" : "bg-[#c8102e] text-white"}`}
        aria-hidden="true"
      >
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-2xl font-semibold leading-tight">{value}</p>
        <p
          className={`text-xs ${tone === "red" || tone === "ink" ? "text-white/80" : "text-muted"}`}
        >
          {label}
        </p>
      </div>
    </div>
  );
}

const Svg = ({ children }: { children: ReactNode }) => (
  <svg
    viewBox="0 0 24 24"
    width="18"
    height="18"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    focusable="false"
  >
    {children}
  </svg>
);

// Four numbers about the person's own use of the chatbot.
export function StatTiles({
  stats,
  memberFor,
}: {
  stats: ProfileStats;
  memberFor: string;
}) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Tile
        tone="red"
        value={String(stats.conversations)}
        label="Conversations"
        icon={<ChatIcon />}
      />
      <Tile
        tone="ink"
        value={String(stats.questions)}
        label="Questions asked"
        icon={
          <Svg>
            <circle cx="12" cy="12" r="9" />
            <path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14M12 17.5h.01" />
          </Svg>
        }
      />
      <Tile
        tone="soft"
        value={String(stats.helpful)}
        label="Answers you found helpful"
        icon={
          <Svg>
            <path d="M7 10v11M15 5.9 14 10h5.8a2 2 0 0 1 2 2.3l-1.4 7A2 2 0 0 1 18.5 21H7V10l4.3-7.2a1.9 1.9 0 0 1 3.7 1.1Z" />
          </Svg>
        }
      />
      <Tile
        tone="plain"
        value={memberFor}
        label="Member for"
        icon={
          <Svg>
            <rect x="3" y="5" width="18" height="16" rx="2" />
            <path d="M16 3v4M8 3v4M3 11h18" />
          </Svg>
        }
      />
    </div>
  );
}
