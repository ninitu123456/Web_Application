// Static illustrations used when an item has no photo, and the FindIt mascot.
// Generated from the approved v3 design files; ids are made unique per render.
import { useId } from "react";

const ART = {
  airpods:
    '<defs><linearGradient id="bg__ID__" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#E9D3B6"/><stop offset="1" stop-color="#C9A57E"/></linearGradient><linearGradient id="w__ID__" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFFFFF"/><stop offset="1" stop-color="#E3E6EA"/></linearGradient></defs><ellipse cx="100" cy="128" rx="60" ry="9" fill="rgba(0,0,0,.16)"/><rect x="58" y="40" width="84" height="84" rx="30" fill="url(#w__ID__)"/><path d="M58 70h84" stroke="#CDD2D8" stroke-width="2"/><circle cx="100" cy="92" r="3" fill="#B8BEC6"/><path d="M70 50q10-8 22-6" stroke="#fff" stroke-width="5" stroke-linecap="round" opacity=".9"/>',
  bag: '<defs><linearGradient id="bg__ID__" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#E9D3B6"/><stop offset="1" stop-color="#C9A57E"/></linearGradient><linearGradient id="k__ID__" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3A3F48"/><stop offset="1" stop-color="#14171C"/></linearGradient></defs><ellipse cx="100" cy="128" rx="60" ry="9" fill="rgba(0,0,0,.16)"/><path d="M78 34q22-22 44 0" fill="none" stroke="#1C1F25" stroke-width="7"/><rect x="56" y="34" width="88" height="94" rx="26" fill="url(#k__ID__)"/><rect x="68" y="78" width="64" height="40" rx="12" fill="#262A31" stroke="#3E444F" stroke-width="2"/><path d="M74 84h52" stroke="#4A515E" stroke-width="2"/><circle cx="100" cy="58" r="3" fill="#5A6170"/>',
  wallet:
    '<defs><linearGradient id="bg__ID__" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#E9D3B6"/><stop offset="1" stop-color="#C9A57E"/></linearGradient><linearGradient id="k__ID__" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#33302D"/><stop offset="1" stop-color="#111"/></linearGradient></defs><ellipse cx="100" cy="128" rx="60" ry="9" fill="rgba(0,0,0,.16)"/><g transform="rotate(-8 100 85)"><rect x="50" y="52" width="100" height="70" rx="12" fill="url(#k__ID__)"/><rect x="50" y="52" width="100" height="30" rx="12" fill="#2A2724"/><path d="M56 82h88" stroke="#4A4540" stroke-width="2" stroke-dasharray="3 3"/><circle cx="132" cy="68" r="4" fill="#8A7B6A"/></g>',
  bottle:
    '<defs><linearGradient id="bg__ID__" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#E9D3B6"/><stop offset="1" stop-color="#C9A57E"/></linearGradient><linearGradient id="m__ID__" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#F2F4F6"/><stop offset="1" stop-color="#9AA3AD"/></linearGradient></defs><ellipse cx="100" cy="128" rx="60" ry="9" fill="rgba(0,0,0,.16)"/><rect x="84" y="18" width="32" height="18" rx="5" fill="#2A2E35"/><rect x="74" y="34" width="52" height="96" rx="20" fill="url(#m__ID__)"/><rect x="82" y="44" width="8" height="70" rx="4" fill="#fff" opacity=".75"/>',
  keys: '<defs><linearGradient id="bg__ID__" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#E9D3B6"/><stop offset="1" stop-color="#C9A57E"/></linearGradient><linearGradient id="m__ID__" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#F6E7A8"/><stop offset="1" stop-color="#C9A642"/></linearGradient></defs><ellipse cx="100" cy="128" rx="60" ry="9" fill="rgba(0,0,0,.16)"/><circle cx="80" cy="60" r="20" fill="none" stroke="#B9BFC7" stroke-width="5"/><path d="M92 74l40 36m-10-9l8-6m-1 15l8-6" stroke="url(#m__ID__)" stroke-width="10" stroke-linecap="round"/><circle cx="66" cy="98" r="14" fill="#FF9B5A"/><circle cx="61" cy="95" r="2" fill="#5A2A0A"/><circle cx="71" cy="95" r="2" fill="#5A2A0A"/><path d="M60 82l-4-8 8 4zM72 82l4-8-8 4z" fill="#FF9B5A"/>',
  note: '<defs><linearGradient id="bg__ID__" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#E9D3B6"/><stop offset="1" stop-color="#C9A57E"/></linearGradient><linearGradient id="w__ID__" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFFFFF"/><stop offset="1" stop-color="#E7EAEE"/></linearGradient></defs><ellipse cx="100" cy="128" rx="60" ry="9" fill="rgba(0,0,0,.16)"/><g transform="rotate(6 100 80)"><rect x="60" y="26" width="84" height="104" rx="6" fill="url(#w__ID__)"/><path d="M72 44h60" stroke="#C7D3E6" stroke-width="1.5"/><path d="M72 56h60" stroke="#C7D3E6" stroke-width="1.5"/><path d="M72 68h60" stroke="#C7D3E6" stroke-width="1.5"/><path d="M72 80h60" stroke="#C7D3E6" stroke-width="1.5"/><path d="M72 92h60" stroke="#C7D3E6" stroke-width="1.5"/><path d="M72 104h60" stroke="#C7D3E6" stroke-width="1.5"/><path d="M72 116h60" stroke="#C7D3E6" stroke-width="1.5"/><circle cx="60" cy="36" r="3.5" fill="none" stroke="#7E8794" stroke-width="2"/><circle cx="60" cy="48" r="3.5" fill="none" stroke="#7E8794" stroke-width="2"/><circle cx="60" cy="60" r="3.5" fill="none" stroke="#7E8794" stroke-width="2"/><circle cx="60" cy="72" r="3.5" fill="none" stroke="#7E8794" stroke-width="2"/><circle cx="60" cy="84" r="3.5" fill="none" stroke="#7E8794" stroke-width="2"/><circle cx="60" cy="96" r="3.5" fill="none" stroke="#7E8794" stroke-width="2"/><circle cx="60" cy="108" r="3.5" fill="none" stroke="#7E8794" stroke-width="2"/><circle cx="60" cy="120" r="3.5" fill="none" stroke="#7E8794" stroke-width="2"/></g>',
  headphones:
    '<defs><linearGradient id="bg__ID__" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#E9D3B6"/><stop offset="1" stop-color="#C9A57E"/></linearGradient><linearGradient id="k__ID__" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3A3F48"/><stop offset="1" stop-color="#0E1013"/></linearGradient></defs><ellipse cx="100" cy="128" rx="60" ry="9" fill="rgba(0,0,0,.16)"/><path d="M62 92V78a38 38 0 0176 0v14" fill="none" stroke="url(#k__ID__)" stroke-width="10" stroke-linecap="round"/><rect x="50" y="84" width="26" height="40" rx="12" fill="url(#k__ID__)"/><rect x="124" y="84" width="26" height="40" rx="12" fill="url(#k__ID__)"/>',
  mouse:
    '<defs><linearGradient id="bg__ID__" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#E9D3B6"/><stop offset="1" stop-color="#C9A57E"/></linearGradient><linearGradient id="b__ID__" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4A7BFF"/><stop offset="1" stop-color="#16349A"/></linearGradient></defs><ellipse cx="100" cy="128" rx="60" ry="9" fill="rgba(0,0,0,.16)"/><ellipse cx="100" cy="88" rx="30" ry="40" fill="url(#b__ID__)" transform="rotate(-20 100 88)"/><path d="M90 58l6 18" stroke="#9DB6FF" stroke-width="3" stroke-linecap="round"/>',
  card: '<defs><linearGradient id="bg__ID__" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#E9D3B6"/><stop offset="1" stop-color="#C9A57E"/></linearGradient><linearGradient id="b__ID__" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2F7BFF"/><stop offset="1" stop-color="#0B4BD8"/></linearGradient></defs><ellipse cx="100" cy="128" rx="60" ry="9" fill="rgba(0,0,0,.16)"/><g transform="rotate(-6 100 80)"><rect x="46" y="44" width="108" height="72" rx="10" fill="#fff"/><rect x="46" y="44" width="108" height="20" rx="10" fill="url(#b__ID__)"/><rect x="56" y="72" width="28" height="34" rx="4" fill="#CFE0FF"/><path d="M92 78h50M92 88h40M92 98h46" stroke="#C3CCDA" stroke-width="4" stroke-linecap="round"/></g>',
  umbrella:
    '<defs><linearGradient id="bg__ID__" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#E9D3B6"/><stop offset="1" stop-color="#C9A57E"/></linearGradient><linearGradient id="k__ID__" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4C5563"/><stop offset="1" stop-color="#1F242C"/></linearGradient></defs><ellipse cx="100" cy="128" rx="60" ry="9" fill="rgba(0,0,0,.16)"/><path d="M50 80a50 46 0 01100 0z" fill="url(#k__ID__)"/><path d="M100 80v38a8 8 0 01-16 0" fill="none" stroke="#7A5B3A" stroke-width="5" stroke-linecap="round"/>',
} as const;
export type ArtKind = keyof typeof ART;
const SURFACES: Record<string, [string, string]> = {
  wood: ["#E9D3B6", "#C9A57E"],
  linen: ["#EFE9E1", "#D8CFC2"],
  stone: ["#E5E8EC", "#C3C8CF"],
  sky: ["#DDEBFF", "#B9D2F7"],
  mint: ["#DDF5EC", "#B5E3D2"],
  peach: ["#FDE7DA", "#F4C9AF"],
};
const BY_CATEGORY: [RegExp, ArtKind, string][] = [
  [/điện|tai nghe|phone|laptop/i, "headphones", "sky"],
  [/ví|túi|balo/i, "wallet", "wood"],
  [/giấy|thẻ|card/i, "card", "peach"],
  [/khóa|key/i, "keys", "stone"],
  [/sách|vở|sổ/i, "note", "linen"],
];
export function artFor(category?: string | null): [ArtKind, string] {
  const hit = BY_CATEGORY.find(([pattern]) => pattern.test(category || ""));
  return hit ? [hit[1], hit[2]] : ["umbrella", "mint"];
}
export function ItemArt({
  kind,
  surface = "sky",
  className = "",
}: {
  kind: ArtKind;
  surface?: string;
  className?: string;
}) {
  const id = useId().replace(/:/g, "");
  const [from, to] = SURFACES[surface] ?? SURFACES.sky;
  return (
    <div
      className={`item-art ${className}`}
      style={{ background: `linear-gradient(${from}, ${to})` }}
    >
      <svg
        viewBox="0 0 200 150"
        preserveAspectRatio="xMidYMid meet"
        aria-hidden="true"
        dangerouslySetInnerHTML={{ __html: ART[kind].replaceAll("__ID__", id) }}
      />
    </div>
  );
}
const ROBOT =
  '<defs>\n<radialGradient id="rb" cx=".35" cy=".3" r=".9"><stop offset="0" stop-color="#FFFFFF"/><stop offset=".7" stop-color="#E8EEF8"/><stop offset="1" stop-color="#C5D0E2"/></radialGradient>\n<linearGradient id="rv" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1B2A4E"/><stop offset="1" stop-color="#0A1226"/></linearGradient>\n<radialGradient id="rbl" cx=".4" cy=".35" r=".8"><stop offset="0" stop-color="#7FB2FF"/><stop offset="1" stop-color="#1D5BE0"/></radialGradient>\n<filter id="gl"><feGaussianBlur stdDeviation="3"/></filter></defs>\n<ellipse cx="160" cy="326" rx="90" ry="10" fill="rgba(29,75,180,.18)"/>\n<line x1="160" y1="40" x2="160" y2="18" stroke="#9FB0CC" stroke-width="5"/><circle cx="160" cy="14" r="9" fill="url(#rbl)"/>\n<rect x="52" y="104" width="22" height="50" rx="11" fill="url(#rbl)"/><rect x="246" y="104" width="22" height="50" rx="11" fill="url(#rbl)"/>\n<rect x="66" y="38" width="188" height="150" rx="66" fill="url(#rb)"/>\n<rect x="88" y="66" width="144" height="96" rx="46" fill="url(#rv)"/>\n<path d="M118 112q14-18 28 0M174 112q14-18 28 0" fill="none" stroke="#5CE1FF" stroke-width="9" stroke-linecap="round" filter="url(#gl)"/>\n<path d="M118 112q14-18 28 0M174 112q14-18 28 0" fill="none" stroke="#9BF0FF" stroke-width="6" stroke-linecap="round"/>\n<path d="M140 136q20 14 40 0" fill="none" stroke="#5CE1FF" stroke-width="5" stroke-linecap="round"/>\n<path d="M102 74q20-10 44-8" stroke="#fff" stroke-width="5" stroke-linecap="round" opacity=".22"/>\n<path d="M108 196h104l10 70a24 24 0 01-24 26h-76a24 24 0 01-24-26z" fill="url(#rb)"/>\n<circle cx="160" cy="236" r="16" fill="url(#rbl)"/><path d="M160 246l-6-8a5 5 0 1112 0z" fill="#fff" opacity=".9"/>\n<rect x="228" y="200" width="34" height="80" rx="17" fill="url(#rb)" transform="rotate(-20 245 240)"/>\n<path d="M76 214q-36 10-38 52" fill="none" stroke="#D5DEEC" stroke-width="30" stroke-linecap="round"/>\n<circle cx="40" cy="300" r="7" fill="#7A5B3A"/><path d="M42 272l-4 34" stroke="#2C3E66" stroke-width="10" stroke-linecap="round"/>\n<circle cx="40" cy="250" r="30" fill="rgba(170,215,255,.35)" stroke="#1D5BE0" stroke-width="9"/><path d="M26 238q8-10 20-8" stroke="#fff" stroke-width="5" stroke-linecap="round" opacity=".8"/>\n';
export function RobotMascot({ className = "" }: { className?: string }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg
      className={`robot ${className}`}
      viewBox="0 0 320 340"
      aria-hidden="true"
      dangerouslySetInnerHTML={{
        __html: ROBOT.replace(/id="(\w+)"/g, `id="$1${id}"`).replace(
          /url\(#(\w+)\)/g,
          `url(#$1${id})`,
        ),
      }}
    />
  );
}
