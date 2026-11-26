import type { SVGProps } from "react";

const paths = {
  chart: "M3 3v18h18M7 15v2M11 11v6M15 13v4M19 7v10",
  download: "M12 3v12m-5-5 5 5 5-5M4 21h16",
  bell: "M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4",
  home: "m3 10 9-8 9 8M5 9v12h5v-7h4v7h5V9",
  users:
    "M16 21v-3a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v3M12 6a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM17 3a4 4 0 0 1 0 8M22 21v-3a4 4 0 0 0-4-4",
  alert: "m12 3 10 18H2L12 3Zm0 6v5M12 17h.01",
  clock: "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM12 6v6l4 2",
  refresh: "M20 7a9 9 0 1 0 1 8M20 2v6h-6",
  exit: "M10 3H3v18h7M8 12h13m-5-5 5 5-5 5",
  close: "m6 6 12 12M6 18 18 6",
  search: "m21 21-5-5M19 10a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z",
  box: "m3 7 9-5 9 5v10l-9 5-9-5V7Zm0 0 9 5 9-5M12 12v10M7 4l10 6",
  pin: "M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0ZM15 10a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z",
  calendar: "M5 5h14a2 2 0 0 1 2 2v13H3V7a2 2 0 0 1 2-2ZM7 2v6M17 2v6M3 11h18",
  shield: "m12 2 9 4v6c0 5-9 10-9 10S3 17 3 12V6l9-4Zm-4 10 3 3 5-6",
  message:
    "M21 11a9 9 0 0 1-9 9H3l1-5a9 9 0 1 1 17-4ZM8 11h.01M12 11h.01M16 11h.01",
  image: "M3 3h18v18H3V3Zm0 14 6-6 5 5 3-3 4 4M15 7h.01",
  arrow: "M4 12h16m-6-6 6 6-6 6",
  plus: "M12 4v16M4 12h16",
  menu: "M3 6h18M3 12h18M3 18h18",
  check: "m5 12 4 4L19 6",
  list: "M9 5h12M9 12h12M9 19h12M3 5h.01M3 12h.01M3 19h.01",
  chevron: "m6 9 6 6 6-6",
  headphones:
    "M4 15v-3a8 8 0 0 1 16 0v3M4 15h3v6H5a1 1 0 0 1-1-1v-5Zm16 0h-3v6h2a1 1 0 0 0 1-1v-5Z",
  user: "M16 8a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM4 21c1-4 4-6 8-6s7 2 8 6",
  lock: "M5 11h14v10H5V11Zm3 0V7a4 4 0 0 1 8 0v4",
  external: "M7 17 17 7M8 7h9v9",
  flag: "M5 22V4h12l-2 4 2 4H5",
  heart:
    "M12 21s-8-5.3-8-11.2A4.6 4.6 0 0 1 12 7a4.6 4.6 0 0 1 8 2.8C20 15.7 12 21 12 21Z",
  sparkle: "M12 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2 2-6Z",
  smile:
    "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01",
  share:
    "M18 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM6 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM18 22a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM8.6 13.5l6.8 4M15.4 6.5l-6.8 4",
  eye: "M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12ZM15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z",
  send: "M22 2 11 13M22 2l-7 20-4-9-9-4 20-7Z",
  cog: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z",
  grid: "M3 3h7v7H3V3Zm11 0h7v7h-7V3ZM3 14h7v7H3v-7Zm11 0h7v7h-7v-7Z",
  mail: "M3 5h18v14H3V5Zm0 0 9 7 9-7",
} as const;

export function Icon({
  name,
  ...props
}: SVGProps<SVGSVGElement> & { name: keyof typeof paths }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <path d={paths[name]} />
    </svg>
  );
}
