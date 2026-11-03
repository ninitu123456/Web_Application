import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const client = fileURLToPath(new URL("../", import.meta.url));
const root = fileURLToPath(new URL("../../", import.meta.url));
async function execute(args, cwd, env) {
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
  if (code !== 0)
    throw new Error(`Browser verification command exited ${code}`);
}
try {
  if (!process.env.npm_execpath)
    throw new Error("Run npm run test:browser from client/");
  await execute([process.env.npm_execpath, "run", "build"], client, {
    ...process.env,
    VITE_API_BASE_URL: "/api",
  });
  await execute(
    [
      "database/scripts/test-isolated.js",
      "--all",
      "--suite=items.integration.js",
    ],
    root,
    { ...process.env, FINDIT_FRONTEND_BROWSER: "1" },
  );
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
