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
  Pagination,
  Select,
} from "../components/ui";
export function ExplorePage() {
  const [params, setParams] = useSearchParams();
  const [keyword, setKeyword] = useState(params.get("keyword") || "");
  const [expanded, setExpanded] = useState(false);
  const activeFilters = ["category", "location", "status", "dateFrom", "dateTo", "sort"].filter(
    (key) => params.has(key) && !(key === "sort" && params.get(key) === "newest"),
  ).length;
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
        <span className="pill">Cộng đồng tìm và trả lại đồ thất lạc</span>
        <h1>
          Mất đồ ở trường?
          <br />
          <span>FindIt giúp bạn tìm lại.</span>
        </h1>
        <p>
          Tìm đồ đã thất lạc, đăng đồ bạn nhặt được và liên hệ với nhau an toàn.
          <br />
          Bắt đầu chỉ với một vài thông tin về món đồ.
        </p>
        <div className="hero-actions">
          <Link className="button primary" to="/dang-bai?type=LOST">
            Tôi bị mất đồ
          </Link>
          <Link className="button secondary" to="/dang-bai?type=FOUND">
            Tôi nhặt được đồ
          </Link>
          <a className="hero-explore-link" href="#explore">
            Xem các bài đăng
          </a>
        </div>
        <p className="hero-trust-note">Tìm kiếm miễn phí · Thông tin xác minh được bảo vệ</p>
      </section>
      <section id="explore" className="explore">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Bài đăng trong cộng đồng</span>
            <h2>Khám phá đồ thất lạc</h2>
          </div>
          <span className="result-count" role="status" aria-live="polite">
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
          <Button type="submit">Tìm kiếm</Button>
        </form>
        <div className="filter-top">
          <div className="tabs" role="group" aria-label="Loại bài đăng">
            {[
              ["", "Tất cả"],
              ["LOST", "Đồ bị mất"],
              ["FOUND", "Đồ nhặt được"],
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                className={(params.get("type") || "") === value ? "active" : ""}
                aria-pressed={(params.get("type") || "") === value}
                onClick={() => change("type", value)}
              >
                {label}
              </button>
            ))}
          </div>
          <button
            className="filter-toggle"
            type="button"
            aria-controls="explore-filters"
            aria-expanded={expanded}
            onClick={() => setExpanded(!expanded)}
          >
            Bộ lọc {activeFilters > 0 ? `(${activeFilters})` : ""} {expanded ? "−" : "＋"}
          </button>
        </div>
        <div id="explore-filters" className={`filters ${expanded ? "expanded" : ""}`}>
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
            type="button"
            className="reset-filters"
            onClick={() => {
              setKeyword("");
              setSearchError("");
              setParams({});
            }}
          >
            Xóa bộ lọc và tìm kiếm
          </button>
        )}
        {items.loading ? (
          <div className="item-grid item-grid-loading" role="status" aria-label="Đang tải bài đăng">
            {Array.from({ length: 6 }, (_, index) => (
              <div key={index} className="item-card-skeleton" aria-hidden="true">
                <div className="skeleton-image" />
                <div className="skeleton-line" />
                <div className="skeleton-line short" />
              </div>
            ))}
            <span className="sr-only">Đang tải bài đăng…</span>
          </div>
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
              Chưa có bài đăng phù hợp. Hãy thử tìm từ khóa khác, xóa bộ lọc
              hoặc đăng thông tin để mọi người cùng giúp.
            </p>
            <Link className="button secondary" to="/dang-bai">
              Đăng bài tìm đồ
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
        <span className="eyebrow">Cách FindIt hoạt động</span>
        <h2>Ba bước để đồ vật trở về đúng chủ</h2>
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
