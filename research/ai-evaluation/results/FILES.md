# Kết quả nghiên cứu FindIt — chỉ mục tệp

Tất cả đường dẫn dưới đây nằm trong `Web_Application_New/research/ai-evaluation/results/`.

| Tệp yêu cầu | Nội dung |
|---|---|
| [dataset_manifest.csv](dataset_manifest.csv) | 200 ảnh, object/category/session, vai trò, provenance và checksum |
| [retrieval_results.csv](retrieval_results.csv) | Toàn bộ 7.500 cặp query/gallery và thứ hạng |
| [metrics.json](metrics.json) | Metric, cấu hình model, phần cứng, thời gian, ngưỡng và kiểm chứng |
| [metrics_summary.csv](metrics_summary.csv) | Metric tổng hợp và latency mean/p50/p95 |
| [latency_results.csv](latency_results.csv) | 200 phép đo embedding, 150 phép đo retrieval/query |
| [similarity_distribution.png](similarity_distribution.png) | Phân bố cosine positive/negative |
| [recall_at_k.png](recall_at_k.png) | Recall@1/@3/@5 |
| [retrieval_examples.png](retrieval_examples.png) | 3 đúng Top 1, 3 đúng hạng 2–3, 3 ngoài Top 3 |
| [error_analysis.md](error_analysis.md) | Phân tích lỗi định lượng và quan sát trực tiếp ảnh |
| [AI_EVALUATION_REPORT.md](AI_EVALUATION_REPORT.md) | Báo cáo đầy đủ, công thức, kết quả, giới hạn và nguồn |

Các tệp bổ sung:

- [CHAPTER_4_RESULTS_VI.md](CHAPTER_4_RESULTS_VI.md): đoạn kết quả tiếng Việt 349 từ theo cách đếm whitespace.
- [dataset_manifest.json](dataset_manifest.json): manifest có kiểu dữ liệu để tái sử dụng.
- [dataset_source.json](dataset_source.json), [official_index_source.json](official_index_source.json), [download_audit.json](download_audit.json): nguồn, revision, chỉ mục chính thức và nhật ký tải subset hoàn tất.
- [model_preparation.json](model_preparation.json): chuẩn bị model riêng, không tính vào latency inference.
- [similarity_histogram.csv](similarity_histogram.csv): từng bin/count dùng trong biểu đồ.
- [selected_examples.json](selected_examples.json): các query minh họa và Top 3 lấy từ kết quả thật.
- [verification.json](verification.json): norm, cosine tham chiếu, parity production và hash source.
- [independent_verification.json](independent_verification.json): kiểm chứng độc lập CSV/JSON/checksum/bin/chart.
- [reproducibility.json](reproducibility.json): hai lượt inference đầy đủ và so sánh toàn bộ vector/điểm/thứ hạng.
- [render_environment.json](render_environment.json): phiên bản phần mềm vẽ hình và số từ đoạn tiếng Việt.

Scripts và lệnh tái lập: [../README.md](../README.md). Ảnh nghiên cứu ở `../data/`, model/vector/index ở `../cache/`; hai thư mục này được ignore khỏi Git. Không sửa production hoặc báo cáo Word.
