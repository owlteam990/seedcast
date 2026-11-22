/**
 * 插件扫描与加载
 *
 * @author Seedcast
 * @date 2026-11-21
 */

import { existsSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { PluginRecord, PluginSource } from '@seedcast/shared';
import { getDefaultDataDir } from '../paths.js';
import { loadManifest, ManifestValidationError } from './loadManifest.js';

/**
 * 加载结果（成功或失败条目）
 */
export interface PluginLoadResult {
  /** 成功加载的插件 */
  plugins: PluginRecord[];
  /** 加载失败明细（不阻断其它插件） */
  errors: Array<{ dir: string; message: string; code?: string }>;
}

/**
 * 解析内置 plugins 目录
 *
 * 优先级：SEEDCAST_BUILTIN_PLUGINS → 可执行文件旁/Resources → monorepo 开发路径
 *
 * @returns 绝对路径；无法解析时返回 null
 * @author Seedcast
 * @date 2026-11-21
 */
export function resolveBuiltinPluginsDir(): string | null {
  // 1. 壳进程注入（发行包）
  const fromEnv = process.env.SEEDCAST_BUILTIN_PLUGINS?.trim();
  if (fromEnv && existsSync(fromEnv)) {
    return resolve(fromEnv);
  }

  // 2. 相对 sidecar 可执行文件
  // macOS 打包后常见：Contents/MacOS → ../Resources/resources/plugins（Tauri resources 嵌套）
  const execDir = dirname(process.execPath);
  const beside = [
    join(execDir, 'plugins'),
    join(execDir, '../Resources/plugins'),
    join(execDir, '../Resources/resources/plugins'),
    join(execDir, 'resources/plugins'),
  ];
  for (const candidate of beside) {
    if (existsSync(candidate)) {
      return resolve(candidate);
    }
  }

  // 3. monorepo 开发期：packages/engine/src|dist/plugins → ../../../../plugins
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    const candidate = resolve(here, '../../../../plugins');
    if (existsSync(candidate)) {
      return candidate;
    }
  } catch {
    // Bun compile 下 import.meta.url 可能不可用，忽略
  }
  return null;
}

/**
 * 扫描单个根目录下的子目录插件
 *
 * @param rootDir 插件根（每个子目录一个插件）
 * @param source 来源标记
 * @returns 加载结果片段
 * @author Seedcast
 * @date 2026-11-21
 */
function scanRoot(rootDir: string, source: PluginSource): PluginLoadResult {
  const plugins: PluginRecord[] = [];
  const errors: PluginLoadResult['errors'] = [];

  if (!existsSync(rootDir)) {
    return { plugins, errors };
  }

  let entries: string[];
  try {
    entries = readdirSync(rootDir);
  } catch (err) {
    errors.push({
      dir: rootDir,
      message: err instanceof Error ? err.message : String(err),
    });
    return { plugins, errors };
  }

  for (const name of entries) {
    const dir = join(rootDir, name);
    let isDir = false;
    try {
      isDir = statSync(dir).isDirectory();
    } catch {
      continue;
    }
    if (!isDir) {
      continue;
    }
    if (!existsSync(join(dir, 'manifest.json'))) {
      continue;
    }

    try {
      const manifest = loadManifest(dir);
      plugins.push({
        manifest,
        dir,
        source,
        enabled: true,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const code =
        err instanceof ManifestValidationError ? err.code : undefined;
      errors.push({ dir, message, code });
    }
  }

  return { plugins, errors };
}

/**
 * 加载全部插件：内置目录 + ~/.seedcast/plugins
 *
 * @param options 可选覆盖路径
 * @returns 合并后的加载结果（同 id 时 local 覆盖 builtin）
 * @author Seedcast
 * @date 2026-11-21
 */
export function loadAllPlugins(options?: {
  builtinDir?: string | null;
  localDir?: string;
  dataDir?: string;
}): PluginLoadResult {
  const dataDir = options?.dataDir ?? getDefaultDataDir();
  const builtinDir =
    options?.builtinDir === undefined
      ? resolveBuiltinPluginsDir()
      : options.builtinDir;
  const localDir = options?.localDir ?? join(dataDir, 'plugins');

  const merged = new Map<string, PluginRecord>();
  const errors: PluginLoadResult['errors'] = [];

  // 1. 先加载内置，再加载本地（本地同 id 覆盖）
  const roots: Array<{ dir: string | null; source: PluginSource }> = [
    { dir: builtinDir, source: 'builtin' },
    { dir: localDir, source: 'local' },
  ];

  for (const root of roots) {
    if (!root.dir) {
      continue;
    }
    const part = scanRoot(root.dir, root.source);
    errors.push(...part.errors);
    for (const plugin of part.plugins) {
      merged.set(plugin.manifest.id, plugin);
    }
  }

  return {
    plugins: [...merged.values()],
    errors,
  };
}
