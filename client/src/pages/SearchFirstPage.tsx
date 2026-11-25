import { useEffect, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Icon } from "../components/Icon";
import { EmptyState, ErrorState, ItemCard } from "../components/ui";
import { invalidate } from "../lib/api";
import { useResource } from "../lib/hooks";
import type { Item, Lookup } from "../lib/types";

/** Step 0 for people who lost something: look through FOUND posts first. */
export function SearchFirstPage() {
  const [params, setParams] = useSearchParams();
  const keyword = params.get("keyword") ?? "";
  const location = params.get("location") ?? "";
  const [draft, setDraft] = useState(keyword);
  useEffect(() => setDraft(keyword), [keyword]);
  const locations = useResource<Lookup[]>("/locations");
  const results = useResource<Item[]>("/items", {
    type: "FOUND",
    limit: 12,
    keyword: keyword || undefined,
    location: location || undefined,
  });
  const items = results.data?.data ?? [];
  const total = results.data?.pagination?.total ?? items.length;
  function update(next: Record<string, string>) {
    const merged = new URLSearchParams(params);
    for (const [key, value] of Object.entries(next)) {
      if (value) merged.set(key, value);
      else merged.delete(key);
    }
    setParams(merged, { replace: true });
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    update({ keyword: draft.trim() });
  }
  const postLost = `/dang-bai?type=LOST${keyword ? `&title=${encodeURIComponent(keyword)}` : ""}`;
  return (
    <section className="page-section search-first">
      <div className="sf-hero glass">
        <span className="sf-icon">
          <Icon name="search" width="30" height="30" />
        </span>
        <div>
          <small>BƯỚC 0 · TÌM TRƯỚC KHI ĐĂNG</small>
          <h1>Có thể ai đó đã nhặt được đồ của bạn</h1>
          <p>
            Mô tả món đồ, FindIt tìm trong các tin{" "}
            <strong className="found-text">Nhặt được</strong> trước. Không thấy
            thì đăng tin báo mất chỉ với một bước.
          </p>
        </div>
      </div>
      <form className="sf-bar" onSubmit={submit} role="search">
        <label className="sf-search">
          <span className="sr-only">Món đồ bạn bị mất</span>
          <Icon name="search" />
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="VD: ví da nâu, tai nghe trắng…"
          />
          <button className="button primary" type="submit">
            Tìm
          </button>
        </label>
        <label className="sf-select">
          <Icon name="pin" />
          <span className="sr-only">Địa điểm</span>
          <select
            value={location}
            onChange={(event) => update({ location: event.target.value })}
          >
            <option value="">Mọi địa điểm</option>
            {(locations.data?.data ?? []).map((place) => (
              <option key={place.id} value={place.id}>
                {place.name}
              </option>
            ))}
          </select>
        </label>
      </form>
      <div className="section-row">
        <h2 className="sf-count">
          {results.loading
            ? "Đang tìm…"
            : `${total} tin Nhặt được${keyword ? " có thể khớp" : " gần đây"}`}
        </h2>
      </div>
      {results.error ? (
        <ErrorState error={results.error} retry={invalidate} />
      ) : results.loading ? (
        <div className="item-grid four">
          {Array.from({ length: 4 }, (_, i) => (
            <div className="skeleton-card" key={i} />
          ))}
        </div>
      ) : items.length ? (
        <div className="item-grid four">
          {items.map((item) => (
            <ItemCard key={item.id} item={item} />
          ))}
        </div>
      ) : (
        <EmptyState title="Chưa có ai báo nhặt được món đồ này">
          Đăng tin báo mất để FindIt tiếp tục tìm giúp bạn.
        </EmptyState>
      )}
      <div className="sf-footer glass">
        <div>
          <strong>Không thấy món đồ của bạn?</strong>
          <p>
            Đăng tin báo mất, hệ thống sẽ tiếp tục so khớp và báo khi có người
            nhặt được.
          </p>
        </div>
        <Link className="button primary" to={postLost}>
          <Icon name="plus" /> Đăng tin báo mất
        </Link>
      </div>
    </section>
  );
}
