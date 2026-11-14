import { afterEach, expect, it, vi } from "vitest";
import type { ConfigEnv } from "vite";
import config from "../../vite.config";

const configure = config as (env: ConfigEnv) => unknown;
afterEach(() => vi.unstubAllEnvs());

it.each([
  undefined,
  "",
  "http://127.0.0.1:3001/api",
  "https://localhost/api",
  "https://127.1/api",
  "https://[::1]/api",
  "https://0.0.0.0/api",
  "https://192.168.1.2/api",
  "//api.example.test/api",
  "https://user:password@api.example.test/api",
  "https://api.example.test/api?token=secret",
  "https://api.example.test/api#fragment",
  "https://api.example.test",
])("rejects unsafe deployed API URL %s", (value) => {
  vi.stubEnv("VITE_API_BASE_URL", value);
  vi.stubEnv("VITE_AI_VISUAL_SUGGESTIONS_PREVIEW_FIXTURE", "false");
  expect(() => configure({ command: "build", mode: "production" })).toThrow(
    /VITE_API_BASE_URL/,
  );
});

it.each([
  "/api",
  "https://api.example.test/api",
  "https://api.example.test/api/",
  "https://localhost-example.test/api",
  "https://127.example.test/api",
])("accepts explicit deployed API URL %s", (value) => {
  vi.stubEnv("VITE_API_BASE_URL", value);
  vi.stubEnv("VITE_AI_VISUAL_SUGGESTIONS_PREVIEW_FIXTURE", "false");
  expect(() =>
    configure({ command: "build", mode: "production" }),
  ).not.toThrow();
});

it.each([
  "VITE_AI_VISUAL_SUGGESTIONS_ENABLED",
  "VITE_AI_VISUAL_SUGGESTIONS_PREVIEW_FIXTURE",
])("rejects malformed boolean flag %s", (name) => {
  vi.stubEnv("VITE_API_BASE_URL", "/api");
  vi.stubEnv(name, "TRUE");
  expect(() => configure({ command: "build", mode: "production" })).toThrow(
    /must be true or false/,
  );
});

it("rejects synthetic fixtures in production builds even with the local browser marker", () => {
  vi.stubEnv("VITE_AI_VISUAL_SUGGESTIONS_PREVIEW_FIXTURE", "true");
  vi.stubEnv("FINDIT_FRONTEND_BROWSER_BUILD", "1");
  expect(() => configure({ command: "build", mode: "production" })).toThrow(
    /must be false/,
  );
});

it("permits only an explicit local test build and rejects provider-scoped fixture builds", () => {
  vi.stubEnv("VITE_AI_VISUAL_SUGGESTIONS_PREVIEW_FIXTURE", "true");
  vi.stubEnv("FINDIT_FRONTEND_BROWSER_BUILD", "1");
  vi.stubEnv("VERCEL", undefined);
  vi.stubEnv("RAILWAY_ENVIRONMENT_ID", undefined);
  expect(() => configure({ command: "build", mode: "test" })).not.toThrow();
  for (const provider of ["VERCEL", "RAILWAY_ENVIRONMENT_ID"]) {
    vi.stubEnv(provider, "fixture-provider");
    expect(() => configure({ command: "build", mode: "test" })).toThrow(
      /must be false/,
    );
    vi.stubEnv(provider, undefined);
  }
  vi.stubEnv("FINDIT_FRONTEND_BROWSER_BUILD", undefined);
  expect(() => configure({ command: "build", mode: "test" })).toThrow(
    /must be false/,
  );
});
