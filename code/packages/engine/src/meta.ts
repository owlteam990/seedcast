/**
 * 引擎运行时元信息（端口 / Token）
 *
 * @author Seedcast
 * @date 2026-11-21
 */

import { randomBytes } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ENGINE_META_FILE } from '@seedcast/shared';
import { ensureDataDirs, getDefaultDataDir } from './paths.js';

/**
 * 写入 ~/.seedcast/engine.json 的运行时元信息
 */
export interface EngineMeta {
  /** 监听主机（仅本机） */
  host: string;
  /** 监听端口 */
  port: number;
  /** 随机 Token */
  token: string;
  /** 进程 PID */
  pid: number;
  /** 写入时间 ISO */
  startedAt: string;
}

/**
 * 生成随机 Token
 *
 * @returns hex Token
 * @author Seedcast
 * @date 2026-11-21
 */
export function generateToken(): string {
  return randomBytes(24).toString('hex');
}

/**
 * 创建并持久化引擎元信息
 *
 * @param input 端口、Token、启动时间等
 * @param dataDir 数据根目录
 * @returns 写入的元信息
 * @author Seedcast
 * @date 2026-11-21
 */
export function writeEngineMeta(
  input: {
    port: number;
    token: string;
    startedAt?: string;
  },
  dataDir: string = getDefaultDataDir(),
): EngineMeta {
  // 1. 确保目录存在
  ensureDataDirs(dataDir);

  // 2. 组装元信息
  const meta: EngineMeta = {
    host: '127.0.0.1',
    port: input.port,
    token: input.token,
    pid: process.pid,
    startedAt: input.startedAt ?? new Date().toISOString(),
  };

  // 3. 写入 engine.json（本地文件，不进 git；权限 0600）
  const metaPath = join(dataDir, ENGINE_META_FILE);
  writeFileSync(metaPath, `${JSON.stringify(meta, null, 2)}\n`, {
    encoding: 'utf8',
    mode: 0o600,
  });

  return meta;
}

/**
 * @deprecated 使用 writeEngineMeta
 * @param port 端口
 * @param dataDir 数据目录
 * @returns 元信息
 */
export function createEngineMeta(
  port: number,
  dataDir: string = getDefaultDataDir(),
): EngineMeta {
  return writeEngineMeta({ port, token: generateToken() }, dataDir);
}
