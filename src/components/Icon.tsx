/** אייקונים בקו (SVG פנימי, ללא ספרייה חיצונית) */
import type { SVGProps } from "react";

const paths: Record<string, string> = {
  menu: "M4 7h16M4 12h16M4 17h16",
  close: "M6 6l12 12M18 6 6 18",
  chevronDown: "m6 9 6 6 6-6",
  arrowLeft: "M19 12H5m6-6-6 6 6 6",
  arrowRight: "M5 12h14m-6-6 6 6-6 6",
  heart:
    "M12 20s-7-4.35-7-10a4 4 0 0 1 7-2.65A4 4 0 0 1 19 10c0 5.65-7 10-7 10z",
  book: "M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5zM4 20.5A2.5 2.5 0 0 0 6.5 23H20v-5",
  hands:
    "M7 11V6.5a1.5 1.5 0 0 1 3 0V11m0-1V4.5a1.5 1.5 0 0 1 3 0V10m0 0V5.5a1.5 1.5 0 0 1 3 0V13c0 4-2.5 7-6.5 7-3 0-4.5-1.5-6-4l-2-3.5a1.5 1.5 0 0 1 2.6-1.5L7 13",
  users:
    "M16 20v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 18.5V20M10 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM20 20v-1.5a3.5 3.5 0 0 0-2.5-3.35M15.5 4.15a3.5 3.5 0 0 1 0 6.7",
  chat: "M21 12a8 8 0 0 1-11.6 7.15L4 20.5l1.35-4.9A8 8 0 1 1 21 12z",
  search: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4.35-4.35",
  bell: "M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0",
  calendar: "M7 3v3m10-3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z",
  clock: "M12 7v5l3 2m6-2a9 9 0 1 1-18 0 9 9 0 0 1 18 0z",
  pin: "M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21zm0-9a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z",
  phone:
    "M5 4h3.5l1.5 4.5-2.25 1.5a11 11 0 0 0 6.25 6.25L15.5 14l4.5 1.5V19a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z",
  mail: "M4 6h16v12H4zM4 7l8 6 8-6",
  play: "M8 5.5v13l11-6.5z",
  headphones: "M4 15v-3a8 8 0 0 1 16 0v3M4 15h3v5H5a1 1 0 0 1-1-1zm16 0h-3v5h2a1 1 0 0 0 1-1z",
  file: "M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5M9 13h6M9 17h6",
  image: "M4 5h16v14H4zM4 16l4.5-4.5L13 16m-2-2 2.5-2.5L20 18M15.5 9.5h.01",
  share: "M8.5 13.5 15.5 17.5M15.5 6.5 8.5 10.5M18 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm12 7a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
  shield: "M12 3 4.5 6v5.5c0 4.6 3.2 8.4 7.5 9.5 4.3-1.1 7.5-4.9 7.5-9.5V6z M9 12l2 2 4-4",
  lock: "M7 11V8a5 5 0 0 1 10 0v3M6 11h12v10H6z",
  check: "m5 12.5 4.5 4.5L19 7.5",
  checkCircle: "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0zM8 12.5l2.7 2.7L16 10",
  info: "M12 16v-5m0-3h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z",
  alert: "M12 9v4m0 3.5h.01M10.3 4.2 2.6 18a2 2 0 0 0 1.7 3h15.4a2 2 0 0 0 1.7-3L13.7 4.2a2 2 0 0 0-3.4 0z",
  edit: "M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4",
  sparkle: "M12 3v4m0 10v4M3 12h4m10 0h4M6.3 6.3l2.8 2.8m5.8 5.8 2.8 2.8m0-11.4-2.8 2.8m-5.8 5.8-2.8 2.8",
  flame: "M12 22c4 0 7-2.8 7-6.8 0-3.7-2.6-6.2-4.4-8.6-.6 2.2-1.9 3.5-3.1 3.9.2-3-1.2-6-3.5-8.5C8.3 6 5 9.6 5 15.2 5 19.2 8 22 12 22z",
  gift: "M4 11h16v10H4zM3 7h18v4H3zM12 7v14M12 7S10.5 3 8 3a2 2 0 0 0 0 4m4 0s1.5-4 4-4a2 2 0 0 1 0 4",
  wheat: "M12 21V8m0 4c-3 0-5-1.6-6-4.5 3 0 5 1.5 6 4.5zm0 3c3 0 5-1.6 5-4.5-3 0-5 1.5-5 4.5zM12 9c2.4-1.1 3.5-3 3.2-5.5-2.4.8-3.5 2.6-3.2 5.5zM7 21h10",
  a11y: "M12 6a1.75 1.75 0 1 0 0-3.5A1.75 1.75 0 0 0 12 6zM5 8.5l7 1.5 7-1.5M12 10v4.5m0 0-3 6m3-6 3 6",
  whatsapp:
    "M3.5 20.5l1.3-4.6A8.5 8.5 0 1 1 8 19.3zM9 8.5c0 3.3 3.2 6.5 6.5 6.5l1.3-1.6-2-1.1-.9.9c-1.2-.4-2.3-1.5-2.7-2.7l.9-.9-1.1-2L9.4 8.5z",
  external: "M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5",
  grid: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z",
  monitor: "M4 5h16v12H4zM8 21h8M12 17v4",
  smartphone: "M8 3h8v18H8zM11 18h2",
  inbox: "M3 13h5l1.5 3h5L16 13h5M5 5h14l2 8v6H3v-6z",
  logout: "M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10",
  code: "m8 8-4 4 4 4m8-8 4 4-4 4M14 5l-4 14",
  list: "M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01",
  download: "M12 4v11m-5-5 5 5 5-5M5 20h14",
  trash: "M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13",
  plus: "M12 5v14M5 12h14",
  arrowUp: "M12 19V5m-6 6 6-6 6 6",
  arrowDown: "M12 5v14m-6-6 6 6 6-6",
  eye: "M2.5 12S6 5 12 5s9.5 7 9.5 7-3.5 7-9.5 7-9.5-7-9.5-7zm9.5 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
  refresh: "M20 11a8 8 0 0 0-14.6-4.5L4 8m0-4v4h4M4 13a8 8 0 0 0 14.6 4.5L20 16m0 4v-4h-4",
  globe:"M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM3.5 9h17M3.5 15h17M12 3c2.5 2.5 3.5 5.5 3.5 9s-1 6.5-3.5 9c-2.5-2.5-3.5-5.5-3.5-9s1-6.5 3.5-9z",
};

export type IconName = keyof typeof paths;

type Props = SVGProps<SVGSVGElement> & { name: IconName; title?: string };

export function Icon({ name, title, ...rest }: Props) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}
      focusable="false"
      {...rest}
    >
      {title ? <title>{title}</title> : null}
      <path d={paths[name]} />
    </svg>
  );
}
