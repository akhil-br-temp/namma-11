import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

const baseProps: IconProps = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round",
  strokeLinejoin: "round",
};

export function HomeIcon(props: IconProps) {
  return (
    <svg {...baseProps} {...props}>
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5.5 9.5V20h13V9.5" />
      <path d="M10 20v-5h4v5" />
    </svg>
  );
}

export function MatchesIcon(props: IconProps) {
  return (
    <svg {...baseProps} {...props}>
      <rect x="3" y="4.5" width="18" height="16.5" rx="3" />
      <path d="M8 3v3" />
      <path d="M16 3v3" />
      <path d="M3 9h18" />
      <path d="M8 13h3" />
      <path d="M13.5 13h2.5" />
      <path d="M8 17h8" />
    </svg>
  );
}

export function TeamIcon(props: IconProps) {
  return (
    <svg {...baseProps} {...props}>
      <path d="M12 3 19 6v6c0 4.5-2.8 7.8-7 9-4.2-1.2-7-4.5-7-9V6l7-3Z" />
      <path d="M9.25 12h5.5" />
      <path d="M12 9.25v5.5" />
    </svg>
  );
}

export function LeagueIcon(props: IconProps) {
  return (
    <svg {...baseProps} {...props}>
      <path d="M8 4h8v2.5a4 4 0 0 1-8 0V4Z" />
      <path d="M8 5.5H5.75a1.75 1.75 0 0 0 0 3.5H8" />
      <path d="M16 5.5h2.25a1.75 1.75 0 0 1 0 3.5H16" />
      <path d="M12 10.5v4" />
      <path d="M9 21h6" />
      <path d="M10 14.5h4l1.75 3.5H8.25L10 14.5Z" />
    </svg>
  );
}

export function PlayersIcon(props: IconProps) {
  return (
    <svg {...baseProps} {...props}>
      <circle cx="8" cy="9" r="2.5" />
      <circle cx="16" cy="10" r="2" />
      <path d="M4.5 18a3.5 3.5 0 0 1 3.5-3.5h0A3.5 3.5 0 0 1 11.5 18" />
      <path d="M13.5 18a2.5 2.5 0 0 1 5 0" />
    </svg>
  );
}

export function CaptainIcon(props: IconProps) {
  return (
    <svg {...baseProps} {...props}>
      <path d="m12 3.5 2.3 4.7 5.2.8-3.8 3.7.9 5.3-4.6-2.4-4.6 2.4.9-5.3L4.5 9l5.2-.8L12 3.5Z" />
    </svg>
  );
}
