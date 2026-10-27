import type { ReactNode } from "react";

function Svg({ children }: { children: ReactNode }) {
  return (
    <svg
      className="icon-svg"
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export function StatusIcon() {
  return (
    <Svg>
      <path d="M1.5 8h3l1.5-4.5 4 9 1.5-4.5h3" />
    </Svg>
  );
}

export function ServersIcon() {
  return (
    <Svg>
      <rect x="2" y="2.5" width="12" height="4.5" rx="1.2" />
      <rect x="2" y="9" width="12" height="4.5" rx="1.2" />
      <path d="M4.5 4.75h.01M4.5 11.25h.01" />
    </Svg>
  );
}

export function ProfilesIcon() {
  return (
    <Svg>
      <path d="M8 1.75 14 5 8 8.25 2 5z" />
      <path d="M2 8l6 3.25L14 8" />
      <path d="M2 11l6 3.25L14 11" />
    </Svg>
  );
}

export function SkillsIcon() {
  return (
    <Svg>
      <path d="M2.5 3h4A1.5 1.5 0 0 1 8 4.5V13a1.5 1.5 0 0 0-1.5-1.5h-4z" />
      <path d="M13.5 3h-4A1.5 1.5 0 0 0 8 4.5V13a1.5 1.5 0 0 1 1.5-1.5h4z" />
    </Svg>
  );
}

export function ProjectsIcon() {
  return (
    <Svg>
      <path d="M1.75 4.25A1.25 1.25 0 0 1 3 3h3l1.5 1.75H13a1.25 1.25 0 0 1 1.25 1.25v5.75A1.25 1.25 0 0 1 13 13H3a1.25 1.25 0 0 1-1.25-1.25z" />
    </Svg>
  );
}

export function PlusIcon() {
  return (
    <Svg>
      <path d="M8 3v10M3 8h10" />
    </Svg>
  );
}

export function ChevronIcon() {
  return (
    <Svg>
      <path d="M6 3.5 10.5 8 6 12.5" />
    </Svg>
  );
}
