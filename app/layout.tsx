import type { Metadata } from "next";
import { connection } from "next/server";
import { Geist, Geist_Mono } from "next/font/google";
import { appearanceFrom, DEFAULT_APPEARANCE } from "@/lib/appearance";
import { createClient } from "@/lib/supabase/server";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "KQ Policy Assistant",
  description:
    "A policy assistant for Kenya Airways passengers and call-centre agents. Independent academic project, not affiliated with Kenya Airways.",
};

// Every page is rendered per request, so it can carry that request's CSP nonce (proxy.ts).
// The pages depend on the signed-in user anyway, so nothing is lost.
export default async function RootLayout({ children }: LayoutProps<"/">) {
  await connection();
  const { theme, textSize } = await appearance();
  return (
    <html
      lang="en"
      data-theme={theme}
      data-text-size={textSize}
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}

// The signed-in user's display preferences (overview §7.5), set on <html> so the first paint is
// already right. Read from the session cookie without a call to Supabase: proxy.ts has checked the
// session, and these only change how the page looks, so an unverified value can't grant anything.
async function appearance() {
  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getSession();
    return appearanceFrom(data.session?.user.user_metadata);
  } catch {
    return DEFAULT_APPEARANCE;
  }
}
