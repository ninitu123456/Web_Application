import {
  useRef,
  useState,
  type FormEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import { Icon } from "../components/Icon";
import { Button, EmptyState, ErrorState, ItemCard } from "../components/ui";
import { invalidate } from "../lib/api";
import { useResource } from "../lib/hooks";
import type { Item, Lookup } from "../lib/types";

gsap.registerPlugin(useGSAP, ScrollTrigger);

const ROTATING_WORDS = [
  "chiếc ví",
  "tai nghe",
  "chìa khóa",
  "thẻ sinh viên",
  "bình nước",
];
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

export function HomePage() {
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  if (EXPLORE_PARAMS.some((key) => params.has(key)))
    return <Navigate to={`/kham-pha${location.search}`} replace />;
  return <Home />;
}

function Home() {
  const root = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const [keyword, setKeyword] = useState("");
  const [searchError, setSearchError] = useState("");
  const [tab, setTab] = useState<Tab>("");
  const latest = useResource<Item[]>("/items", { limit: 8 });
  const recent = useResource<Item[]>(
    "/items",
    tab ? { limit: 4, type: tab } : { limit: 4 },
  );
  const categories = useResource<Lookup[]>("/categories");
  const ticker = latest.data?.data ?? [];

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

  // Intro, ambient and scroll animations. Everything lives in one context
  // scoped to this page, so unmounting reverts tweens and ScrollTriggers.
  const { contextSafe } = useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        const intro = gsap.timeline({ defaults: { ease: "power4.out" } });
        intro
          .from(".home-title .line", {
            yPercent: 115,
            duration: 1.1,
            stagger: 0.12,
          })
          .from(
            ".home-kicker, .home-lead, .home-search, .home-quick",
            { y: 26, autoAlpha: 0, duration: 0.8, stagger: 0.1 },
            "-=0.7",
          )
          .from(
            ".hero-tag, .hero-safe",
            {
              y: 80,
              autoAlpha: 0,
              duration: 1,
              stagger: 0.14,
              ease: "back.out(1.5)",
            },
            "-=0.9",
          )
          .from(
            ".match-line path",
            {
              attr: { "stroke-dashoffset": 400 },
              duration: 1.1,
              ease: "power2.inOut",
            },
            "-=0.4",
          )
          .from(
            ".match-pill",
            { scale: 0.3, autoAlpha: 0, duration: 0.7, ease: "back.out(2.2)" },
            "-=0.35",
          );
        gsap.utils.toArray<HTMLElement>(".hero-tag").forEach((tag, index) => {
          gsap.to(tag, {
            y: "+=14",
            duration: 2.6 + index * 0.5,
            ease: "sine.inOut",
            yoyo: true,
            repeat: -1,
            delay: 1.8 + index * 0.3,
          });
        });
        const words = gsap.utils.toArray<HTMLElement>(".rotator span");
        if (words.length > 1) {
          gsap.set(words, { yPercent: 110, autoAlpha: 1 });
          gsap.set(words[0], { yPercent: 0 });
          const rotate = gsap.timeline({ repeat: -1, delay: 2.2 });
          words.forEach((word, index) => {
            const next = words[(index + 1) % words.length];
            rotate
              .to(
                word,
                { yPercent: -110, duration: 0.6, ease: "power3.in" },
                "+=1.6",
              )
              .fromTo(
                next,
                { yPercent: 110 },
                { yPercent: 0, duration: 0.7, ease: "power3.out" },
                "<0.25",
              );
          });
        }
        gsap.utils.toArray<HTMLElement>(".reveal").forEach((element) => {
          gsap.from(element, {
            y: 50,
            autoAlpha: 0,
            duration: 0.9,
            ease: "power3.out",
            scrollTrigger: { trigger: element, start: "top 88%", once: true },
          });
        });
        gsap.fromTo(
          ".steps-bar",
          { scaleX: 0 },
          {
            scaleX: 1,
            ease: "none",
            scrollTrigger: {
              trigger: ".home-how",
              start: "top 70%",
              end: "bottom 60%",
              scrub: 0.6,
            },
          },
        );
        gsap.from(".home-steps li", {
          y: 40,
          autoAlpha: 0,
          duration: 0.8,
          stagger: 0.12,
          ease: "power3.out",
          scrollTrigger: { trigger: ".home-how", start: "top 60%", once: true },
        });
        gsap.from(".home-cta", {
          scale: 0.92,
          ease: "power3.out",
          scrollTrigger: {
            trigger: ".home-cta",
            start: "top 90%",
            end: "top 50%",
            scrub: 0.8,
          },
        });
      });
      document.fonts?.ready.then(() => ScrollTrigger.refresh());
    },
    { scope: root },
  );

  // Infinite ticker once its content exists.
  useGSAP(
    () => {
      if (!ticker.length) return;
      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        gsap.to(".marquee-track", {
          xPercent: -50,
          duration: Math.max(24, ticker.length * 5),
          ease: "none",
          repeat: -1,
        });
      });
    },
    { scope: root, dependencies: [ticker.length], revertOnUpdate: true },
  );

  // Cards enter in a stagger whenever the selected tab's list arrives.
  useGSAP(
    () => {
      if (!recent.data?.data.length) return;
      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        gsap.from(".home-recent .item-card", {
          y: 40,
          autoAlpha: 0,
          duration: 0.7,
          stagger: 0.08,
          ease: "power3.out",
          clearProps: "transform,opacity,visibility",
        });
      });
    },
    { scope: root, dependencies: [recent.data], revertOnUpdate: true },
  );

  // Magnetic call-to-action that follows the pointer a little.
  const magnet = useRef<HTMLAnchorElement>(null);
  const moveMagnet = contextSafe((event: ReactPointerEvent) => {
    const element = magnet.current;
    if (!element || matchMedia("(prefers-reduced-motion: reduce)").matches)
      return;
    const box = element.getBoundingClientRect();
    gsap.to(element, {
      x: (event.clientX - box.left - box.width / 2) * 0.35,
      y: (event.clientY - box.top - box.height / 2) * 0.35,
      duration: 0.5,
      ease: "power3.out",
      overwrite: "auto",
    });
  });
  const resetMagnet = contextSafe(() => {
    gsap.to(magnet.current, {
      x: 0,
      y: 0,
      duration: 0.6,
      ease: "elastic.out(1, 0.5)",
      overwrite: "auto",
    });
  });

  return (
    <div ref={root} className="home">
      <section className="home-hero">
        <div className="home-hero-copy">
          <span className="home-kicker">
            <span>Mới</span>Gợi ý trùng khớp bằng hình ảnh
          </span>
          <h1 className="home-title">
            <span className="mask">
              <span className="line">Lạc mất</span>
            </span>
            <span className="mask">
              <span className="line">
                <span className="rotator">
                  {ROTATING_WORDS.map((word, index) => (
                    <span key={word} aria-hidden={index > 0 || undefined}>
                      {word}
                    </span>
                  ))}
                </span>
                ?
              </span>
            </span>
            <span className="mask">
              <span className="line muted-line">Cùng tìm lại.</span>
            </span>
          </h1>
          <p className="home-lead">
            FindIt kết nối người mất đồ và người nhặt được trong khuôn viên
            trường. Đăng bài một phút, nhận gợi ý trùng khớp, bàn giao khi đã
            xác minh đúng chủ.
          </p>
          <form className="home-search" onSubmit={search} role="search">
            <label className="home-search-field">
              <Icon name="search" width="22" height="22" />
              <span className="visually-hidden">Bạn đang tìm gì?</span>
              <input
                type="search"
                placeholder="Tìm ví, tai nghe, thẻ sinh viên…"
                value={keyword}
                maxLength={400}
                aria-invalid={Boolean(searchError)}
                aria-describedby={searchError ? "home-search-error" : undefined}
                onChange={(event) => setKeyword(event.target.value)}
              />
            </label>
            <Button>Tìm kiếm</Button>
          </form>
          {searchError && (
            <small id="home-search-error" className="error-text">
              {searchError}
            </small>
          )}
          <div className="home-quick">
            <Link className="quick-lost" to="/dang-bai?type=LOST">
              <Icon name="search" width="18" height="18" />
              Tôi bị mất đồ
            </Link>
            <Link className="quick-found" to="/dang-bai?type=FOUND">
              <Icon name="box" width="18" height="18" />
              Tôi nhặt được đồ
            </Link>
          </div>
        </div>
        <div className="home-visual" aria-hidden="true">
          <div className="home-visual-bg" />
          <svg
            className="match-line"
            viewBox="0 0 440 520"
            preserveAspectRatio="none"
          >
            <path
              d="M150 190 C 300 200, 120 330, 270 360"
              fill="none"
              stroke="#d4f36b"
              strokeWidth="3"
              strokeLinecap="round"
              strokeDasharray="400"
              strokeDashoffset="0"
            />
          </svg>
          <div className="hero-tag hero-tag-a">
            <div className="hero-tag-art">
              <Icon
                name="headphones"
                width="54"
                height="54"
                strokeWidth="1.1"
              />
            </div>
            <div className="hero-tag-body">
              <span className="badge status-lost">Đồ bị mất</span>
              <strong>Tai nghe không dây, hộp trắng</strong>
              <small>Tòa B · sáng thứ Năm</small>
            </div>
          </div>
          <div className="hero-tag hero-tag-b">
            <div className="hero-tag-art">
              <Icon
                name="headphones"
                width="54"
                height="54"
                strokeWidth="1.1"
              />
            </div>
            <div className="hero-tag-body">
              <span className="badge status-found">Đồ nhặt được</span>
              <strong>Nhặt được tai nghe ở hành lang</strong>
              <small>Tòa B · thứ Năm</small>
            </div>
          </div>
          <div className="match-pill">
            <Icon name="check" width="16" height="16" strokeWidth="2.4" />
            Có thể trùng khớp
          </div>
          <div className="hero-safe">
            <span>
              <Icon name="shield" width="16" height="16" />
            </span>
            Xác minh chủ trước khi bàn giao
          </div>
        </div>
      </section>

      {ticker.length > 0 && (
        <section className="marquee" aria-label="Bài đăng mới nhất">
          <div className="marquee-track">
            {[0, 1].map((copy) =>
              ticker.map((item) => (
                <span
                  key={`${copy}-${item.id}`}
                  aria-hidden={copy === 1 || undefined}
                >
                  <span className={`badge status-${item.type.toLowerCase()}`}>
                    {item.type === "LOST" ? "Bị mất" : "Nhặt được"}
                  </span>
                  {item.title}
                  {item.location?.name ? ` · ${item.location.name}` : ""}
                  <span className="star" aria-hidden="true">
                    ✳
                  </span>
                </span>
              )),
            )}
          </div>
        </section>
      )}

      <section
        className="home-section home-recent"
        aria-labelledby="recent-title"
      >
        <div className="home-recent-head reveal">
          <div>
            <span className="home-eyebrow">VỪA ĐĂNG</span>
            <h2 id="recent-title" className="home-h2">
              Có thể là đồ của bạn
            </h2>
          </div>
          <div>
            <div className="tabs" role="group" aria-label="Lọc loại bài">
              {(
                [
                  ["", "Tất cả"],
                  ["LOST", "Đồ bị mất"],
                  ["FOUND", "Đồ nhặt được"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  className={tab === value ? "active" : ""}
                  aria-pressed={tab === value}
                  onClick={() => setTab(value)}
                >
                  {label}
                </button>
              ))}
            </div>
            <Link
              className="button secondary"
              to={tab ? `/kham-pha?type=${tab}` : "/kham-pha"}
            >
              Xem tất cả <Icon name="arrow" width="16" height="16" />
            </Link>
          </div>
        </div>
        {recent.loading ? (
          <div className="item-grid" role="status" aria-label="Đang tải đồ vật">
            {Array.from({ length: 4 }, (_, index) => (
              <div key={index} className="card-skeleton">
                <span />
                <div>
                  <i />
                  <i />
                  <i />
                </div>
              </div>
            ))}
          </div>
        ) : recent.error ? (
          <ErrorState error={recent.error} retry={invalidate} />
        ) : recent.data?.data.length ? (
          <div className="item-grid">
            {recent.data.data.map((item) => (
              <ItemCard key={item.id} item={item} />
            ))}
          </div>
        ) : (
          <EmptyState title="Chưa có bài đăng nào">
            <p>Hãy là người đầu tiên đăng bài để cộng đồng cùng giúp.</p>
            <Link className="button secondary" to="/dang-bai">
              Đăng bài ↗
            </Link>
          </EmptyState>
        )}
      </section>

      {Boolean(categories.data?.data.length) && (
        <section className="home-cats reveal" aria-labelledby="cats-title">
          <h2 id="cats-title">Tìm theo danh mục</h2>
          {categories.data!.data.slice(0, 10).map((category) => (
            <Link
              key={category.id}
              className="chip"
              to={`/kham-pha?category=${category.id}`}
            >
              {category.name}
            </Link>
          ))}
        </section>
      )}

      <section className="home-dark home-how" aria-labelledby="how-title">
        <div className="home-dark-inner">
          <div className="home-how-head reveal">
            <h2 id="how-title">
              Từ lúc mất đến lúc nhận lại, <em>bốn bước</em>.
            </h2>
            <p>
              Mỗi bước đều có thông báo, nên bạn không phải vào kiểm tra liên
              tục.
            </p>
          </div>
          <div className="steps-track" aria-hidden="true">
            <div className="steps-bar" />
          </div>
          <ol className="home-steps">
            {[
              [
                "Đăng bài",
                "Chọn mất hay nhặt được, thêm ảnh, nơi và thời điểm. Giữ lại đặc điểm riêng để xác minh.",
              ],
              [
                "Nhận gợi ý",
                "Hệ thống so khớp danh mục, địa điểm, thời gian và nội dung giữa bài mất và bài nhặt được.",
              ],
              [
                "Gửi yêu cầu nhận lại",
                "Mô tả đặc điểm chỉ chủ mới biết. Người đăng bài xem xét rồi hai bên nhắn tin hẹn gặp.",
              ],
              [
                "Bàn giao",
                "Gặp nhau trao đồ và xác nhận trên FindIt. Bài đăng chuyển sang đã trao trả.",
              ],
            ].map(([title, text], index) => (
              <li key={title} className={index === 3 ? "final" : undefined}>
                <b aria-hidden="true">0{index + 1}</b>
                <h3>{title}</h3>
                <p>{text}</p>
              </li>
            ))}
          </ol>
          <div className="home-safety">
            <div className="reveal">
              <Icon name="shield" width="40" height="40" strokeWidth="1.6" />
              <h3>Chỉ trao khi đúng chủ</h3>
              <p>
                Người nhận phải mô tả đặc điểm riêng; người đăng bài duyệt từng
                yêu cầu trước khi đồng ý gặp.
              </p>
            </div>
            <div className="reveal">
              <Icon name="message" width="40" height="40" strokeWidth="1.6" />
              <h3>Nhắn tin ngay trong FindIt</h3>
              <p>
                Hẹn giờ, chỗ bàn giao mà không cần đưa số điện thoại cho người
                lạ.
              </p>
            </div>
            <div className="reveal">
              <Icon name="flag" width="40" height="40" strokeWidth="1.6" />
              <h3>Báo cáo bài sai phạm</h3>
              <p>
                Quản trị viên xem xét báo cáo và gỡ bài lừa đảo khỏi trang công
                khai.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="home-cta-wrap">
        <div className="home-cta">
          <div>
            <h2>Vừa nhặt được đồ của ai đó?</h2>
            <p>
              Đăng bài để chủ nhân nhận được thông báo gợi ý trùng khớp sớm
              nhất.
            </p>
          </div>
          <Link
            ref={magnet}
            className="magnet"
            to="/dang-bai?type=FOUND"
            onPointerMove={moveMagnet}
            onPointerLeave={resetMagnet}
          >
            <Icon name="plus" width="28" height="28" strokeWidth="2" />
            Đăng đồ
            <br />
            nhặt được
          </Link>
        </div>
      </section>
    </div>
  );
}
