"use client";

import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/utils";

export type SegmentedTabItem = {
  id: string;
  label: string;
  icon?: ReactNode;
};

type SegmentedTabsProps = {
  items: SegmentedTabItem[];
  activeId: string;
  onChange: (id: string) => void;
  className?: string;
};

export function SegmentedTabs({ items, activeId, onChange, className }: SegmentedTabsProps) {
  const safeItems = items.length > 0 ? items : [{ id: "default", label: "Tab" }];
  const activeIndex = Math.max(
    0,
    safeItems.findIndex((item) => item.id === activeId)
  );

  const rootStyle = {
    "--tab-count": String(safeItems.length),
  } as CSSProperties;

  const gliderStyle = {
    transform: `translateX(${activeIndex * 100}%)`,
  } as CSSProperties;

  return (
    <div className={cn("d11-tabs", className)} style={rootStyle} role="tablist" aria-label="Options">
      <span className="d11-tabs-glider" style={gliderStyle} aria-hidden />
      {safeItems.map((item) => {
        const active = item.id === activeId;

        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(item.id)}
            className={cn("d11-tab-trigger", active && "active")}
          >
            {item.icon ? <span className="d11-tab-icon" aria-hidden>{item.icon}</span> : null}
            <span>{item.label}</span>
          </button>
        );
      })}
    </div>
  );
}
