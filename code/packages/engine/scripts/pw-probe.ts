/**
 * Playwright channel=chrome 冒烟（打包验证用）
 *
 * @author Seedcast
 * @date 2026-11-21
 */

import { chromium } from 'playwright';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

async function main(): Promise<void> {
  const profileDir = mkdtempSync(join(tmpdir(), 'seedcast-pw-'));
  const ctx = await chromium.launchPersistentContext(profileDir, {
    channel: 'chrome',
    headless: true,
  });
  const page = await ctx.newPage();
  await page.goto('data:text/html,<title>seedcast-pw</title>');
  const title = await page.title();
  await ctx.close();
  if (title !== 'seedcast-pw') {
    throw new Error(`unexpected title: ${title}`);
  }
  console.log(JSON.stringify({ ok: true, title, profileDir }));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
