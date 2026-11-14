import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const root = fileURLToPath(new URL("../../", import.meta.url));
const cache = resolve(
  process.env.AI_VISUAL_MATCHING_CACHE_DIR ||
    resolve(root, ".cache/release-prep/model-cache"),
);
try {
  for (const file of [
    "config.json",
    "preprocessor_config.json",
    "onnx/vision_model_quantized.onnx",
  ]) {
    await access(
      resolve(
        cache,
        "Xenova/clip-vit-base-patch32/4c1807b705b1d015fb032789cc4d221b23025a6f",
        file,
      ),
    );
  }
} catch {
  throw new Error(
    "Preload the pinned CLIP cache and set AI_VISUAL_MATCHING_CACHE_DIR; this harness does not download models or install dependencies",
  );
}
if (process.argv.length > 3)
  throw new Error(
    "Usage: npm run test:ai-real-e2e -- [local-corpus-directory]",
  );
const corpus = process.argv[2] ? resolve(process.argv[2]) : "";
async function run(args, cwd, env) {
  const child = spawn(process.execPath, args, {
    cwd,
    env,
    stdio: "inherit",
    windowsHide: true,
  });
  const code = await new Promise((done, reject) => {
    child.once("error", reject);
    child.once("exit", done);
  });
  if (code !== 0) throw new Error(`AI real E2E command exited ${code}`);
}
const env = {
  ...process.env,
  AI_VISUAL_MATCHING_CACHE_DIR: cache,
  FINDIT_AI_E2E_CORPUS: corpus,
  VITE_API_BASE_URL: "/api",
  VITE_AI_VISUAL_SUGGESTIONS_ENABLED: "true",
  VITE_AI_VISUAL_SUGGESTIONS_PREVIEW_FIXTURE: "false",
  FINDIT_FRONTEND_BROWSER_BUILD: "1",
};
await run(
  [
    resolve(root, "client/node_modules/vite/bin/vite.js"),
    "build",
    "--mode",
    "test",
  ],
  resolve(root, "client"),
  env,
);
await run(["database/scripts/test-isolated.js", "--ai-real-e2e"], root, env);
