/**
 * 发现本机运行中的引擎（读 engine.json / 环境变量）
 *
 * @author Seedcast
 * @date 2026-11-22
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ENGINE_META_FILE } from '@seedcast/shared';
import { readUserConfig } from '../config/userConfig.js';
import type { EngineMeta } from '../meta.js';
import { getDefaultDataDir } from '../paths.js';

/**
 * 解析数据目录：SEEDCAST_DATA_DIR > 用户配置 > 默认 ~/.seedcast
 *
 * @returns 绝对路径
 * @author Seedcast
 * @date 2026-11-22
 */
export function resolveClientDataDir(): string {
  const fromEnv = process.env.SEEDCAST_DATA_DIR;
  if (fromEnv && fromEnv.trim().length > 0) {
    return fromEnv.trim();
  }
  const fromFile = readUserConfig().dataDir;
  if (fromFile && fromFile.trim().length > 0) {
    return fromFile.trim();
  }
  return getDefaultDataDir();
}

/**
 * 从文件读取引擎元信息
 *
 * @param dataDir 数据根目录
 * @returns 元信息
 * @throws 文件缺失或格式错误
 * @author Seedcast
 * @date 2026-11-22
 */
export function readEngineMetaFile(
  dataDir: string = resolveClientDataDir(),
): EngineMeta {
  const metaPath = join(dataDir, ENGINE_META_FILE);
  if (!existsSync(metaPath)) {
    throw new Error(
      `未找到 ${metaPath}。请先启动引擎（pnpm --filter @seedcast/engine start）`,
    );
  }
  const raw = JSON.parse(readFileSync(metaPath, 'utf8')) as Partial<EngineMeta>;
  if (
    typeof raw.host !== 'string' ||
    typeof raw.port !== 'number' ||
    typeof raw.token !== 'string' ||
    typeof raw.pid !== 'number' ||
    typeof raw.startedAt !== 'string'
  ) {
    throw new Error(`engine.json 格式无效: ${metaPath}`);
  }
  return {
    host: raw.host,
    port: raw.port,
    token: raw.token,
    pid: raw.pid,
    startedAt: raw.startedAt,
  };
}

/**
 * 发现引擎连接信息（环境变量可覆盖端口 / Token）
 *
 * @returns 元信息
 * @author Seedcast
 * @date 2026-11-22
 */
export function discoverEngineMeta(): EngineMeta {
  // 1. 完整环境覆盖（调试 / CI）
  const envHost = process.env.SEEDCAST_HOST?.trim();
  const envPort = process.env.SEEDCAST_PORT?.trim();
  const envToken = process.env.SEEDCAST_TOKEN?.trim();
  if (envPort && envToken) {
    const port = Number(envPort);
    if (!Number.isFinite(port) || port <= 0) {
      throw new Error(`SEEDCAST_PORT 无效: ${envPort}`);
    }
    return {
      host: envHost && envHost.length > 0 ? envHost : '127.0.0.1',
      port,
      token: envToken,
      pid: 0,
      startedAt: new Date().toISOString(),
    };
  }

  // 2. 读本机 engine.json
  const meta = readEngineMetaFile();

  // 3. 允许单独覆盖 host
  if (envHost && envHost.length > 0) {
    return { ...meta, host: envHost };
  }
  return meta;
}
