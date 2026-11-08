import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig(({ command, mode }) => {
  const env = { ...loadEnv(mode, process.cwd(), 'VITE_'), ...process.env };
  const localBrowserFixture = mode === 'test' && process.env.FINDIT_FRONTEND_BROWSER_BUILD === '1'
    && !process.env.VERCEL && !process.env.RAILWAY_ENVIRONMENT_ID;
  if (command === 'build' && !localBrowserFixture && env.VITE_AI_VISUAL_SUGGESTIONS_PREVIEW_FIXTURE === 'true') {
    throw new Error('VITE_AI_VISUAL_SUGGESTIONS_PREVIEW_FIXTURE must be false for deployed builds');
  }
  return { plugins: [react(), tailwindcss()] };
});
