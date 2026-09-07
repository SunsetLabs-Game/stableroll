import type { Metadata } from "next";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "StableRoll",
  description:
    "Fund a payroll run once on Starknet. Recipients claim privately, and the chain " +
    "proves every promised recipient was paid.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body>
        <header className="site-header">
          <div className="shell">
            <Link href="/" className="wordmark">
              StableRoll
            </Link>
            <nav>
              <Link href="/admin">Run a payroll</Link>
              <Link href="/claim">Claim a payment</Link>
            </nav>
          </div>
        </header>

        <Providers>{children}</Providers>

        <footer className="site-footer">
          <div className="shell">
            <span>
              Private payroll on Starknet. Built for the STRK20 Private Sprint.
            </span>
            <a href="https://github.com/SunsetLabs-Game/stableroll">Source on GitHub</a>
          </div>
        </footer>
      </body>
    </html>
  );
}
