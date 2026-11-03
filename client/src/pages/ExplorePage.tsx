import { statusLabel } from "../lib/display-labels";
import { useEffect, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useResource } from "../lib/hooks";
import { invalidate } from "../lib/api";
import type { Item, Lookup, Query } from "../lib/types";
import {
  Button,
  EmptyState,
  ErrorState,
  Input,
  ItemCard,
  Loading,
  Pagination,
  Select,
} from "../components/ui";
export function ExplorePage() {
  const [params, setParams] = useSearchParams();
  const [keyword, setKeyword] = useState(params.get("keyword") || "");
  const [expanded, setExpanded] = useState(false);
  const [searchError, setSearchError] = useState("");
  useEffect(() => setKeyword(params.get("keyword") || ""), [params]);
  const query: Query = Object.fromEntries(params.entries());
  query.limit = 12;
  const items = useResource<Item[]>("/items", query);
  const categories = useResource<Lookup[]>("/categories");
  const locations = useResource<Lookup[]>("/locations");
  function change(key: string, value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete("page");
    setParams(next);
  }
  function search(event: FormEvent) {
    event.preventDefault();
    if (Array.from(keyword.trim()).length > 200) {
      setSearchError("Từ khóa tối đa 200 ký tự.");
      return;
    }
    setSearchError("");
    change("keyword", keyword.trim());
  }
  return (
    <>
      <section className="hero">
        <span className="pill">MỘT KHUÔN VIÊN · NHIỀU KẾT NỐI</span>
        <h1>
          Tìm lại đồ thất lạc.
          <br />
          <span>Trao lại niềm vui.</span>
        </h1>
        <p>
          Nơi những món đồ đi lạc tìm được đường về.
          <br />
          Tìm kiếm, chia sẻ và kết nối ngay trong trường.
        </p>
        <div className="hero-actions">
          <a className="button primary" href="#explore">
            Tìm đồ của bạn ↓
          </a>
          <Link className="text-link" to="/dang-bai?type=FOUND">
            Tôi nhặt được đồ ↗
          </Link>
        </div>
        <div className="hero-note">
          <span className="note-mark" aria-hidden="true">
            ↗
          </span>
          <span>
            Một chút quan tâm.
            <br />
            <strong>Một kết nối ý nghĩa.</strong>
          </span>
        </div>
      </section>
      <section id="explore" className="explore">
        <div className="section-heading">
          <div>
            <span className="eyebrow">TÌM KIẾM & KẾT NỐI</span>
            <h2>Có thể, đồ của bạn ở đây.</h2>
          </div>
          <span className="result-count">
            {items.data
              ? `${items.data.pagination?.total ?? 0} bài đăng`
              : "Khám phá đồ vật"}
          </span>
        </div>
        <form className="search-bar" onSubmit={search}>
          <Input
            label="Bạn đang tìm gì?"
            error={searchError}
            type="search"
            placeholder="Tai nghe, thẻ sinh viên, bình nước…"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            maxLength={400}
          />
          <Button>Tìm kiếm ↗</Button>
        </form>
        <div className="filter-top">
          <div className="tabs" aria-label="Loại bài đăng">
            {[
              ["", "Tất cả"],
              ["LOST", "Đồ bị mất"],
              ["FOUND", "Đồ nhặt được"],
            ].map(([value, label]) => (
              <button
                key={value}
                className={(params.get("type") || "") === value ? "active" : ""}
                onClick={() => change("type", value)}
              >
                {label}
              </button>
            ))}
          </div>
          <button
            className="filter-toggle"
            aria-expanded={expanded}
            onClick={() => setExpanded(!expanded)}
          >
            Bộ lọc {expanded ? "−" : "＋"}
          </button>
        </div>
        <div className={`filters ${expanded ? "expanded" : ""}`}>
          <Select
            label="Danh mục"
            value={params.get("category") || ""}
            onChange={(e) => change("category", e.target.value)}
            disabled={categories.loading || Boolean(categories.error)}
          >
            <option value="">Tất cả danh mục</option>
            {categories.data?.data.map((row) => (
              <option key={row.id} value={row.id}>
                {row.name}
              </option>
            ))}
          </Select>
          <Select
            label="Địa điểm"
            value={params.get("location") || ""}
            onChange={(e) => change("location", e.target.value)}
            disabled={locations.loading || Boolean(locations.error)}
          >
            <option value="">Mọi địa điểm</option>
            {locations.data?.data.map((row) => (
              <option key={row.id} value={row.id}>
                {row.name}
              </option>
            ))}
          </Select>
          <Select
            label="Trạng thái"
            value={params.get("status") || ""}
            onChange={(e) => change("status", e.target.value)}
          >
            <option value="">Tất cả trạng thái</option>
            {["OPEN", "CLAIM_PENDING", "CLAIMED", "RETURNED", "CLOSED"].map(
              (status) => (
                <option key={status} value={status}>
                  {statusLabel(status, "item")}
                </option>
              ),
            )}
          </Select>
          <Input
            label="Từ ngày"
            type="date"
            value={params.get("dateFrom") || ""}
            max={params.get("dateTo") || "9999-12-31"}
            onChange={(e) => change("dateFrom", e.target.value)}
          />
          <Input
            label="Đến ngày"
            type="date"
            value={params.get("dateTo") || ""}
            min={params.get("dateFrom") || "1000-01-01"}
            max="9999-12-31"
            onChange={(e) => change("dateTo", e.target.value)}
          />
          <Select
            label="Sắp xếp"
            value={params.get("sort") || "newest"}
            onChange={(e) => change("sort", e.target.value)}
          >
            <option value="newest">Bài mới nhất</option>
            <option value="oldest">Bài cũ nhất</option>
            <option value="eventDateDesc">Ngày xảy ra gần nhất</option>
            <option value="eventDateAsc">Ngày xảy ra xa nhất</option>
          </Select>
        </div>
        {Boolean(categories.error || locations.error) && (
          <div className="inline-error" role="alert">
            Chưa tải được danh mục/địa điểm.{" "}
            <button onClick={invalidate}>Thử tải lại</button>
          </div>
        )}
        {params.size > 0 && (
          <button
            className="reset-filters"
            onClick={() => {
              setKeyword("");
              setParams({});
            }}
          >
            Xóa các bộ lọc ×
          </button>
        )}
        {items.loading ? (
          <Loading />
        ) : items.error ? (
          <ErrorState error={items.error} retry={invalidate} />
        ) : items.data?.data.length ? (
          <div className="item-grid">
            {items.data.data.map((item) => (
              <ItemCard key={item.id} item={item} />
            ))}
          </div>
        ) : (
          <EmptyState title="Chưa tìm thấy đồ vật phù hợp">
            <p>
              Thử đổi từ khóa, mở rộng bộ lọc hoặc đăng bài để cộng đồng giúp
              bạn.
            </p>
            <Link className="button secondary" to="/dang-bai">
              Đăng bài tìm đồ ↗
            </Link>
          </EmptyState>
        )}
        <Pagination
          data={items.data?.pagination}
          change={(page) => {
            const next = new URLSearchParams(params);
            next.set("page", String(page));
            setParams(next);
            document
              .getElementById("explore")
              ?.scrollIntoView({ behavior: "smooth" });
          }}
        />
      </section>
      <section className="how-it-works">
        <span className="eyebrow">MỘT HÀNH TRÌNH ĐƠN GIẢN</span>
        <h2>Từ đi lạc đến trở về.</h2>
        <div className="steps">
          {[
            [
              "01",
              "Chia sẻ món đồ",
              "Đăng thông tin đồ bị mất hoặc nhặt được.",
            ],
            [
              "02",
              "Tìm một kết nối",
              "Tìm kiếm và tham khảo gợi ý tương đồng.",
            ],
            [
              "03",
              "Xác minh & trao lại",
              "Gửi bằng chứng riêng tư và xác nhận bàn giao.",
            ],
          ].map(([number, title, description]) => (
            <div key={number}>
              <span>{number}</span>
              <h3>{title}</h3>
              <p>{description}</p>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
