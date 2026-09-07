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
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="brand-logo">
                <defs>
                  <linearGradient id="brand-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="var(--seen)" />
                    <stop offset="100%" stopColor="var(--hidden)" />
                  </linearGradient>
                </defs>
                <path d="M12 2 L22 7 V17 L12 22 L2 17 V7 L12 2 Z" stroke="url(#brand-grad)" strokeWidth="2.5" strokeLinejoin="round" />
                <path d="M12 7 V22 M2 7 L12 12 L22 7" stroke="url(#brand-grad)" strokeWidth="2" strokeLinejoin="round" opacity="0.6" />
                <circle cx="12" cy="12" r="3" fill="var(--seen)" style={{ filter: 'drop-shadow(0 0 4px var(--seen))' }} />
              </svg>
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
