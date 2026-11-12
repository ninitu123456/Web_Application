import { defineConfig, loadEnv } from "vite";
import process from "node:process";
import { isIP } from "node:net";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig(({ command, mode }) => {
  const env = { ...loadEnv(mode, process.cwd(), "VITE_"), ...process.env };
  const localBrowserFixture =
    mode === "test" &&
    process.env.FINDIT_FRONTEND_BROWSER_BUILD === "1" &&
    !process.env.VERCEL &&
    !process.env.RAILWAY_ENVIRONMENT_ID;
  for (const name of [
    "VITE_AI_VISUAL_SUGGESTIONS_ENABLED",
    "VITE_AI_VISUAL_SUGGESTIONS_PREVIEW_FIXTURE",
  ]) {
    if (env[name] !== undefined && !["true", "false"].includes(env[name])) {
      throw new Error(`${name} must be true or false`);
    }
  }
  if (
    command === "build" &&
    !localBrowserFixture &&
    env.VITE_AI_VISUAL_SUGGESTIONS_PREVIEW_FIXTURE === "true"
  ) {
    throw new Error(
      "VITE_AI_VISUAL_SUGGESTIONS_PREVIEW_FIXTURE must be false for deployed builds",
    );
  }
  if (command === "build" && !localBrowserFixture) {
    const base = env.VITE_API_BASE_URL;
    const fail = () => {
      throw new Error(
        "VITE_API_BASE_URL must be explicit /api (with a reviewed proxy) or a public HTTPS URL ending in /api",
      );
    };
    if (base !== "/api") {
      if (!base || base.trim() !== base || /[\\\s]/.test(base)) fail();
      let url: URL;
      try {
        url = new URL(base!);
      } catch {
        return fail();
      }
      const host = url.hostname.toLowerCase().replace(/\.$/, "");
      const local =
        host === "localhost" ||
        host === "0.0.0.0" ||
        (isIP(host) === 4 &&
          /^(127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/.test(
            host,
          )) ||
        /\.(localhost|local|internal)$/.test(host) ||
        /^\[(::|::1|::ffff:.*|f[cd].*|fe[89ab].*)\]$/.test(host);
      if (
        url.protocol !== "https:" ||
        local ||
        url.username ||
        url.password ||
        url.search ||
        url.hash ||
        !/\/api\/?$/.test(url.pathname)
      )
        fail();
    }
  }
  return { plugins: [react(), tailwindcss()] };
});
