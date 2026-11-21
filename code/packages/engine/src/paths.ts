/**
 * 本地数据目录路径工具
 *
 * @author Seedcast
 * @date 2026-11-21
 */

import { homedir } from 'node:os';
import { join } from 'node:path';
import { mkdirSync } from 'node:fs';
import { DATA_DIR_NAME } from '@seedcast/shared';

/**
 * 返回默认数据根目录（~/.seedcast）
 *
 * @returns 绝对路径
 * @author Seedcast
 * @date 2026-11-21
 */
export function getDefaultDataDir(): string {
  return join(homedir(), DATA_DIR_NAME);
}

/**
 * 确保数据根及常用子目录存在
 *
 * @param dataDir 数据根目录，默认 ~/.seedcast
 * @returns 实际使用的数据根路径
 * @author Seedcast
 * @date 2026-11-21
 */
export function ensureDataDirs(dataDir: string = getDefaultDataDir()): string {
  // 1. 创建根目录与核心子目录（不含业务写入的临时测试目录）
  const subdirs = ['db', 'profiles', 'assets', 'plugins', 'logs'];
  mkdirSync(dataDir, { recursive: true });
  for (const name of subdirs) {
    mkdirSync(join(dataDir, name), { recursive: true });
  }
  return dataDir;
}
