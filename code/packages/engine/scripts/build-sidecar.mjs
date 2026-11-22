/**
 * 构建引擎 sidecar（Bun compile）并同步官方插件到 Tauri resources
 *
 * 用法：node scripts/build-sidecar.mjs
 * 前置：已 pnpm build；本机已安装 bun
 *
 * @author Seedcast
 * @date 2026-11-21
 */

import { spawnSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const engineRoot = resolve(__dirname, '..');
const codeRoot = resolve(engineRoot, '../..');
const cliJs = join(engineRoot, 'dist/cli.js');
const binariesDir = join(codeRoot, 'apps/desktop/src-tauri/binaries');
const resourcesPlugins = join(
  codeRoot,
  'apps/desktop/src-tauri/resources/plugins',
);
const sourcePlugins = join(codeRoot, 'plugins');

/**
 * 映射当前平台到 Tauri externalBin 目标三元组
 *
 * @returns {{ triple: string, ext: string }}
 */
function targetTriple() {
  const { platform, arch } = process;
  if (platform === 'darwin' && arch === 'arm64') {
    return { triple: 'aarch64-apple-darwin', ext: '' };
  }
  if (platform === 'darwin' && arch === 'x64') {
    return { triple: 'x86_64-apple-darwin', ext: '' };
  }
  if (platform === 'win32' && arch === 'x64') {
    return { triple: 'x86_64-pc-windows-msvc', ext: '.exe' };
  }
  if (platform === 'win32' && arch === 'arm64') {
    return { triple: 'aarch64-pc-windows-msvc', ext: '.exe' };
  }
  if (platform === 'linux' && arch === 'x64') {
    return { triple: 'x86_64-unknown-linux-gnu', ext: '' };
  }
  if (platform === 'linux' && arch === 'arm64') {
    return { triple: 'aarch64-unknown-linux-gnu', ext: '' };
  }
  throw new Error(`不支持的 sidecar 目标: ${platform}/${arch}`);
}

/**
 * 确保 bun 可用
 *
 * @returns {string} bun 可执行路径
 */
function resolveBun() {
  const probe = spawnSync('bun', ['--version'], { encoding: 'utf8' });
  if (probe.status !== 0) {
    throw new Error('未找到 bun：请安装 https://bun.sh 后再构建 sidecar');
  }
  return 'bun';
}

/**
 * 同步官方插件到 Tauri resources
 */
function syncOfficialPlugins() {
  const ids = [
    'mock',
    'zhihu',
    'wechat-mp',
    'csdn',
    'jianshu',
    'baijiahao',
    'toutiao',
  ];
  mkdirSync(resourcesPlugins, { recursive: true });
  for (const id of ids) {
    const src = join(sourcePlugins, id);
    const dest = join(resourcesPlugins, id);
    if (!existsSync(src)) {
      console.warn(`[sidecar] skip missing plugin: ${id}`);
      continue;
    }
    rmSync(dest, { recursive: true, force: true });
    cpSync(src, dest, { recursive: true });
  }
}

/**
 * 主流程
 */
function main() {
  if (!existsSync(cliJs)) {
    throw new Error(`缺少 ${cliJs}，请先 pnpm --filter @seedcast/engine build`);
  }
  const bun = resolveBun();
  const { triple, ext } = targetTriple();
  mkdirSync(binariesDir, { recursive: true });

  const outName = `seedcast-engine-${triple}${ext}`;
  const outPath = join(binariesDir, outName);

  console.log(`[sidecar] bun compile → ${outPath}`);
  const build = spawnSync(
    bun,
    ['build', cliJs, '--compile', '--outfile', outPath],
    {
      cwd: engineRoot,
      stdio: 'inherit',
      env: process.env,
    },
  );
  if (build.status !== 0) {
    throw new Error('bun compile 失败');
  }

  // 占位说明，避免空目录被忽略
  writeFileSync(
    join(binariesDir, 'README.md'),
    [
      '# Sidecar 二进制（构建产物，勿手改）',
      '',
      '由 `pnpm --filter @seedcast/engine sidecar` 生成。',
      '命名：`seedcast-engine-<target-triple>[.exe]`',
      '',
    ].join('\n'),
    'utf8',
  );

  syncOfficialPlugins();
  writeFileSync(
    join(resourcesPlugins, '.gitkeep'),
    '',
    'utf8',
  );

  console.log(
    JSON.stringify(
      {
        ok: true,
        outfile: outPath,
        triple,
        pluginsResource: resourcesPlugins,
      },
      null,
      2,
    ),
  );
}

main();
