import type { Metadata } from "next";
import { Inter, Plus_Jakarta_Sans } from "next/font/google";
import { Sparkles } from "lucide-react";
import ThemeToggle, { THEME_INIT } from "./theme";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-jakarta",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Razorpay Phoenix — left-shifted revenue recovery",
  description: "The cheapest recovery is the one that never becomes a failure.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${inter.variable} ${jakarta.variable} scroll-smooth`}
    >
      <head>
        {/* Before first paint, so the theme never flashes the wrong way. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT }} />
      </head>
      <body className="min-h-dvh bg-surface-0 font-sans text-ink-1 antialiased">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-surface-1 focus:px-3 focus:py-2 focus:text-sm"
        >
          Skip to content
        </a>
        <Nav />
        {children}
        <Footer />
      </body>
    </html>
  );
}

function Nav() {
  return (
    <header className="sticky top-0 z-50 border-b border-line glass">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between gap-4">
          <a href="/" className="group flex items-center gap-2">
            <span className="flex size-8 items-center justify-center rounded-lg bg-ink-1 text-surface-0 shadow-lg shadow-shade/20 transition-transform duration-300 group-hover:scale-105">
              <Sparkles className="size-[18px]" strokeWidth={3} aria-hidden />
            </span>
            <span className="font-display text-sm font-bold tracking-tight">Phoenix</span>
          </a>

          <nav className="hidden items-center gap-8 text-[13px] font-medium text-ink-2 md:flex">
            <a href="/#windows" className="transition-colors hover:text-ink-1">
              Windows
            </a>
            <a href="/#simulate" className="transition-colors hover:text-ink-1">
              Live demo
            </a>
            <a href="/dashboard" className="transition-colors hover:text-ink-1">
              Results
            </a>
            <a href="/dashboard#limits" className="transition-colors hover:text-ink-1">
              Limits
            </a>
          </nav>

          <div className="flex items-center gap-3">
            <ThemeToggle />
            <a
              href="/#simulate"
              className="inline-flex items-center justify-center rounded-full bg-ink-1 px-4 py-2 text-[13px] font-semibold text-surface-0 shadow-sm transition-all hover:shadow-md active:scale-95"
            >
              Break a payment
            </a>
          </div>
        </div>
      </div>
    </header>
  );
}

function Footer() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto max-w-7xl px-4 py-12 text-xs leading-relaxed text-ink-3 sm:px-6 lg:px-8">
        Razorpay AI Buildathon · Track 03. Every number on these pages carries its tier — A is live
        evidence, B is deterministic simulation. Nothing is rounded in Phoenix&apos;s favour.
      </div>
    </footer>
  );
}
