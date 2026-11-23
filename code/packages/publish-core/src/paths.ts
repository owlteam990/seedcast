/**
 * 数据目录（复用 ~/.seedcast）
 *
 * @author Seedcast
 * @date 2026-11-23
 */

import { homedir } from 'node:os';
import { join } from 'node:path';
import { mkdirSync } from 'node:fs';
import { DATA_DIR_NAME } from '@seedcast/shared';

/**
 * 默认数据根目录
 *
 * @returns ~/.seedcast 绝对路径
 */
export function getDefaultDataDir(): string {
  if (process.env.SEEDCAST_DATA_DIR?.trim()) {
    return process.env.SEEDCAST_DATA_DIR.trim();
  }
  return join(homedir(), DATA_DIR_NAME);
}

/**
 * 确保数据根及常用子目录存在
 *
 * @param dataDir 数据根
 * @returns 实际路径
 */
export function ensureDataDirs(dataDir: string = getDefaultDataDir()): string {
  const subdirs = ['db', 'profiles', 'assets', 'plugins', 'logs'];
  mkdirSync(dataDir, { recursive: true });
  for (const name of subdirs) {
    mkdirSync(join(dataDir, name), { recursive: true });
  }
  return dataDir;
}

/**
 * 账号 profile 目录
 *
 * @param dataDir 数据根
 * @param pluginId 插件 ID
 * @param accountId 账号 ID
 * @returns profile 绝对路径
 */
export function resolveProfileDir(
  dataDir: string,
  pluginId: string,
  accountId: string,
): string {
  return join(dataDir, 'profiles', pluginId, accountId);
}
