import { useRef, useState, type FormEvent } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import { Icon } from "../components/Icon";
import { ItemArt, RobotMascot } from "../components/Illustrations";
import { EmptyState, ErrorState, ItemCard } from "../components/ui";
import { AI_BANNER, HERO_CARDS, HERO_STATS } from "../content/marketing";
import { invalidate } from "../lib/api";
import { useResource } from "../lib/hooks";
import type { Item } from "../lib/types";

gsap.registerPlugin(useGSAP, ScrollTrigger);

// Old bookmarks used "/" for Explore filters; keep them working.
const EXPLORE_PARAMS = [
  "keyword",
  "type",
  "category",
  "location",
  "status",
  "dateFrom",
  "dateTo",
  "sort",
  "page",
];
type Tab = "" | "LOST" | "FOUND";
const TABS: [Tab, string][] = [
  ["", "Tất cả"],
  ["LOST", "Bị mất"],
  ["FOUND", "Nhặt được"],
];
const STEPS = [
  {
    icon: "image",
    title: "Đăng tin",
    text: "Người nhặt được đăng ảnh, nơi và thời gian nhặt. Người mất đồ tìm trước, chưa thấy thì đăng tin báo mất.",
  },
  {
    icon: "sparkle",
    title: "AI ghép cặp",
    text: "Hệ thống so khớp hình ảnh và thông tin giữa tin Bị mất và Nhặt được, rồi báo cho hai bên.",
  },
  {
    icon: "shield",
    title: "Xác minh & trao trả",
    text: "Người nhận chứng minh quyền sở hữu. Hai bên nhắn tin, hẹn gặp và xác nhận khi đã trao đồ.",
  },
] as const;

export function HomePage() {
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  if (EXPLORE_PARAMS.some((key) => params.has(key)))
    return <Navigate to={`/kham-pha${location.search}`} replace />;
  return <Home />;
}

function CampusBackdrop() {
  return (
    <svg
      className="hero-campus"
      viewBox="0 0 900 520"
      preserveAspectRatio="xMidYMax slice"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="hero-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#CFE2FF" />
          <stop offset="1" stopColor="#EEF5FF" />
        </linearGradient>
        <linearGradient id="hero-bd" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#B9CBE6" />
          <stop offset="1" stopColor="#D9E5F6" />
        </linearGradient>
        <filter id="hero-blur">
          <feGaussianBlur stdDeviation="2.2" />
        </filter>
      </defs>
      <rect width="900" height="520" fill="url(#hero-sky)" />
      <g filter="url(#hero-blur)" opacity=".85">
        <rect x="430" y="170" width="300" height="250" fill="url(#hero-bd)" />
        <path d="M420 175l160-60 160 60z" fill="#AFC3E2" />
        {Array.from({ length: 24 }, (_, i) => (
          <rect
            key={i}
            x={450 + (i % 6) * 48}
            y={205 + Math.floor(i / 6) * 52}
            width="26"
            height="32"
            rx="3"
            fill="#E9F1FC"
          />
        ))}
        <rect x="740" y="230" width="160" height="190" fill="#C4D4EC" />
        {[
          [400, 380, 60],
          [350, 410, 48],
          [790, 390, 55],
          [860, 400, 50],
          [470, 430, 40],
        ].map(([x, y, r]) => (
          <circle key={`${x}${y}`} cx={x} cy={y} r={r} fill="#9FC5A8" />
        ))}
      </g>
      <path d="M0 470 Q 450 430 900 470 V520 H0z" fill="#F3F7FF" />
    </svg>
  );
}

function Home() {
  const root = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const [keyword, setKeyword] = useState("");
  const [searchError, setSearchError] = useState("");
  const [tab, setTab] = useState<Tab>("");
  const recent = useResource<Item[]>(
    "/items",
    tab ? { limit: 8, type: tab } : { limit: 8 },
  );
  const items = recent.data?.data ?? [];

  function search(event: FormEvent) {
    event.preventDefault();
    const value = keyword.trim();
    if (Array.from(value).length > 200) {
      setSearchError("Từ khóa tối đa 200 ký tự.");
      return;
    }
    setSearchError("");
    navigate(
      value ? `/kham-pha?keyword=${encodeURIComponent(value)}` : "/kham-pha",
    );
  }

  const { contextSafe } = useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        const intro = gsap.timeline({ defaults: { ease: "power4.out" } });
        intro
          .from(".home-title .line", {
            yPercent: 110,
            duration: 0.9,
            stagger: 0.12,
          })
          .from(
            ".hero-chip, .home-lead, .home-search, .hero-entry, .hero-stats",
            { y: 24, autoAlpha: 0, duration: 0.7, stagger: 0.08 },
            "-=0.6",
          )
          .from(
            ".hero-robot",
            { y: 60, autoAlpha: 0, duration: 1, ease: "back.out(1.4)" },
            "-=0.9",
          )
          .from(
            ".hero-float",
            {
              scale: 0.4,
              autoAlpha: 0,
              duration: 0.8,
              stagger: 0.12,
              ease: "back.out(1.8)",
            },
            "-=0.6",
          )
          .from(".hero-hand", { autoAlpha: 0, x: 20, duration: 0.6 }, "-=0.3");
        // Ambient motion: robot and cards float out of phase, orbit turns.
        gsap.to(".hero-robot", {
          y: -14,
          duration: 2.6,
          ease: "sine.inOut",
          yoyo: true,
          repeat: -1,
        });
        gsap.utils.toArray<HTMLElement>(".hero-float").forEach((card, i) => {
          gsap.to(card, {
            y: i % 2 ? 12 : -12,
            rotation: `+=${i % 2 ? -3 : 3}`,
            duration: 2.4 + i * 0.5,
            ease: "sine.inOut",
            yoyo: true,
            repeat: -1,
            delay: i * 0.4,
          });
        });
        gsap.to(".hero-orbit", {
          rotation: 360,
          transformOrigin: "50% 50%",
          duration: 60,
          ease: "none",
          repeat: -1,
        });
        gsap.utils.toArray<HTMLElement>(".stat-value").forEach((element) => {
          const target = Number(element.dataset.value);
          const counter = { value: 0 };
          gsap.to(counter, {
            value: target,
            duration: 1.8,
            delay: 0.6,
            ease: "power2.out",
            onUpdate: () => {
              element.textContent = Math.round(counter.value).toLocaleString(
                "vi-VN",
              );
            },
          });
        });
        gsap.utils.toArray<HTMLElement>(".reveal").forEach((element) => {
          gsap.from(element, {
            y: 40,
            autoAlpha: 0,
            duration: 0.8,
            ease: "power3.out",
            scrollTrigger: { trigger: element, start: "top 85%" },
          });
        });
        gsap.from(".how-card", {
          y: 50,
          autoAlpha: 0,
          duration: 0.8,
          stagger: 0.12,
          ease: "power3.out",
          scrollTrigger: { trigger: ".how-grid", start: "top 80%" },
        });
      });
    },
    { scope: root },
  );

  // Recent cards stagger in whenever the filter changes.
  useGSAP(
    () => {
      if (!items.length) return;
      gsap.matchMedia().add("(prefers-reduced-motion: no-preference)", () => {
        gsap.from(".recent-grid .item-card", {
          y: 30,
          autoAlpha: 0,
          duration: 0.6,
          stagger: 0.07,
          ease: "power3.out",
        });
      });
    },
    { scope: root, dependencies: [tab, items.length] },
  );

  const parallax = contextSafe((event: React.PointerEvent<HTMLElement>) => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const box = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - box.left) / box.width - 0.5;
    const y = (event.clientY - box.top) / box.height - 0.5;
    gsap.to(".hero-stage", {
      x: x * 18,
      y: y * 14,
      duration: 0.8,
      ease: "power3.out",
    });
  });

  return (
    <div className="home" ref={root}>
      <section className="v3-wrap home-hero-wrap">
        <div className="home-hero glass" onPointerMove={parallax}>
          <CampusBackdrop />
          <div className="hero-fade" />
          <div className="hero-copy">
            <span className="hero-chip">
              <Icon name="sparkle" width="14" height="14" /> Ghép cặp đồ thất
              lạc bằng AI
            </span>
            <h1 className="home-title">
              <span className="line-mask">
                <span className="line">Mất đồ?</span>
              </span>
              <span className="line-mask">
                <span className="line gradient-text">Tìm lại ngay.</span>
              </span>
            </h1>
            <p className="home-lead">
              Nền tảng tìm đồ thất lạc thông minh dành cho cộng đồng sinh viên
              trong khuôn viên trường.
            </p>
            <form className="home-search" onSubmit={search} role="search">
              <label className="sr-only" htmlFor="home-keyword">
                Bạn đang tìm gì?
              </label>
              <Icon name="search" width="20" height="20" />
              <input
                id="home-keyword"
                value={keyword}
                onChange={(event) => setKeyword(event.target.value)}
                placeholder="Tìm ví, tai nghe, thẻ sinh viên…"
                aria-invalid={Boolean(searchError)}
              />
              <button className="button primary" type="submit">
                Tìm kiếm
              </button>
            </form>
            {searchError && (
              <small className="error-text" role="alert">
                {searchError}
              </small>
            )}
            <div className="hero-entries">
              <Link className="hero-entry" to="/dang-bai/tim-truoc">
                <span className="entry-icon lost">
                  <Icon name="search" />
                </span>
                <span>
                  <strong>Tôi bị mất đồ</strong>
                  <small>Tìm trong đồ nhặt được trước</small>
                </span>
              </Link>
              <Link className="hero-entry" to="/dang-bai?type=FOUND">
                <span className="entry-icon found">
                  <Icon name="box" />
                </span>
                <span>
                  <strong>Tôi nhặt được đồ</strong>
                  <small>Đăng tin để trả lại chủ</small>
                </span>
              </Link>
            </div>
            <div className="hero-stats glass">
              {HERO_STATS.map((stat) => (
                <div key={stat.label}>
                  <Icon name={stat.icon} width="30" height="30" />
                  <div>
                    <strong>
                      <span className="stat-value" data-value={stat.value}>
                        {stat.value.toLocaleString("vi-VN")}
                      </span>
                      {stat.suffix}
                    </strong>
                    <small>{stat.label}</small>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="hero-visual" aria-hidden="true">
            <div className="hero-stage">
              <svg className="hero-orbit" viewBox="0 0 560 460">
                <ellipse
                  cx="290"
                  cy="230"
                  rx="230"
                  ry="150"
                  fill="none"
                  stroke="rgba(255,255,255,.95)"
                  strokeWidth="2.5"
                  strokeDasharray="2 10"
                  strokeLinecap="round"
                  transform="rotate(-18 290 230)"
                />
              </svg>
              <RobotMascot className="hero-robot" />
              {HERO_CARDS.map((card) => (
                <div className={`hero-float ${card.className}`} key={card.name}>
                  <ItemArt kind={card.kind} surface={card.surface} />
                  <strong>{card.name}</strong>
                  <small className={card.type === "LOST" ? "lost" : "found"}>
                    {card.type === "LOST" ? "Bị mất" : "Nhặt được"}
                  </small>
                </div>
              ))}
            </div>
            <p className="hero-hand">
              Làm mất đồ?
              <br />
              Tìm ngay tại đây!
            </p>
          </div>
        </div>
      </section>

      <section className="v3-wrap home-section how" aria-labelledby="how-title">
        <div className="section-center reveal">
          <div className="eyebrow">CÁCH HOẠT ĐỘNG</div>
          <h2 id="how-title" className="home-h2">
            Ba bước để đồ về đúng chủ
          </h2>
        </div>
        <ol className="how-grid">
          {STEPS.map((step, index) => (
            <li className="how-card v3-card" key={step.title}>
              <span className="how-icon">
                <Icon name={step.icon} width="26" height="26" />
              </span>
              <small>BƯỚC 0{index + 1}</small>
              <h3>{step.title}</h3>
              <p>{step.text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="v3-wrap home-section" aria-labelledby="recent-title">
        <div className="section-row reveal">
          <div>
            <div className="eyebrow">MỚI CẬP NHẬT</div>
            <h2 id="recent-title" className="home-h2">
              Đồ thất lạc gần đây
            </h2>
          </div>
          <div className="seg" role="group" aria-label="Lọc loại tin">
            {TABS.map(([value, label]) => (
              <button
                key={label}
                aria-pressed={tab === value}
                onClick={() => setTab(value)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        {recent.loading ? (
          <div className="item-grid recent-grid four" aria-busy="true">
            {Array.from({ length: 4 }, (_, i) => (
              <div className="skeleton-card" key={i} />
            ))}
          </div>
        ) : recent.error ? (
          <ErrorState error={recent.error} retry={invalidate} />
        ) : items.length ? (
          <div className="item-grid recent-grid four">
            {items.map((item) => (
              <ItemCard item={item} key={item.id} />
            ))}
          </div>
        ) : (
          <EmptyState title="Chưa có tin nào">
            Hãy là người đầu tiên đăng tin.{" "}
            <Link to="/dang-bai">Đăng tin ngay</Link>
          </EmptyState>
        )}
        <div className="section-center">
          <Link className="button secondary pill" to="/kham-pha">
            Xem tất cả trong Khám phá{" "}
            <Icon name="arrow" width="16" height="16" />
          </Link>
        </div>
      </section>

      <section className="v3-wrap home-section">
        <div className="ai-banner reveal">
          <div className="ai-copy">
            <span className="ai-chip">
              <Icon name="sparkle" width="14" height="14" /> AI ghép cặp
            </span>
            <h2>
              Đăng một lần,
              <br />
              AI tìm giúp bạn mỗi ngày.
            </h2>
            <p>
              Khi có tin mới giống đồ của bạn, FindIt báo ngay kèm mức độ trùng
              khớp.
            </p>
            <Link className="button light" to="/dang-bai/tim-truoc">
              Bắt đầu tìm đồ <Icon name="arrow" width="16" height="16" />
            </Link>
          </div>
          <div className="ai-pair" aria-hidden="true">
            <div className="ai-card one">
              <ItemArt
                kind={AI_BANNER.lost.kind}
                surface={AI_BANNER.lost.surface}
              />
              <strong>{AI_BANNER.lost.title}</strong>
              <span className="badge status-lost">Bị mất</span>
            </div>
            <div className="ai-card two">
              <ItemArt
                kind={AI_BANNER.found.kind}
                surface={AI_BANNER.found.surface}
              />
              <strong>{AI_BANNER.found.title}</strong>
              <span className="badge status-found">Nhặt được</span>
            </div>
            <span className="ai-score">{AI_BANNER.score}</span>
          </div>
        </div>
      </section>
    </div>
  );
}
