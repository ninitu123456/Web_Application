// Opt-in full runtime (no missing-service fixtures) on the disposable base DB.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { chromium, expect } from '../../client/node_modules/@playwright/test/index.mjs';
import { assertIsolatedInstance } from '../../database/scripts/assert-isolated.js';
import { startServer } from '../server.js';
import { readConfig } from '../config/env.js';
await assertIsolatedInstance();
const root = fileURLToPath(new URL('../../', import.meta.url));
test(
  'full runtime browser: real services, CORS/Socket.IO, responsive UI and application console',
  { timeout: 120000 },
  async () => {
    assert.equal(process.env.RESEND_API_KEY, '');
    assert.equal(process.env.CLOUDINARY_API_KEY, '');
    const dist = resolve(root, 'client/dist'),
      artifacts = resolve(root, '.cache/frontend-browser/full-runtime');
    await mkdir(artifacts, { recursive: true });
    const mime = {
      '.html': 'text/html',
      '.js': 'text/javascript',
      '.css': 'text/css',
      '.svg': 'image/svg+xml',
      '.png': 'image/png',
    };
    const frontend = createServer(async (req, res) => {
      try {
        const path = new URL(req.url, 'http://localhost').pathname;
        let target = resolve(dist, '.' + path);
        if (!target.startsWith(dist + sep) && target !== dist) {
          res.writeHead(403);
          res.end();
          return;
        }
        if (!path.startsWith('/assets/')) target = resolve(dist, 'index.html');
        res.writeHead(200, { 'Content-Type': mime[extname(target)] ?? 'application/octet-stream' });
        res.end(await readFile(target));
      } catch {
        res.writeHead(404);
        res.end();
      }
    });
    await new Promise((done) => frontend.listen(0, '127.0.0.1', done));
    const origin = 'http://127.0.0.1:' + frontend.address().port;
    let runtime, browser;
    try {
      const config = readConfig({
        ...process.env,
        HOST: '127.0.0.1',
        CORS_ORIGINS: origin,
        AI_VISUAL_MATCHING_ENABLED: 'false',
        AI_VISUAL_SUGGESTIONS_ENABLED: 'false',
      });
      config.port = 0;
      runtime = await startServer(config);
      const api = 'http://127.0.0.1:' + runtime.server.address().port;
      const build = spawn(
        process.execPath,
        [resolve(root, 'client/node_modules/vite/bin/vite.js'), 'build', '--mode', 'test'],
        {
          cwd: resolve(root, 'client'),
          windowsHide: true,
          stdio: 'inherit',
          env: {
            ...process.env,
            NODE_ENV: 'production',
            VITE_API_BASE_URL: api + '/api',
            VITE_AI_VISUAL_SUGGESTIONS_ENABLED: 'false',
            VITE_AI_VISUAL_SUGGESTIONS_PREVIEW_FIXTURE: 'false',
            FINDIT_FRONTEND_BROWSER_BUILD: '1',
          },
        },
      );
      assert.equal(
        await new Promise((done, reject) => {
          build.once('error', reject);
          build.once('exit', done);
        }),
        0,
      );
      browser = await chromium.launch({
        channel: process.env.FINDIT_BROWSER_CHANNEL ?? 'chrome',
        headless: true,
      });
      const errors = [],
        unexpectedResponses = [],
        blockedFonts = [];
      const context = await browser.newContext({
        viewport: { width: 1440, height: 900 },
        reducedMotion: 'reduce',
      });
      await context.route('https://**/*', (route) => {
        const host = new URL(route.request().url()).hostname;
        if (host === 'fonts.googleapis.com' || host === 'fonts.gstatic.com') {
          blockedFonts.push(host);
          return route.abort();
        }
        throw new Error('Unexpected external request');
      });
      context.on('page', (page) => {
        page.on('pageerror', (error) => errors.push(error.message));
        page.on('console', (message) => {
          if (
            message.type() === 'error' &&
            !['fonts.googleapis.com', 'fonts.gstatic.com'].some((host) =>
              message.location().url.startsWith('https://' + host + '/'),
            )
          )
            errors.push(message.text());
        });
        page.on('response', (response) => {
          if (response.status() >= 400)
            unexpectedResponses.push({ path: new URL(response.url()).pathname, status: response.status() });
        });
      });
      const user = await context.newPage();
      await user.goto(origin);
      await expect(user.locator('h1.home-title')).toBeVisible();
      for (const width of [360, 390, 768, 1440]) {
        await user.setViewportSize({ width, height: width <= 390 ? 844 : 900 });
        assert.ok(await user.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        await expect(user.locator('.footer-bottom')).toHaveText('© ' + new Date().getFullYear() + ' FindIt');
        await user.screenshot({ path: resolve(artifacts, 'home-' + width + '.png'), fullPage: true });
      }
      async function login(page, email, password, next = '/') {
        await page.goto(origin + '/dang-nhap?next=' + encodeURIComponent(next));
        await page.getByLabel('Email', { exact: true }).fill(email);
        await page.getByLabel('Mật khẩu', { exact: true }).fill(password);
        await page.getByRole('button', { name: 'Đăng nhập →', exact: true }).click();
        await expect(page).toHaveURL(origin + next);
      }
      await login(user, process.env.SEED_USER_EMAIL, process.env.SEED_USER_PASSWORD, '/do-vat/2');
      await user.getByRole('button', { name: 'Nhắn tin', exact: true }).click();
      await expect(user).toHaveURL(/tin-nhan\?hoi-thoai=/);
      await expect(user.getByText('Đã kết nối', { exact: true })).toBeVisible();
      const conversation = new URL(user.url()).searchParams.get('hoi-thoai');
      const adminContext = await browser.newContext({
        viewport: { width: 390, height: 844 },
        reducedMotion: 'reduce',
      });
      await adminContext.route('https://**/*', (route) => route.abort());
      const admin = await adminContext.newPage();
      admin.on('pageerror', (error) => errors.push(error.message));
      admin.on('console', (message) => {
        if (
          message.type() === 'error' &&
          !['fonts.googleapis.com', 'fonts.gstatic.com'].some((host) =>
            message.location().url.startsWith('https://' + host + '/'),
          )
        )
          errors.push(message.text());
      });
      await login(
        admin,
        process.env.SEED_ADMIN_EMAIL,
        process.env.SEED_ADMIN_PASSWORD,
        '/tin-nhan?hoi-thoai=' + conversation,
      );
      await expect(admin.getByText('Đã kết nối', { exact: true })).toBeVisible();
      await user.getByLabel('Tin nhắn', { exact: true }).fill('Full runtime local message');
      await user.getByRole('button', { name: 'Gửi', exact: true }).click();
      await expect(admin.locator('.chat-bubble p', { hasText: 'Full runtime local message' })).toBeVisible();
      await admin.screenshot({ path: resolve(artifacts, 'chat-mobile.png') });
      await admin.goto(origin + '/quan-tri');
      await expect(admin.getByRole('heading', { name: 'Tổng quan', exact: true })).toBeVisible();
      await admin.screenshot({ path: resolve(artifacts, 'admin-mobile.png'), fullPage: true });
      for (const path of [
        '/kham-pha',
        '/do-vat/1',
        '/ho-so',
        '/thong-bao',
        '/bai-dang-cua-toi',
        '/dang-bai',
      ]) {
        await user.goto(origin + path);
        await expect(user.locator('main')).toBeVisible();
        await expect(user.getByRole('alert')).toHaveCount(0);
      }
      assert.deepEqual(errors, [], 'No application console/page errors with full runtime');
      assert.deepEqual(unexpectedResponses, [], 'No missing-service API failures');
      console.log(
        'FULL_RUNTIME_BROWSER_PASS',
        JSON.stringify({
          viewports: [360, 390, 768, 1440],
          applicationConsoleErrors: 0,
          httpErrors: 0,
          socketIo: 'real connected and delivered',
          blockedExternalFonts: blockedFonts.length,
          productionAccess: false,
        }),
      );
    } finally {
      await browser?.close();
      await runtime?.close();
      await new Promise((done) => {
        frontend.close(done);
        frontend.closeAllConnections();
      });
    }
  },
);
