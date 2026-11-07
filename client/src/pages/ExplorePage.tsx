import { Icon } from "../components/Icon";
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
        <div className="hero-copy">
          <h1>
            Tìm lại đồ thất lạc<span className="brand-dot">.</span>
          </h1>
        </div>
        <div className="hero-symbol" aria-hidden="true">
          <Icon name="search" />
          <span>
            <Icon name="box" />
          </span>
        </div>
      </section>
      <section id="explore" className="explore">
        <div className="discovery-actions">
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
            <Button>Tìm kiếm</Button>
          </form>
          <div className="post-shortcuts">
            <Link to="/dang-bai?type=LOST">
              <Icon name="search" />
              Tôi bị mất đồ
            </Link>
            <Link to="/dang-bai?type=FOUND">
              <Icon name="box" />
              Tôi nhặt được đồ
            </Link>
          </div>
        </div>
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
                aria-pressed={(params.get("type") || "") === value}
                onClick={() => change("type", value)}
              >
                {label}
              </button>
            ))}
          </div>
          <button
            className="filter-toggle"
            aria-controls="explore-filters"
            aria-expanded={expanded}
            onClick={() => setExpanded(!expanded)}
          >
            Bộ lọc (
            {
              [
                "category",
                "location",
                "status",
                "dateFrom",
                "dateTo",
                "sort",
              ].filter((key) => params.get(key)).length
            }
            ) {expanded ? "−" : "＋"}
          </button>
        </div>
        <div
          id="explore-filters"
          className={`filters ${expanded ? "expanded" : ""}`}
        >
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
        <div className="section-heading results-heading">
          <h2>Đồ vật gần đây</h2>
          <span className="result-count" aria-live="polite">
            {items.data
              ? `${items.data.pagination?.total ?? 0} bài đăng`
              : "Đang tìm đồ vật…"}
          </span>
        </div>
        {items.loading ? (
          <div className="item-grid" role="status" aria-label="Đang tải đồ vật">
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="card-skeleton">
                <span />
                <div>
                  <i />
                  <i />
                  <i />
                </div>
              </div>
            ))}
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
    </>
  );
}
