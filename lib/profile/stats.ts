import type { SupabaseClient } from "@supabase/supabase-js";

// The numbers on the profile page. Every count runs with the signed-in user's client, so RLS
// limits it to their own conversations, questions and ratings; nothing here filters by user.
export type ProfileStats = {
  conversations: number;
  questions: number;
  helpful: number;
};

export async function profileStats(
  supabase: SupabaseClient,
): Promise<ProfileStats> {
  const [conversations, questions, helpful] = await Promise.all([
    supabase.from("conversations").select("id", { count: "exact", head: true }),
    supabase
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("role", "user"),
    supabase
      .from("message_feedback")
      .select("id", { count: "exact", head: true })
      .eq("rating", "up"),
  ]);
  for (const r of [conversations, questions, helpful]) {
    if (r.error)
      throw new Error(
        `could not count for the profile page: ${r.error.message}`,
      );
  }
  return {
    conversations: conversations.count ?? 0,
    questions: questions.count ?? 0,
    helpful: helpful.count ?? 0,
  };
}

// How long someone has been a member, in words: "2 days", "3 weeks", "5 months".
export function memberFor(createdAt: string, now: Date = new Date()): string {
  const days = Math.max(
    0,
    Math.floor((now.getTime() - new Date(createdAt).getTime()) / 86_400_000),
  );
  const plural = (n: number, unit: string) =>
    `${n} ${unit}${n === 1 ? "" : "s"}`;
  if (days < 1) return "Under a day";
  if (days < 14) return plural(days, "day");
  if (days < 61) return plural(Math.floor(days / 7), "week");
  if (days < 730) return plural(Math.floor(days / 30), "month");
  return plural(Math.floor(days / 365), "year");
}
