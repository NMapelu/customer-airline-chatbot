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
// already right. They travel in the verified session token's user_metadata claim. They only
// change how the page looks; signed out, or on any error, the defaults apply.
async function appearance() {
  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getClaims();
    return appearanceFrom(data?.claims.user_metadata);
  } catch {
    return DEFAULT_APPEARANCE;
  }
}
