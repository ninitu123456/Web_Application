# Real-image evaluation of FindIt

Research only. Production source, frontend/backend behavior, thresholds, database, Cloudinary, notifications and Word reports are unchanged. No deployment. Node dependencies use the repository's existing lockfile. `data/` and `cache/` are ignored and must not be committed.

## Reproduce

Run from the `Web_Application_New` repository root in PowerShell. Requires Node >=20 and Python >=3.11. The recorded environment uses Node 24.21.0 and Python 3.11.16. Use the existing Node installation/dependencies (`npm ci` only when setting up a fresh checkout).

```powershell
python -m venv research/ai-evaluation/cache/venv
research/ai-evaluation/cache/venv/Scripts/python.exe -m pip install -r research/ai-evaluation/requirements.txt
node research/ai-evaluation/official-index.mjs
research/ai-evaluation/cache/venv/Scripts/python.exe research/ai-evaluation/official_index.py
node research/ai-evaluation/download.mjs
node research/ai-evaluation/prepare-model.mjs
node --test research/ai-evaluation/evaluation.test.mjs
node research/ai-evaluation/evaluate.mjs
research/ai-evaluation/cache/venv/Scripts/python.exe research/ai-evaluation/render_results.py
node research/ai-evaluation/verify.mjs
```

With `uv`, `uv venv research/ai-evaluation/cache/venv` and `uv pip install --python research/ai-evaluation/cache/venv/Scripts/python.exe -r research/ai-evaluation/requirements.txt` replace the first two commands. Point `UV_CACHE_DIR` to a writable local cache if needed.

Network is needed only for the small official paths index, individual Dataset Viewer rows/JPEG assets, pinned model preparation and dependency setup. No token/account is required. The subset downloader enforces a 750,000,000-byte ceiling, checks every source label/session/revision, and never downloads complete Parquet shards or the multi-GB dataset archive. Cached per-image metadata supports resuming. If the Dataset Viewer revision changes, acquisition stops rather than mixing snapshots. To reproduce the recorded numbers, retain the images whose file/pixel hashes match the manifest. Viewer JPEGs are not claimed to match original PNGs byte-for-byte.

The model preparation command may download ~89 MB of q8 weights once. Evaluation disables remote models and reads that cache: download time is excluded from latency. No `.env` is loaded. The scripts import the production encoder and pure embedding math directly, without application startup. All measured vectors are from actual CLIP inference. Analytic vectors in the unit tests only verify formulas and never enter the benchmark.

## Protocol and outputs

Seed 20261123. All 50 object IDs. Session 1 gallery; sessions 3,7,10 queries. One image per object per session, deterministic interior frame offset. 50 candidates/query, one relevant by object ID, no category filter. Precision@K = Hit@K/K. No threshold fitting or model fine-tuning.

The [results directory](results/) contains the full report, all 7,500 ranked pairs, 200 timing samples, metadata manifest, summaries, charts, selected examples, Vietnamese Chapter 4 passage and independent verification. Extra JSONs record dataset/model provenance, code/weight/image hashes and software versions. `cache/embeddings.json` preserves measured vectors locally for independent recomputation; it is excluded from Git alongside original image assets. The example montage contains only the selected research images, with source attribution in the report.

For a full second inference pass, run `node research/ai-evaluation/reproduce.mjs` after the first `evaluate.mjs`. It preserves the first pass in `cache/first-run/`, starts a new Node process, compares every vector and ranked pair (tolerance 1e-6), and writes `results/reproducibility.json`. Rerender and verify after this final measured pass so CSV/JSON/charts agree. Latencies can change across runs; retrieval metrics should agree for the same images/model/backend. The second pass is designated for reporting before running, regardless of relative speed. `visual_observations.json` contains the qualitative notes written after inspecting the actual montage; `render_results.py` adds measured scores/ranks to them.

If any acquisition/model/verification stage fails, its error must be resolved before calling the evaluation COMPLETE. Never substitute generated images, mock embeddings or fabricated metrics. If acquisition must be reduced, adjust validation/report counts explicitly; do not label a smaller run as 50 objects.
