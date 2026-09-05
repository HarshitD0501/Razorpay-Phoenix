"use client";

/**
 * Theme toggle. Two states, persisted; the pre-paint script in layout.tsx sets
 * the class before first paint so there is no flash. This component only
 * mirrors what is already on <html>.
 */
import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

/** Runs before paint, inlined in <head>. Keep in sync with toggle() below. */
export const THEME_INIT = `try{var t=localStorage.getItem("theme")||(matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light");document.documentElement.classList.toggle("dark",t==="dark")}catch(e){}`;

export default function ThemeToggle() {
  const [dark, setDark] = useState(false);

  // Read the class the pre-paint script set, rather than guessing a default —
  // otherwise the icon disagrees with the page on first render.
  useEffect(() => setDark(document.documentElement.classList.contains("dark")), []);

  function toggle() {
    const next = !dark;
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("theme", next ? "dark" : "light");
    setDark(next);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={dark}
      aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
      title={dark ? "Light theme" : "Dark theme"}
      className="inline-flex size-9 items-center justify-center rounded-full border border-line text-ink-2 transition-colors hover:border-line-strong hover:bg-surface-2 hover:text-ink-1"
    >
      {dark ? <Sun className="size-4" aria-hidden /> : <Moon className="size-4" aria-hidden />}
    </button>
  );
}
