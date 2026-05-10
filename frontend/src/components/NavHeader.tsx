"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BACKEND_URL } from "@/lib/api";

const LINKS = [
  { href: "/", label: "Console" },
  { href: "/builder", label: "Builder" },
];

export function NavHeader() {
  const pathname = usePathname();
  return (
    <header className="border-b border-zinc-800 bg-zinc-950">
      <div className="max-w-6xl mx-auto px-6 py-3 flex items-center gap-6">
        <div className="font-semibold tracking-tight text-zinc-100">OrchestAI</div>
        <nav className="flex items-center gap-1">
          {LINKS.map((l) => {
            const active = pathname === l.href;
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`px-3 py-1.5 rounded text-sm transition-colors ${
                  active
                    ? "bg-zinc-800 text-zinc-100"
                    : "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/50"
                }`}
              >
                {l.label}
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto text-xs text-zinc-500 font-mono">{BACKEND_URL}</div>
      </div>
    </header>
  );
}
