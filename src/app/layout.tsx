import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Razorpay Phoenix — left-shifted revenue recovery",
  description: "The cheapest recovery is the one that never becomes a failure.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh bg-surface-0 font-sans text-ink-1 antialiased">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-surface-2 focus:px-3 focus:py-2 focus:text-sm"
        >
          Skip to content
        </a>
        <Nav />
        {children}
        <footer className="mx-auto max-w-6xl px-6 py-16 text-xs text-ink-3">
          Razorpay AI Buildathon · Track 03. Every number on these pages carries its tier —
          A is live evidence, B is deterministic simulation. Nothing is rounded in Phoenix&apos;s
          favour.
        </footer>
      </body>
    </html>
  );
}

function Nav() {
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-surface-0/75 backdrop-blur-xl">
      <nav className="mx-auto flex max-w-6xl items-center gap-6 px-6 py-3.5 text-sm">
        <a href="/" className="flex items-center gap-2 font-medium">
          <span
            aria-hidden
            className="size-2 rounded-full bg-series-2 shadow-[0_0_12px_var(--color-series-2)]"
          />
          Phoenix
        </a>
        <span className="hidden text-ink-3 sm:inline">left-shifted revenue recovery</span>
        <div className="ml-auto flex items-center gap-1">
          <a
            href="/"
            className="rounded-lg px-3 py-1.5 text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink-1"
          >
            Checkout
          </a>
          <a
            href="/dashboard"
            className="rounded-lg px-3 py-1.5 text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink-1"
          >
            Dashboard
          </a>
        </div>
      </nav>
    </header>
  );
}
