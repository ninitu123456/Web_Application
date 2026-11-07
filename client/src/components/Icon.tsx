import type { SVGProps } from "react";

const paths = {
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
