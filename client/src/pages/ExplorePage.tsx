import { statusLabel } from "../lib/display-labels";
import { useEffect, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useResource } from "../lib/hooks";
import { invalidate } from "../lib/api";
import type { Item, Lookup, Query } from "../lib/types";
import {
  Button,
  dateLabel,
  EmptyState,
  ErrorState,
  Input,
  ItemCard,
  Pagination,
  Select,
} from "../components/ui";

const FILTER_KEYS = [
  "category",
  "location",
  "status",
  "dateFrom",
  "dateTo",
  "sort",
] as const;
const SORT_LABELS: Record<string, string> = {
  oldest: "Bài cũ nhất",
  eventDateDesc: "Ngày xảy ra gần nhất",
  eventDateAsc: "Ngày xảy ra xa nhất",
};
const QUICK_RANGES = [
  [0, "Hôm nay"],
  [7, "7 ngày qua"],
  [30, "30 ngày qua"],
] as const;

function isoDaysAgo(days: number) {
  // Dates are interpreted in Vietnam time, like the rest of the app.
  const now = new Date(Date.now() + 7 * 3600_000 - days * 86_400_000);
  return now.toISOString().slice(0, 10);
}

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
  const type = params.get("type") || "";

  function change(updates: Record<string, string>) {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(updates)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
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
    change({ keyword: keyword.trim() });
  }
  const lookupName = (rows: Lookup[] | undefined, id: string) =>
    rows?.find((row) => String(row.id) === id)?.name || `#${id}`;

  const chips: { key: string; label: string }[] = [];
  if (params.get("keyword"))
    chips.push({ key: "keyword", label: `“${params.get("keyword")}”` });
  if (params.get("category"))
    chips.push({
      key: "category",
      label: lookupName(categories.data?.data, params.get("category")!),
    });
  if (params.get("location"))
    chips.push({
      key: "location",
      label: lookupName(locations.data?.data, params.get("location")!),
    });
  if (params.get("status"))
    chips.push({
      key: "status",
      label: statusLabel(params.get("status")!, "item"),
    });
  if (params.get("dateFrom"))
    chips.push({
      key: "dateFrom",
      label: `Từ ${dateLabel(params.get("dateFrom")!)}`,
    });
  if (params.get("dateTo"))
    chips.push({
      key: "dateTo",
      label: `Đến ${dateLabel(params.get("dateTo")!)}`,
    });
  if (params.get("sort") && SORT_LABELS[params.get("sort")!])
    chips.push({ key: "sort", label: SORT_LABELS[params.get("sort")!] });
  const activeCount = FILTER_KEYS.filter((key) => params.get(key)).length;

  return (
    <section id="explore" className="explore-page">
      <div className="explore-head">
        <div>
          <h1>Khám phá đồ vật</h1>
          <p>Tìm trong các bài mất đồ và nhặt được trong khuôn viên trường.</p>
        </div>
        <form className="search-bar" onSubmit={search} role="search">
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
      </div>

      <div className="explore-layout">
        <aside
          id="explore-filters"
          className={`filter-panel ${expanded ? "expanded" : ""}`}
          aria-label="Bộ lọc"
        >
          <div className="filter-panel-head">
            <h2>Bộ lọc</h2>
            <button
              type="button"
              className="filter-toggle button secondary"
              aria-controls="explore-filters"
              aria-expanded={expanded}
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? "Thu gọn" : `Mở bộ lọc (${activeCount})`}
            </button>
          </div>
          <Select
            label="Danh mục"
            value={params.get("category") || ""}
            onChange={(e) => change({ category: e.target.value })}
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
            onChange={(e) => change({ location: e.target.value })}
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
            onChange={(e) => change({ status: e.target.value })}
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
          <div className="field">
            <span className="filter-label" id="quick-range-label">
              Thời gian xảy ra
            </span>
            <div
              className="quick-dates"
              role="group"
              aria-labelledby="quick-range-label"
            >
              {QUICK_RANGES.map(([days, label]) => {
                const from = isoDaysAgo(days);
                const on =
                  params.get("dateFrom") === from && !params.get("dateTo");
                return (
                  <button
                    key={days}
                    type="button"
                    className="chip"
                    aria-pressed={on}
                    onClick={() =>
                      change(
                        on ? { dateFrom: "" } : { dateFrom: from, dateTo: "" },
                      )
                    }
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="date-range">
            <Input
              label="Từ ngày"
              type="date"
              value={params.get("dateFrom") || ""}
              max={params.get("dateTo") || "9999-12-31"}
              onChange={(e) => change({ dateFrom: e.target.value })}
            />
            <Input
              label="Đến ngày"
              type="date"
              value={params.get("dateTo") || ""}
              min={params.get("dateFrom") || "1000-01-01"}
              max="9999-12-31"
              onChange={(e) => change({ dateTo: e.target.value })}
            />
          </div>
          <Select
            label="Sắp xếp"
            value={params.get("sort") || "newest"}
            onChange={(e) => change({ sort: e.target.value })}
          >
            <option value="newest">Bài mới nhất</option>
            <option value="oldest">Bài cũ nhất</option>
            <option value="eventDateDesc">Ngày xảy ra gần nhất</option>
            <option value="eventDateAsc">Ngày xảy ra xa nhất</option>
          </Select>
          {Boolean(categories.error || locations.error) && (
            <div className="inline-error" role="alert">
              Chưa tải được danh mục/địa điểm.{" "}
              <button onClick={invalidate}>Thử tải lại</button>
            </div>
          )}
        </aside>

        <div className="explore-results">
          <div className="results-bar">
            <div>
              <h2>Đồ vật gần đây</h2>
              <span className="result-count" aria-live="polite">
                {items.data
                  ? `${items.data.pagination?.total ?? 0} bài đăng`
                  : "Đang tìm đồ vật…"}
              </span>
            </div>
            <div className="tabs" role="group" aria-label="Loại bài đăng">
              {[
                ["", "Tất cả"],
                ["LOST", "Đồ bị mất"],
                ["FOUND", "Đồ nhặt được"],
              ].map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  className={type === value ? "active" : ""}
                  aria-pressed={type === value}
                  onClick={() => change({ type: value })}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          {chips.length > 0 && (
            <div className="active-filters" aria-label="Bộ lọc đang áp dụng">
              {chips.map((chip) => (
                <span key={chip.key} className="filter-chip">
                  {chip.label}
                  <button
                    type="button"
                    aria-label={`Bỏ lọc ${chip.label}`}
                    onClick={() => {
                      if (chip.key === "keyword") setKeyword("");
                      change({ [chip.key]: "" });
                    }}
                  >
                    ×
                  </button>
                </span>
              ))}
              <button
                type="button"
                className="reset-filters"
                onClick={() => {
                  setKeyword("");
                  setParams({});
                }}
              >
                Xóa các bộ lọc
              </button>
            </div>
          )}
          {items.loading ? (
            <div
              className="item-grid"
              role="status"
              aria-label="Đang tải đồ vật"
            >
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
        </div>
      </div>
    </section>
  );
}
