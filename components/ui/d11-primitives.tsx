import type { ButtonHTMLAttributes, HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type D11SurfaceTag = "div" | "section" | "article";
type D11SurfaceTone = "default" | "soft" | "hero";

type D11SurfaceProps = HTMLAttributes<HTMLElement> & {
  as?: D11SurfaceTag;
  tone?: D11SurfaceTone;
};

const surfaceToneClass: Record<D11SurfaceTone, string> = {
  default: "d11-surface",
  soft: "d11-surface-soft",
  hero: "d11-surface-hero",
};

export function D11Surface({ as = "article", tone = "default", className, ...props }: D11SurfaceProps) {
  const Component = as;
  return <Component className={cn(surfaceToneClass[tone], className)} {...props} />;
}

type D11ButtonVariant = "primary" | "secondary";

type D11ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: D11ButtonVariant;
};

const buttonVariantClass: Record<D11ButtonVariant, string> = {
  primary: "d11-btn-primary",
  secondary: "d11-btn-secondary",
};

export function D11Button({ variant = "secondary", className, ...props }: D11ButtonProps) {
  return <button className={cn("d11-btn", buttonVariantClass[variant], className)} {...props} />;
}

export function d11ActionClass(variant: D11ButtonVariant = "secondary") {
  return cn("d11-btn", buttonVariantClass[variant]);
}
