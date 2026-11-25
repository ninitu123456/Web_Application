// Marketing copy for the home page only. These figures are illustrative and
// are NOT read from the API; every other page must use real data.
import type { ArtKind } from "../components/Illustrations";

export const HERO_STATS = [
  { icon: "users", value: 12500, suffix: "+", label: "Người dùng" },
  { icon: "box", value: 8200, suffix: "+", label: "Đồ đã tìm thấy" },
  { icon: "smile", value: 98, suffix: "%", label: "Trả lại thành công" },
] as const;

export const HERO_CARDS: {
  kind: ArtKind;
  surface: string;
  name: string;
  type: "LOST" | "FOUND";
  className: string;
}[] = [
  {
    kind: "headphones",
    surface: "sky",
    name: "Tai nghe",
    type: "FOUND",
    className: "c1",
  },
  {
    kind: "bottle",
    surface: "stone",
    name: "Bình nước",
    type: "LOST",
    className: "c2",
  },
  {
    kind: "wallet",
    surface: "wood",
    name: "Ví da",
    type: "FOUND",
    className: "c3",
  },
];

export const AI_BANNER = {
  lost: { kind: "airpods" as ArtKind, surface: "wood", title: "AirPods Pro" },
  found: {
    kind: "airpods" as ArtKind,
    surface: "linen",
    title: "Hộp tai nghe trắng",
  },
  score: "96% trùng khớp",
};
