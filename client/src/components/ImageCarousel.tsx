import { useRef } from "react";
export interface PreviewImage {
  key: string;
  src: string;
}
export function ImageCarousel({
  images,
  selected,
  onSelect,
}: {
  images: PreviewImage[];
  selected?: string;
  onSelect: (key: string) => void;
}) {
  const touch = useRef<{ x: number; y: number } | null>(null);
  if (!images.length) return null;
  const index = Math.max(
    0,
    images.findIndex((image) => image.key === selected),
  );
  const move = (delta: number) =>
    onSelect(images[(index + delta + images.length) % images.length].key);
  return (
    <div
      className="preview-carousel"
      role="region"
      aria-label="Ảnh xem trước"
      aria-roledescription="băng chuyền ảnh"
      tabIndex={0}
      onKeyDown={(event) => {
        if (
          images.length > 1 &&
          ["ArrowLeft", "ArrowRight"].includes(event.key)
        ) {
          event.preventDefault();
          move(event.key === "ArrowRight" ? 1 : -1);
        }
      }}
      onTouchStart={(event) => {
        const point = event.touches[0];
        touch.current = { x: point.clientX, y: point.clientY };
      }}
      onTouchEnd={(event) => {
        const start = touch.current;
        touch.current = null;
        const point = event.changedTouches[0];
        if (start && point && images.length > 1) {
          const dx = point.clientX - start.x,
            dy = point.clientY - start.y;
          if (Math.abs(dx) >= 40 && Math.abs(dx) > Math.abs(dy))
            move(dx < 0 ? 1 : -1);
        }
      }}
    >
      <img src={images[index].src} alt={`Ảnh đồ vật ${index + 1}`} />
      {images.length > 1 && (
        <>
          <button
            type="button"
            className="carousel-arrow previous"
            aria-label="Ảnh trước"
            onClick={() => move(-1)}
          >
            ←
          </button>
          <button
            type="button"
            className="carousel-arrow next"
            aria-label="Ảnh tiếp theo"
            onClick={() => move(1)}
          >
            →
          </button>
          <span className="carousel-position" role="status" aria-live="polite">
            {index + 1} / {images.length}
          </span>
        </>
      )}
    </div>
  );
}
