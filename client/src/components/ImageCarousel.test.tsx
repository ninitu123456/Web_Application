import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ImageCarousel } from "./ImageCarousel";
describe("posting image carousel", () => {
  it.each([1, 2, 3, 5])(
    "renders a bounded accessible view for %i images",
    (count) => {
      const images = Array.from({ length: count }, (_, i) => ({
        key: String(i),
        src: "https://image.test/" + i,
      }));
      const html = renderToStaticMarkup(
        <ImageCarousel
          images={images}
          selected={String(count - 1)}
          onSelect={() => {}}
        />,
      );
      expect(html).toContain(`Ảnh đồ vật ${count}`);
      expect(html.includes("Ảnh tiếp theo")).toBe(count > 1);
      if (count > 1) expect(html).toContain(`${count} / ${count}`);
    },
  );
  it("falls back to an existing image after the selected key is removed", () => {
    const html = renderToStaticMarkup(
      <ImageCarousel
        images={[{ key: "kept", src: "https://image.test/kept" }]}
        selected="removed"
        onSelect={() => {}}
      />,
    );
    expect(html).toContain("https://image.test/kept");
    expect(html).not.toContain("Ảnh tiếp theo");
  });
});
