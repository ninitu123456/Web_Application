"""All tables, charts and report numbers derive from the measured JSON/CSV."""
import csv, json, platform, sys, os
from pathlib import Path
from collections import defaultdict
os.environ.setdefault('MPLCONFIGDIR',str(Path(__file__).resolve().parent/'cache/matplotlib'))
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from PIL import Image

ROOT=Path(__file__).resolve().parent
OUT=ROOT/'results'
M=json.loads((OUT/'metrics.json').read_text(encoding='utf-8'))
D=list(csv.DictReader((OUT/'dataset_manifest.csv').open(encoding='utf-8',newline='')))
R=list(csv.DictReader((OUT/'retrieval_results.csv').open(encoding='utf-8',newline='')))
for r in R:
    for k in ('rank','correct_rank','query_object_id','gallery_object_id','query_category_id','gallery_category_id','query_session_id'): r[k]=int(r[k])
    r['similarity']=float(r['similarity']);r['correct']=r['correct']=='true'
lookup={d['image_id']:d for d in D}
groups=defaultdict(list)
for r in R: groups[r['query_id']].append(r)
for rows in groups.values(): rows.sort(key=lambda r:r['rank'])
plt.rcParams.update({'font.family':'DejaVu Sans','font.size':11,'axes.spines.top':False,'axes.spines.right':False,'figure.facecolor':'white','savefig.facecolor':'white'})
blue='#2457a7';green='#14805e';red='#bd3c42'
pos=[r['similarity'] for r in R if r['correct']]
neg=[r['similarity'] for r in R if not r['correct']]
bins=np.linspace(-1,1,61)
pc,_=np.histogram(pos,bins);nc,_=np.histogram(neg,bins)
with (OUT/'similarity_histogram.csv').open('w',encoding='utf-8',newline='') as f:
    w=csv.writer(f);w.writerow(['bin_left','bin_right','positive_count','negative_count'])
    w.writerows(zip(bins[:-1],bins[1:],pc,nc))
fig,ax=plt.subplots(figsize=(9,5.3))
ax.hist(neg,bins=bins,weights=np.ones(len(neg))/len(neg),alpha=.55,color=red,label=f'Different object (n={len(neg):,})')
ax.hist(pos,bins=bins,weights=np.ones(len(pos))/len(pos),alpha=.65,color=blue,label=f'Same object (n={len(pos):,})')
ax.axvline(.95,color='#555',linestyle='--',linewidth=1,label='0.95: demo-only reference')
ax.set(xlabel='Cosine similarity',ylabel='Fraction within each pair group',title='CORe50 image-only retrieval: similarity distributions',xlim=(max(-1,min(neg+pos)-.04),1))
ax.legend(fontsize=9);ax.grid(axis='y',alpha=.2);fig.tight_layout();fig.savefig(OUT/'similarity_distribution.png',dpi=180);plt.close(fig)
metric=M['retrieval'];ks=[1,3,5];ys=[metric[f'recallAt{k}'] for k in ks]
fig,ax=plt.subplots(figsize=(7.5,5))
bars=ax.bar([str(k) for k in ks],ys,color=[blue,'#397bc0','#64a1cc'],width=.55)
for b,v in zip(bars,ys): ax.text(b.get_x()+b.get_width()/2,v+.025,f'{v:.2%}',ha='center',fontweight='bold')
ax.set(xlabel='K',ylabel='Recall@K / Hit@K',ylim=(0,1.13),title=f'One true object among {metric["candidatesPerQuery"]} gallery candidates\n{metric["queries"]} cross-session queries | MRR = {metric["mrr"]:.4f}')
ax.grid(axis='y',alpha=.2);fig.tight_layout();fig.savefig(OUT/'recall_at_k.png',dpi=180);plt.close(fig)

# Deterministic diverse-category examples; ranks determine group, never invented.
conditions=[('Top 1 correct',lambda r:r['correct_rank']==1),('Correct in Top 3, not Top 1',lambda r:1<r['correct_rank']<=3),('Missed Top 3',lambda r:r['correct_rank']>3)]
examples=[];available={}
for label,predicate in conditions:
    candidates=[rs[0] for q,rs in sorted(groups.items()) if predicate(rs[0])]
    available[label]=len(candidates);chosen=[];seen=set()
    for r in candidates:
        if r['query_category_id'] not in seen: chosen.append(r);seen.add(r['query_category_id'])
        if len(chosen)==3: break
    if len(chosen)<3:
        chosen += [r for r in candidates if r not in chosen][:3-len(chosen)]
    for r in chosen: examples.append({'group':label,'query_id':r['query_id'],'correct_rank':r['correct_rank'],'top3':groups[r['query_id']][:3]})
(OUT/'selected_examples.json').write_text(json.dumps({'available':available,'selection':'First query ID in each new category, then fill to 3; group defined by ground-truth rank','examples':examples},indent=2),encoding='utf-8')
fig,axes=plt.subplots(len(examples),4,figsize=(12,len(examples)*3.0),squeeze=False)
for i,e in enumerate(examples):
    q=lookup[e['query_id']];qax=axes[i,0]
    qax.imshow(Image.open(ROOT/q['image_path']),interpolation='nearest')
    qax.set_title(f'{e["group"]}\nQuery o{q["object_id"]} | session {q["session_id"]}\n{q["category"]}; true rank {e["correct_rank"]}',fontsize=9,color=blue)
    for j,r in enumerate(e['top3'],1):
        g=lookup[r['gallery_id']];ax=axes[i,j]
        ax.imshow(Image.open(ROOT/g['image_path']),interpolation='nearest')
        ax.set_title(f'Top {j}: o{g["object_id"]} | session {g["session_id"]}\n{g["category"]}\ncos={r["similarity"]:.4f} | {"CORRECT" if r["correct"] else "INCORRECT"}',fontsize=9,color=green if r['correct'] else red)
    for ax in axes[i]: ax.set_xticks([]);ax.set_yticks([])
fig.suptitle('Real CORe50 queries and the three highest-ranked gallery images\nRGB 128×128, enlarged for inspection; correctness uses dataset object IDs',fontsize=13,y=1.002)
fig.tight_layout(h_pad=2.2);fig.savefig(OUT/'retrieval_examples.png',dpi=150,bbox_inches='tight');plt.close(fig)

def pct(v): return f'{v*100:.2f}%'
def ms(v): return f'{v:.3f}'
perf=M['performance'];sim=M['similarity'];hw=M['hardware'];model=M['model'];source=json.loads((OUT/'dataset_source.json').read_text());audit=json.loads((OUT/'download_audit.json').read_text());thr=M['thresholdAnalysis']
session_table='\n'.join(f'| {s} | {v["queries"]} | {pct(v["recallAt1"])} | {pct(v["recallAt3"])} | {pct(v["recallAt5"])} | {v["mrr"]:.4f} |' for s,v in M['bySession'].items())
latency_table='\n'.join(f'| {label} | {perf[key]["count"]} | {ms(perf[key]["mean"])} | {ms(perf[key]["p50"])} | {ms(perf[key]["p95"])} |' for key,label in [('inference','Extractor timer'),('embedding','Image embedding incl. local decode'),('retrieval','Cosine + sort (50 vectors)'),('queryEndToEnd','Warm query end-to-end')])
example_table='\n'.join(f'| {e["group"]} | {e["query_id"]} | {e["correct_rank"]} | '+', '.join(f'o{r["gallery_object_id"]}: {r["similarity"]:.4f} ({"đúng" if r["correct"] else "sai"})' for r in e['top3'])+' |' for e in examples)
error=f'''# Phân tích lỗi — CORe50 / FindIt

Kết quả chạy thật: {sim['wrongTop1']}/{metric['queries']} query sai Top 1; trong đó {sim['wrongTop1SameCategory']} query chọn nhầm một vật thể **cùng danh mục**. {available['Correct in Top 3, not Top 1']} query có đáp án ở hạng 2–3 và {available['Missed Top 3']} query nằm ngoài Top 3. “Thất bại” trong hình được định nghĩa là không có đáp án trong Top 3, không đồng nghĩa không có đáp án trong toàn bộ gallery.

| Nhóm | Query | Hạng đúng | Top 3 (cosine; ground truth) |
|---|---|---:|---|
{example_table}

Hình: [retrieval_examples.png](retrieval_examples.png). Các ví dụ được chọn xác định theo ID query, ưu tiên đa dạng danh mục; không chọn dựa trên việc ảnh trông đẹp hay xấu. Có tối đa 3 ví dụ mỗi nhóm, chỉ khi nhóm đó tồn tại trong kết quả.

Điểm positive trung bình {sim['positive']['mean']:.4f}, negative trung bình {sim['negative']['mean']:.4f}. Có {sim['negativeAboveMinPositive']} negative không thấp hơn positive nhỏ nhất, và {sim['positiveBelowMaxNegative']} positive không cao hơn negative lớn nhất. Đây là số đếm overlap theo miền điểm, không phải xác suất lỗi hoặc AUC.

Các query sử dụng session khác gallery, vì vậy góc chụp, bàn tay che khuất, ánh sáng và background có thể thay đổi đồng thời. Không có nhãn định lượng riêng cho các yếu tố này; benchmark không thể tách tác động nhân quả của từng yếu tố. CLIP học tương đồng ngữ nghĩa nên các vật cùng danh mục có thể gần nhau dù khác object ID. Ảnh 128×128 giới hạn chi tiết chữ, logo, vết xước và đặc điểm nhận diện nhỏ; phóng lên 224×224 không phục hồi thông tin đã mất. Đây là các cơ chế có thể giải thích lỗi, cần đối chiếu hình minh họa và không được xem là nhãn lỗi do AI tự suy ra.

LOST/FOUND là vai trò mô phỏng, không phải bài đăng thất lạc thật. Xem báo cáo chính để biết giới hạn suy rộng và chính sách ngưỡng.
'''
observations=json.loads((ROOT/'visual_observations.json').read_text(encoding='utf-8'))
error+='\n## Quan sát trực tiếp hình minh họa\n\nCác mô tả dưới đây được viết sau khi xem ảnh query và gallery thực tế, không dùng để thay đổi ground truth. Điểm/hạng lấy tự động từ kết quả.\n\n'
for image_id,note in observations.items():
    r=groups[image_id][0]
    error+=f'- **{image_id}**, hạng đúng {r["correct_rank"]}, Top 1 o{r["gallery_object_id"]} (cosine {r["similarity"]:.4f}): {note}\n'
(OUT/'error_analysis.md').write_text(error,encoding='utf-8')

report=f'''# FindIt — Real-image AI Visual Matching Evaluation

**Trạng thái: COMPLETE.** Benchmark local chạy mô hình CLIP thật của FindIt, không fine-tune, không đổi production và không truy cập database. Thời điểm đo (UTC): `{M['generatedAtUtc']}`. Thời điểm được lưu từ đồng hồ môi trường chạy; ngày/seed của thí nghiệm theo yêu cầu là 23/11/2026 và `{M['seed']}`.

## Dataset and source

Nguồn gốc: [CORe50, University of Bologna](https://vlomonaco.github.io/core50/); phân phối: [nhuy165/core50-sessions](https://huggingface.co/datasets/nhuy165/core50-sessions), revision `{source['revision']}`. Giấy phép CC BY 4.0 theo trang chính thức và dataset card; nghiên cứu giữ thông tin tác giả, liên kết và chỉ rõ biến đổi. Không tải toàn bộ 5.86 GB. API `/filter` báo chỉ mục chưa sẵn sàng; dùng `/rows` để tải từng ảnh, xác minh label và session. Danh sách `paths.pkl` chính thức chỉ được đọc opcode chuỗi bằng `pickletools`, dùng số lượng frame để tính địa chỉ nhóm; không thực thi pickle.

Tập cuối có **{M['dataset']['objects']} vật thể, {M['dataset']['images']} ảnh RGB thật 128×128, {M['dataset']['gallery']} gallery và {M['dataset']['queries']} query**, thuộc 10 danh mục. Một ảnh session 1/vật thể làm gallery (FOUND); ba ảnh session 3, 7, 10/vật thể làm query (LOST). Mỗi query so với toàn bộ **50 ứng viên**, không lọc category. LOST/FOUND chỉ là vai trò mô phỏng; đây không phải dữ liệu bài đăng mất đồ thật, cũng không phải protocol continual-learning chuẩn của CORe50.

Lấy mẫu deterministic: seed `{M['seed']}`; frame ordinal nội nhóm `40 + uint32(SHA256(seed:object:session)[0:8]) % 200`. Dùng số frame từng nhóm từ chỉ mục chính thức, cộng dồn theo session/object tăng dần, và kiểm tra nhãn nguồn trả về cho từng dòng. Source row index, revision, URL không chứa chữ ký hết hạn, object/category/session, vai trò, SHA-256 file và pixel có trong manifest. Ảnh khác session ngăn việc lấy hai frame video liên tiếp cho cùng vật thể.

**Ảnh được phục vụ ở dạng JPEG của Hugging Face Dataset Viewer**, không phải PNG gốc byte-for-byte. Đây vẫn là ảnh thật có nhãn nguồn; việc mã hóa lại có thể làm thay đổi chi tiết. Không tuyên bố checksum JPEG trùng PNG gốc hoặc đã kiểm chứng pixel với archive gốc. Nguồn mirror cung cấp label 0–49 tương ứng o1–o50 và session 1–11; độ chính xác provenance ngoài nhãn công bố phụ thuộc nguồn phân phối. Lượt tải subset hoàn tất nhận {audit['downloadedBytesThisRun']:,} byte (gồm phản hồi metadata); chỉ mục chính thức khoảng 5.28 MB và model q8 {model['weightsBytes']/1e6:.2f} MB được tải riêng vào cache. Tổng vẫn thấp hơn 750 MB; model/cache/ảnh gốc không đưa vào Git.

## Model configuration and production equivalence

- Model: `{model['id']}`, CLIP ViT-B/32; revision `{model['revision']}`; dtype `{model['dtype']}`; 512 chiều.
- Model ONNX: `vision_model_quantized.onnx`, SHA-256 `{model['weightsSha256']}`.
- Transformers.js {M['software']['transformers']}; ONNX Runtime Node {M['software']['onnxruntime']}; sharp {M['software']['sharp']}; Node {M['software']['node']}.
- CPU, ONNX intra/inter-op threads = 1/1, đúng cấu hình encoder production.
- Gọi trực tiếp `createClipEncoder()` từ `server/ai-visual/clip-encoder.js`: sharp đọc/kiểm tra/rotate/đổi sRGB/bỏ alpha, resize trong 1024 không upscale; RawImage đi vào extractor production. Preprocessor model resize cạnh ngắn 224, center crop 224×224, rescale 1/255, normalize với mean {model['preprocessor']['image_mean']} và std {model['preprocessor']['image_std']}; resample code {model['preprocessor']['resample']} theo cấu hình pin.
- L2 normalize, ghi/đọc float32 bằng `encodeEmbedding`/`decodeEmbedding` production; cosine dùng `cosineSimilarity` production. Với một ảnh/vật thể, cosine này tương đương phép max-over-images của snapshot production. Sort giảm dần, tie-break object ID tăng dần, tương ứng candidate item ID trong thí nghiệm.
- Đối chiếu đủ {M['verification']['rankingParityQueries']} query bằng `rankOppositeObjects` production; sai khác điểm tối đa {M['verification']['maxProductionRankingDifference']:.3g}, thứ tự khớp. So với cosine tham chiếu có chia norm, sai khác tối đa {M['verification']['maxCosineReferenceError']:.3g}. Embedding norm [{M['verification']['embeddingNorm']['min']:.9f}, {M['verification']['embeddingNorm']['max']:.9f}].

Hash các file production được lưu trong `verification.json`. Benchmark chỉ import các module thuần về model/math/config; không load dotenv, server startup, migrations, MySQL, Cloudinary, email hoặc notifications. Nhãn object/category/session không được truyền vào extractor. Chúng chỉ dùng định danh gallery, xác minh dữ liệu và tính ground truth.

## Evaluation methodology

Mỗi query có đúng một gallery relevant theo object ID. Gọi r(q) là hạng đúng và Q=150:

- Recall@K = Hit@K = (1/Q) Σ 1[r(q) ≤ K].
- MRR = (1/Q) Σ 1/r(q).
- Precision@K = (1/Q) Σ (1[r(q) ≤ K]/K). Vì chỉ một relevant, Precision@3 tối đa 1/3.
- Positive: cùng object ID; negative: khác object ID. Có {len(pos):,} positive và {len(neg):,} negative trên {len(R):,} cặp query/gallery. Các cặp dùng chung vật thể nên không độc lập thống kê.
- Không huấn luyện hoặc chọn threshold trên tập đánh giá. Không dùng category để giảm gallery. Một lần đo đầy đủ 200 ảnh sau 3 warmup; kiểm tra lặp lại inference và xác minh công thức bằng test.

## Quantitative results

| Metric | Kết quả |
|---|---:|
| Recall@1 / Hit@1 | {pct(metric['recallAt1'])} |
| Recall@3 / Hit@3 | {pct(metric['recallAt3'])} |
| Recall@5 / Hit@5 | {pct(metric['recallAt5'])} |
| MRR | {metric['mrr']:.6f} |
| Precision@1 | {pct(metric['precisionAt1'])} |
| Precision@3 | {pct(metric['precisionAt3'])} |
| Precision@5 | {pct(metric['precisionAt5'])} |

| Query session | Queries | Recall@1 | Recall@3 | Recall@5 | MRR |
|---|---:|---:|---:|---:|---:|
{session_table}

![Recall](recall_at_k.png)

| Cặp | n | Mean | p50 | p95 | Min | Max |
|---|---:|---:|---:|---:|---:|---:|
| Positive | {len(pos)} | {sim['positive']['mean']:.4f} | {sim['positive']['p50']:.4f} | {sim['positive']['p95']:.4f} | {sim['positive']['min']:.4f} | {sim['positive']['max']:.4f} |
| Negative | {len(neg)} | {sim['negative']['mean']:.4f} | {sim['negative']['p50']:.4f} | {sim['negative']['p95']:.4f} | {sim['negative']['min']:.4f} | {sim['negative']['max']:.4f} |

![Similarity](similarity_distribution.png)

Histogram dùng cùng bin [-1,1], chuẩn hóa riêng mỗi nhóm theo số cặp; `similarity_histogram.csv` lưu counts để kiểm chứng. Overlap: {sim['negativeAboveMinPositive']} negative ≥ min positive; {sim['positiveBelowMaxNegative']} positive ≤ max negative. Cosine không phải xác suất cùng vật thể.

## Existing threshold analysis

FindIt hiện **không có ngưỡng cosine xác nhận danh tính đã được kiểm định**: endpoint trả top 3. `notification-policy.js` mặc định chặn thông báo khi không có validated policy. `AI_VISUAL_NOTIFICATION_DEMO_MIN_COSINE=0.95` là ngưỡng demo dành cho fixture synthetic, không phải ngưỡng production ảnh thật. Điểm business matching khác cosine không được trộn vào thí nghiệm này.

Chỉ mô tả ngưỡng demo cố định 0.95 trên dữ liệu thật, không dùng để khuyến nghị triển khai: TP={thr['demoOnlyThreshold']['tp']}, FP={thr['demoOnlyThreshold']['fp']}, TN={thr['demoOnlyThreshold']['tn']}, FN={thr['demoOnlyThreshold']['fn']}; precision={thr['demoOnlyThreshold']['precision']}, recall={thr['demoOnlyThreshold']['recall']}, FPR={thr['demoOnlyThreshold']['falsePositiveRate']}. Với chấp nhận Top 1 khi cosine ≥0.95: {thr['demoOnlyTop1']['accepted']}/150 query được nhận, coverage={pct(thr['demoOnlyTop1']['coverage'])}, precision={thr['demoOnlyTop1']['precision']}. `null` nghĩa mẫu số bằng 0, không phải 0%.

Không tìm ngưỡng mới, không có calibration split và không tuyên bố kiểm thử threshold độc lập. Cần dữ liệu calibration riêng và evaluation mới nếu muốn lựa chọn ngưỡng.

## Performance

Máy đo: {hw['cpu']}, {hw['logicalCpus']} logical CPUs, RAM {hw['ramBytes']/2**30:.2f} GiB; {hw['osVersion']} / {hw['platform']} {hw['osRelease']} {hw['arch']}. Chỉ CPU, không GPU. Node {M['software']['node']}.

Khởi tạo model từ cache, download bị tắt: timer trong encoder {ms(perf['initializationMs'])} ms; wall bao gồm gọi tạo encoder {ms(perf['initializationWallMs'])} ms. Đây là **một phép đo startup**, không có p50/p95 startup. Tải model ban đầu lưu riêng trong `model_preparation.json` và không tính là inference. Sau 3 warmup, đo tuần tự 50 gallery +150 query, một lượt đầy đủ. p50/p95 dùng nearest-rank `sorted[ceil(p*n)-1]`.

| Giai đoạn | n | Mean ms | p50 ms | p95 ms |
|---|---:|---:|---:|---:|
{latency_table}

Timer `inference_ms` của encoder bao gồm tiền xử lý bên trong extractor, ONNX và chuẩn hóa đầu ra; **không đo riêng kernel ONNX**. `embedding_ms` thêm đọc/giải mã ảnh local và chuyển float32. Warm query end-to-end là đo thực tế từ trước embed đến sau cosine/sort với 50 gallery vectors đã cache, không phải tổng hai percentile. Không gồm DB, Cloudinary, network, HTTP/UI hoặc initialization. RSS quan sát sau mỗi ảnh lớn nhất {perf['observedPeakRssBytes']/2**20:.2f} MiB; peak process từ `resourceUsage().maxRSS` {perf['processMaxRssBytes']/2**20:.2f} MiB; không phải RAM riêng của model và sampling theo ảnh có thể bỏ lỡ đỉnh. Đây là latency local tại thời điểm đo; không suy ra tốc độ production Railway.

## Error analysis

Xem [error_analysis.md](error_analysis.md), [selected_examples.json](selected_examples.json), [retrieval_examples.png](retrieval_examples.png). Có {available['Top 1 correct']} query đúng Top 1, {available['Correct in Top 3, not Top 1']} query đúng hạng 2–3, {available['Missed Top 3']} query ngoài Top 3. {sim['wrongTop1SameCategory']}/{sim['wrongTop1']} lỗi Top 1 là nhầm vật cùng category. Chi tiết góc chụp/ánh sáng/background chỉ là phân tích định tính của hình, không gán nhãn ground truth mới hoặc khẳng định quan hệ nhân quả.

## Verification and reproducibility

`evaluation.test.mjs` kiểm tra công thức Recall/Precision/MRR, threshold >=, denominator rỗng, object/category/session, split, checksum/duplicate và phép cosine production bằng ví dụ giải tích. Các vector giải tích chỉ là unit fixtures, không được dùng trong nghiên cứu. `evaluate.mjs` giải mã toàn bộ ảnh, xác minh RGB/kích thước/checksum file và pixel; kiểm tra unique source rows và session tách biệt; norm 512 chiều; đối chiếu cosine độc lập, production rank và inference lặp lại. `verify.mjs` xác minh lại CSV/JSON/vector/bin/chart từ dữ liệu lưu.

Hướng dẫn đầy đủ và lệnh chạy ở [../README.md](../README.md). Pipeline production không sửa; source hash trước/sau có thể đối chiếu. Manifest/CSV/JSON có thể commit; `data/` và `cache/` được ignore. Không push, merge, deploy hoặc sửa báo cáo Word.

## Limitations and academic use

Đủ bằng chứng cho **một thí nghiệm truy xuất ảnh thật có nhãn, tái lập được, trong phạm vi CORe50 subset**: 50 gallery, 150 query, bốn session cố định. Không đủ để khẳng định chất lượng hệ thống mất đồ thực tế hoặc tự động xác nhận danh tính. Gallery chỉ một ảnh/vật, không có query “không có đáp án”, không có vật ngoài 50 ID, không khảo sát quy mô lớn, không test đa ảnh/item hoặc hoạt động DB/UI. Model không huấn luyện trên subset nhưng không thể xác nhận CORe50 hoàn toàn vắng mặt trong dữ liệu pretrain của CLIP. Mirror/Viewer JPEG có thể khác PNG gốc. Một gallery session, một seed và chỉ 3 query/vật làm kết quả nhạy với cách chọn ảnh; các query và cặp điểm có tương quan, không được diễn giải như 7.500 mẫu độc lập. Chưa có nhiều seed/session gallery, confidence interval theo cụm vật thể, kiểm chứng với dữ liệu bài đăng thật, hoặc đánh giá open-set. Các quan sát ảnh không chứng minh nguyên nhân lỗi. Không dùng kết quả này để chọn threshold triển khai.

## References

1. Lomonaco, V. & Maltoni, D. (2017). [CORe50: a New Dataset and Benchmark for Continual Object Recognition](https://proceedings.mlr.press/v78/lomonaco17a.html). CoRL, PMLR 78:17–26.
2. [CORe50 official dataset and license](https://vlomonaco.github.io/core50/), [official paths index](https://vlomonaco.github.io/core50/data/paths.pkl).
3. [nhuy165/core50-sessions dataset card](https://huggingface.co/datasets/nhuy165/core50-sessions), revision `{source['revision']}`; [Hugging Face Dataset Viewer row API](https://huggingface.co/docs/dataset-viewer/rows).
4. [Pinned Xenova CLIP model](https://huggingface.co/Xenova/clip-vit-base-patch32/tree/{model['revision']}); [CLIP paper](https://proceedings.mlr.press/v139/radford21a.html).
5. Repository: `server/ai-visual/{{config,clip-encoder,embeddings,notification-policy}}.js`, `server/ai-visual/snapshot-service.js`, `server/repositories/visual-suggestions.repository.js`, `server/tests/ai-real-e2e.js`, `docs/CI-AI-E2E-20261109.md`, `docs/AI-AUTO-MATCHING-PRODUCTION.md`. Existing E2E uses synthetic drawings with real CLIP and validates integration; its scores do not establish real-object accuracy.
'''
repro_path=OUT/'reproducibility.json'
if repro_path.exists():
    repro=json.loads(repro_path.read_text(encoding='utf-8'))
    report+=f'''\n## Full second-pass reproduction\n\nHai process độc lập, mỗi process suy luận lại đủ {repro['imagesPerPass']} ảnh từ cùng checksum/model. {repro['comparedPairs']} cặp cosine được đối chiếu: sai khác tối đa {repro['maxSimilarityDifference']:.3g}; vector sai khác tối đa {repro['maxEmbeddingDifference']:.3g}; thứ hạng và metric {'khớp hoàn toàn' if repro['retrievalMetricsIdentical'] else 'khác'}. Không dùng lại vector của lượt đầu cho inference lượt hai. Số latency trong báo cáo là **lượt thứ hai đã chỉ định trước**, không chọn lượt nhanh hơn; mỗi bảng percentile dùng 200 ảnh/150 query của lượt đó. Chi tiết latency cả hai lượt trong `reproducibility.json`.\n'''
(OUT/'AI_EVALUATION_REPORT.md').write_text(report,encoding='utf-8')

chapter=f'''Để đánh giá định lượng khả năng ghép nối hình ảnh của FindIt, nghiên cứu sử dụng 200 ảnh RGB thật từ bộ dữ liệu CORe50, gồm 50 vật thể thuộc 10 danh mục. Mỗi vật thể được chọn bốn ảnh từ các phiên chụp 1, 3, 7 và 10 bằng quy tắc xác định với seed {M['seed']}. Ảnh phiên 1 tạo gallery gồm 50 ứng viên; 150 ảnh còn lại đóng vai trò query. LOST và FOUND là hai vai trò mô phỏng, không phải dữ liệu bài đăng mất đồ thực tế. Nhãn đúng được xác định bằng object ID do nguồn dữ liệu cung cấp.

Thí nghiệm gọi trực tiếp pipeline CLIP ViT-B/32 của FindIt, sử dụng mô hình Xenova đã pin revision, ONNX q8 trên CPU và embedding 512 chiều được chuẩn hóa L2. Mỗi query được so sánh cosine với toàn bộ gallery, không lọc theo danh mục và không fine-tune. Kết quả đo được Recall@1 là {pct(metric['recallAt1'])}, Recall@3 là {pct(metric['recallAt3'])}, Recall@5 là {pct(metric['recallAt5'])} và MRR đạt {metric['mrr']:.4f}. Với một ảnh đúng trong gallery, Precision@3 bằng {pct(metric['precisionAt3'])}, khác định nghĩa Hit@3.

Cosine trung bình của cặp cùng vật thể đạt {sim['positive']['mean']:.4f}, trong khi cặp khác vật thể đạt {sim['negative']['mean']:.4f}. Tuy nhiên, hai phân bố vẫn có vùng chồng lấn; {sim['wrongTop1SameCategory']} trong {sim['wrongTop1']} lỗi Top 1 là nhầm giữa các vật cùng danh mục. Sau ba lượt làm nóng, độ trễ tạo embedding có p50/p95 lần lượt {perf['embedding']['p50']:.2f}/{perf['embedding']['p95']:.2f} ms; truy xuất cosine trên 50 vector có p50/p95 {perf['retrieval']['p50']:.3f}/{perf['retrieval']['p95']:.3f} ms. Đây là phép đo local, không đại diện hiệu năng Railway.

Kết quả cung cấp bằng chứng thực nghiệm cho khả năng truy xuất vật thể trên subset CORe50. Tuy vậy, ảnh 128×128 phục vụ qua JPEG của Dataset Viewer, gallery một phiên chụp và việc mọi query đều có đáp án giới hạn khả năng suy rộng. Cần đánh giá thêm dữ liệu mất đồ thực tế, trường hợp không có vật phù hợp và nhiều cách lấy mẫu trước khi đề xuất ngưỡng xác nhận. Thí nghiệm không thay đổi logic hoặc threshold production.
'''
(OUT/'CHAPTER_4_RESULTS_VI.md').write_text(chapter,encoding='utf-8')
(OUT/'render_environment.json').write_text(json.dumps({'python':sys.version,'matplotlib':matplotlib.__version__,'numpy':np.__version__,'pillow':Image.__version__,'chapterWhitespaceWordCount':len(chapter.split())},indent=2),encoding='utf-8')
print('Generated charts, examples and reports; Vietnamese passage whitespace words:',len(chapter.split()))
