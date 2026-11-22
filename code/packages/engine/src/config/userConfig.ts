/**
 * 用户级配置（数据目录 / 图床等）
 * 固定写在 home，不依赖 dataDir（避免鸡生蛋）
 *
 * @author Seedcast
 * @date 2026-11-22
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type {
  ImageHostConfig,
  ImageHostProvider,
  LitterboxTime,
} from '../assets/imageHost.js';
import { DEFAULT_IMAGE_HOST } from '../assets/imageHost.js';

/** 固定配置文件名 */
export const USER_CONFIG_FILE = '.seedcast-config.json';

/**
 * 用户配置结构
 */
export interface UserConfig {
  /** 自定义数据根目录 */
  dataDir?: string;
  /** 第三方图床 */
  imageHost?: ImageHostConfig;
}

/**
 * 用户配置文件绝对路径
 *
 * @returns 路径
 */
export function getUserConfigPath(): string {
  return join(homedir(), USER_CONFIG_FILE);
}

/**
 * 读取可选字符串字段
 *
 * @param obj 源
 * @param key 键
 * @returns 非空字符串或 undefined
 */
function optionalString(
  obj: Record<string, unknown>,
  key: string,
): string | undefined {
  const v = obj[key];
  if (typeof v === 'string' && v.trim()) {
    return v.trim();
  }
  return undefined;
}

/**
 * 解析图床配置片段
 *
 * @param raw 原始对象
 * @returns 配置或 undefined
 */
function parseImageHost(raw: unknown): ImageHostConfig | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return undefined;
  }
  const obj = raw as Record<string, unknown>;
  const provider = obj.provider;
  if (
    provider !== 'litterbox' &&
    provider !== 'smms' &&
    provider !== 'imgbb' &&
    provider !== 's3'
  ) {
    return undefined;
  }
  const out: ImageHostConfig = {
    provider: provider as ImageHostProvider,
  };
  if (typeof obj.enabled === 'boolean') {
    out.enabled = obj.enabled;
  }
  if (
    obj.litterboxTime === '1h' ||
    obj.litterboxTime === '12h' ||
    obj.litterboxTime === '24h' ||
    obj.litterboxTime === '72h'
  ) {
    out.litterboxTime = obj.litterboxTime as LitterboxTime;
  }
  const smmsToken = optionalString(obj, 'smmsToken');
  if (smmsToken) {
    out.smmsToken = smmsToken;
  }
  const imgbbKey = optionalString(obj, 'imgbbKey');
  if (imgbbKey) {
    out.imgbbKey = imgbbKey;
  }
  const s3Endpoint = optionalString(obj, 's3Endpoint');
  if (s3Endpoint) {
    out.s3Endpoint = s3Endpoint;
  }
  const s3Region = optionalString(obj, 's3Region');
  if (s3Region) {
    out.s3Region = s3Region;
  }
  const s3Bucket = optionalString(obj, 's3Bucket');
  if (s3Bucket) {
    out.s3Bucket = s3Bucket;
  }
  const s3Prefix = optionalString(obj, 's3Prefix');
  if (s3Prefix) {
    out.s3Prefix = s3Prefix;
  }
  const s3CustomDomain = optionalString(obj, 's3CustomDomain');
  if (s3CustomDomain) {
    out.s3CustomDomain = s3CustomDomain;
  }
  const s3AccessKeyId = optionalString(obj, 's3AccessKeyId');
  if (s3AccessKeyId) {
    out.s3AccessKeyId = s3AccessKeyId;
  }
  const s3SecretAccessKey = optionalString(obj, 's3SecretAccessKey');
  if (s3SecretAccessKey) {
    out.s3SecretAccessKey = s3SecretAccessKey;
  }
  const s3SessionToken = optionalString(obj, 's3SessionToken');
  if (s3SessionToken) {
    out.s3SessionToken = s3SessionToken;
  }
  if (typeof obj.s3ForcePathStyle === 'boolean') {
    out.s3ForcePathStyle = obj.s3ForcePathStyle;
  }
  return out;
}

/**
 * 读取用户配置
 *
 * @returns 配置对象
 * @author Seedcast
 * @date 2026-11-22
 */
export function readUserConfig(): UserConfig {
  const path = getUserConfigPath();
  if (!existsSync(path)) {
    return {};
  }
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8')) as unknown;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return {};
    }
    const obj = raw as Record<string, unknown>;
    const out: UserConfig = {};
    if (typeof obj.dataDir === 'string' && obj.dataDir.trim()) {
      out.dataDir = obj.dataDir.trim();
    }
    const ih = parseImageHost(obj.imageHost);
    if (ih) {
      out.imageHost = ih;
    }
    return out;
  } catch {
    return {};
  }
}

/**
 * 合并图床补丁：空字符串密钥表示「不改动已保存密钥」
 *
 * @param prev 已有
 * @param patch 补丁
 * @returns 合并结果
 */
export function mergeImageHostPatch(
  prev: ImageHostConfig | undefined,
  patch: Partial<ImageHostConfig>,
): ImageHostConfig {
  const base: ImageHostConfig = {
    ...DEFAULT_IMAGE_HOST,
    ...prev,
  };
  const next: ImageHostConfig = { ...base, ...patch, provider: patch.provider ?? base.provider };

  // 密钥类：空串不覆盖
  const secretKeys = [
    'smmsToken',
    'imgbbKey',
    's3AccessKeyId',
    's3SecretAccessKey',
    's3SessionToken',
  ] as const;
  for (const k of secretKeys) {
    const v = patch[k];
    if (v === undefined || (typeof v === 'string' && !v.trim())) {
      if (base[k]) {
        next[k] = base[k];
      } else {
        delete next[k];
      }
    }
  }

  // 可选非密钥字符串：允许显式清空（传空串）
  const clearable = [
    's3Endpoint',
    's3Prefix',
    's3CustomDomain',
  ] as const;
  for (const k of clearable) {
    if (Object.prototype.hasOwnProperty.call(patch, k)) {
      const v = patch[k];
      if (typeof v === 'string' && !v.trim()) {
        delete next[k];
      }
    }
  }

  return next;
}

/**
 * 写入用户配置（合并）
 *
 * @param patch 补丁（imageHost 可为部分字段）
 * @returns 合并后配置
 * @author Seedcast
 * @date 2026-11-22
 */
export function writeUserConfig(patch: {
  dataDir?: string;
  imageHost?: Partial<ImageHostConfig>;
}): UserConfig {
  const prev = readUserConfig();
  const next: UserConfig = { ...prev };
  if (patch.dataDir !== undefined) {
    const v = patch.dataDir.trim();
    if (v) {
      next.dataDir = v;
    } else {
      delete next.dataDir;
    }
  }
  if (patch.imageHost !== undefined) {
    next.imageHost = mergeImageHostPatch(prev.imageHost, patch.imageHost);
  }
  writeFileSync(getUserConfigPath(), `${JSON.stringify(next, null, 2)}\n`, {
    mode: 0o600,
  });
  return next;
}

/**
 * 当前生效的图床配置
 *
 * @returns 配置
 */
export function getImageHostConfig(): ImageHostConfig {
  return {
    ...DEFAULT_IMAGE_HOST,
    ...readUserConfig().imageHost,
  };
}
