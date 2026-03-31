"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const items = [
  { href: "/dashboard", label: "Home" },
  { href: "/matches", label: "Matches" },
  { href: "/my-teams", label: "My Teams" },
  { href: "/league", label: "League" },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-zinc-800 bg-black/90 backdrop-blur">
      <ul className="mx-auto flex h-16 w-full max-w-md items-center justify-around px-3">
        {items.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                className={cn(
                  "flex h-11 items-center justify-center rounded-xl text-sm font-semibold transition",
                  isActive
                    ? "bg-gradient-to-r from-red-700 to-red-500 text-white shadow-[0_8px_24px_rgba(220,38,38,0.45)]"
                    : "text-zinc-400 hover:bg-zinc-800/80 hover:text-zinc-100"
                )}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
