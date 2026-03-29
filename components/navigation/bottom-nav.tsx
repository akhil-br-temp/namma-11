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
    <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-slate-200 bg-white/95 backdrop-blur">
      <ul className="mx-auto flex h-16 w-full max-w-md items-center justify-around px-2">
        {items.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                className={cn(
                  "flex h-11 items-center justify-center rounded-xl text-sm font-semibold transition",
                  isActive ? "bg-teal-700 text-teal-50" : "text-slate-500 hover:bg-slate-100"
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
