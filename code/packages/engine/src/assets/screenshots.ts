/**
 * 失败截图路径校验（仅允许 dataDir/logs/screenshots 下）
 *
 * @author Seedcast
 * @date 2026-11-21
 */

import { existsSync, realpathSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';

/**
 * 解析安全的截图绝对路径
 *
 * @param dataDir 数据根
 * @param taskId 任务 ID
 * @param filename 文件名（如 step-3.png）
 * @returns 绝对路径；非法返回 null
 * @author Seedcast
 * @date 2026-11-21
 */
export function resolveScreenshotFile(
  dataDir: string,
  taskId: string,
  filename: string,
): string | null {
  if (
    !taskId ||
    !filename ||
    taskId.includes('/') ||
    taskId.includes('..') ||
    filename.includes('/') ||
    filename.includes('..') ||
    filename.includes('\\')
  ) {
    return null;
  }
  if (!/^step-\d+\.png$/i.test(filename)) {
    return null;
  }
  const root = resolve(join(dataDir, 'logs', 'screenshots'));
  const abs = resolve(join(root, taskId, filename));
  if (!abs.startsWith(root + '/') && abs !== root) {
    return null;
  }
  if (!existsSync(abs)) {
    return null;
  }
  try {
    const real = realpathSync(abs);
    const realRoot = realpathSync(root);
    if (!real.startsWith(realRoot + '/') && real !== realRoot) {
      return null;
    }
    return real;
  } catch {
    return null;
  }
}

/**
 * 从回执中的绝对截图路径提取 taskId + filename（若落在本机截图目录）
 *
 * @param dataDir 数据根
 * @param absPath 截图绝对路径
 * @returns 片段或 null
 */
export function parseScreenshotAbsPath(
  dataDir: string,
  absPath: string,
): { taskId: string; filename: string } | null {
  if (!absPath) {
    return null;
  }
  const root = resolve(join(dataDir, 'logs', 'screenshots'));
  let resolved: string;
  try {
    resolved = resolve(absPath);
  } catch {
    return null;
  }
  if (!resolved.startsWith(root + '/')) {
    return null;
  }
  const rel = resolved.slice(root.length + 1);
  const parts = rel.split('/');
  if (parts.length !== 2) {
    return null;
  }
  const [taskId, filename] = parts;
  if (!resolveScreenshotFile(dataDir, taskId, filename)) {
    return null;
  }
  return { taskId, filename };
}

/**
 * 取目录名（兼容）
 *
 * @param p 路径
 * @returns basename
 */
export function screenshotBasename(p: string): string {
  return basename(p);
}

/**
 * 取父目录名
 *
 * @param p 路径
 * @returns dirname basename
 */
export function screenshotTaskFromPath(p: string): string {
  return basename(dirname(p));
}
