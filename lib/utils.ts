import { type ClassValue, clsx } from "clsx";

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

export function getTeamLogo(short_name?: string): string {
  if (!short_name) return "/favicon.ico";
  return `/team-logos/${short_name.toLowerCase()}.png`;
}
