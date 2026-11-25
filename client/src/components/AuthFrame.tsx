import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Brand } from "./Brand";
import { ItemArt, RobotMascot, type ArtKind } from "./Illustrations";

const CARDS: [ArtKind, string, string, "LOST" | "FOUND", string][] = [
  ["airpods", "wood", "AirPods Pro", "LOST", "a1"],
  ["bag", "linen", "Balo đen", "FOUND", "a2"],
  ["keys", "stone", "Chìa khóa", "LOST", "a3"],
];

/** Split layout for sign-in, sign-up and password pages. */
export function AuthFrame({
  title,
  children,
}: {
  title: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="auth-frame">
      <section className="auth-art" aria-hidden="true">
        <Brand inverse />
        <div className="auth-stage">
          <RobotMascot className="auth-robot" />
          {CARDS.map(([kind, surface, name, type, cls]) => (
            <div className={`hero-float ${cls}`} key={name}>
              <ItemArt kind={kind} surface={surface} />
              <strong>{name}</strong>
              <small className={type === "LOST" ? "lost" : "found"}>
                {type === "LOST" ? "Bị mất" : "Nhặt được"}
              </small>
            </div>
          ))}
        </div>
        <h2>{title}</h2>
        <p>Dành riêng cho sinh viên và cán bộ có email trường.</p>
      </section>
      <section className="auth-side">
        <div className="auth-box">{children}</div>
        <Link className="auth-home" to="/">
          ← Về trang chủ
        </Link>
      </section>
    </div>
  );
}
