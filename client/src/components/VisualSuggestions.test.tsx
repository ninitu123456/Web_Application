import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { VisualSuggestions } from './VisualSuggestions';
import type { VisualSuggestion } from '../lib/types';

const resource = vi.hoisted(() => vi.fn());
vi.mock('../lib/hooks', () => ({ useResource: resource }));
vi.mock('../lib/api', () => ({ invalidate: vi.fn(), errorText: () => 'Không thể tải nội dung.' }));

const row = (itemId: number): VisualSuggestion => ({ itemId, title: `FOUND ${itemId}`, description: 'Near the library', color: null, eventDate: '2026-11-01', category: 'Electronics', location: 'Library', thumbnailUrl: `https://images.example/${itemId}.jpg`, cosineScore: 0.8678 });
function render(previewFixture = false) {
  return renderToStaticMarkup(<MemoryRouter><VisualSuggestions itemId={5} previewFixture={previewFixture} /></MemoryRouter>);
}

describe('visual suggestion panel states', () => {
  beforeEach(() => resource.mockReset());
  it('renders an accessible loading state', () => {
    resource.mockReturnValue({ loading: true });
    expect(render()).toContain('role="status"');
  });
  it('labels synthetic preview scores only when preview fixture mode is enabled', () => {
    resource.mockReturnValue({ loading: false, data: { success: true, data: [row(11)] } });
    expect(render()).not.toContain('Dữ liệu minh họa');
    expect(render(true)).toContain('Dữ liệu minh họa');
    expect(render(true)).toContain('không phải kết quả CLIP thực tế');
  });
  it('renders the empty state', () => {
    resource.mockReturnValue({ loading: false, data: { success: true, data: [] } });
    expect(render()).toContain('Chưa có gợi ý hình ảnh phù hợp');
  });
  it('renders an error and retry action', () => {
    resource.mockReturnValue({ loading: false, error: new Error('network') });
    expect(render()).toContain('role="alert"');
    expect(render()).toContain('Thử tải lại');
  });
  it('renders up to three safe FOUND cards with raw decimal score and detail links', () => {
    resource.mockReturnValue({ loading: false, data: { success: true, data: [row(11), row(12), row(13), row(14)] } });
    const html = render();
    expect(html.match(/visual-suggestion-card/g)).toHaveLength(3);
    expect(html).toContain('Điểm tương đồng hình ảnh');
    expect(html).toContain('0.868');
    expect(html).toContain('/do-vat/11');
    expect(html).not.toMatch(/%|xác suất|probability/i);
    expect(html).toContain('không phải xác nhận hai vật phẩm là một');
  });
});
