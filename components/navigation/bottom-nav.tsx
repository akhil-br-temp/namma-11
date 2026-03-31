"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { HomeIcon, LeagueIcon, MatchesIcon, TeamIcon } from "@/components/ui/d11-icons";

const items = [
  { href: "/dashboard", label: "Home", Icon: HomeIcon },
  { href: "/matches", label: "Matches", Icon: MatchesIcon },
  { href: "/my-teams", label: "My Teams", Icon: TeamIcon },
  { href: "/league", label: "League", Icon: LeagueIcon },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-zinc-800 bg-black/90 backdrop-blur">
      <ul className="mx-auto flex h-16 w-full max-w-md items-center justify-around px-3">
        {items.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = item.Icon;

          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                className={cn("d11-nav-item", isActive && "is-active")}
              >
                <span className="d11-nav-icon" aria-hidden>
                  <Icon className="h-3.5 w-3.5" />
                </span>
                <span className="text-[11px] font-semibold leading-none">{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
