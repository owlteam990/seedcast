/**
 * 视频素材：分片上传、ffmpeg 抽封面
 *
 * @author Seedcast
 * @date 2026-11-21
 */

import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';

/** 单文件上限 512MB */
export const VIDEO_MAX_BYTES = 512 * 1024 * 1024;

/** 分片会话默认过期（毫秒） */
const UPLOAD_TTL_MS = 2 * 60 * 60 * 1000;

/**
 * MIME → 扩展名
 */
const VIDEO_EXT: Record<string, string> = {
  'video/mp4': '.mp4',
  'video/quicktime': '.mov',
  'video/x-msvideo': '.avi',
  'video/x-matroska': '.mkv',
  'video/x-flv': '.flv',
  'video/webm': '.webm',
};

interface UploadSession {
  id: string;
  filename: string;
  mime: string;
  size: number;
  partDir: string;
  createdAt: number;
  received: Set<number>;
}

const sessions = new Map<string, UploadSession>();

/**
 * 上传根目录
 *
 * @param dataDir 数据根
 * @returns 路径
 */
function uploadsRoot(dataDir: string): string {
  return join(dataDir, 'assets', '.uploads');
}

/**
 * 清理过期会话
 *
 * @param dataDir 数据根
 */
function gcSessions(dataDir: string): void {
  const now = Date.now();
  for (const [id, s] of sessions) {
    if (now - s.createdAt > UPLOAD_TTL_MS) {
      sessions.delete(id);
      rmSync(s.partDir, { recursive: true, force: true });
    }
  }
  const root = uploadsRoot(dataDir);
  if (!existsSync(root)) {
    return;
  }
}

/**
 * 从文件名推断扩展名
 *
 * @param filename 文件名
 * @param mime mime
 * @returns .ext
 */
function resolveExt(filename: string | undefined, mime: string): string {
  const fromName = filename?.includes('.')
    ? `.${filename.split('.').pop()!.toLowerCase()}`
    : '';
  if (fromName && fromName.length <= 5) {
    return fromName;
  }
  return VIDEO_EXT[mime] || '.mp4';
}

/**
 * 初始化分片上传
 *
 * @param dataDir 数据根
 * @param input 元信息
 * @returns 会话
 * @author Seedcast
 * @date 2026-11-21
 */
export function initVideoUpload(
  dataDir: string,
  input: { filename?: string; mime: string; size: number },
): { uploadId: string; partSize: number } {
  gcSessions(dataDir);
  if (!Number.isFinite(input.size) || input.size <= 0) {
    throw new Error('size 无效');
  }
  if (input.size > VIDEO_MAX_BYTES) {
    throw new Error(`视频过大（上限 ${VIDEO_MAX_BYTES / (1024 * 1024)}MB）`);
  }
  const mime = (input.mime || 'video/mp4').split(';')[0].trim().toLowerCase();
  const ext = resolveExt(input.filename, mime);
  const id = randomUUID();
  const partDir = join(uploadsRoot(dataDir), id);
  mkdirSync(partDir, { recursive: true });
  sessions.set(id, {
    id,
    filename: `${id}${ext}`,
    mime,
    size: input.size,
    partDir,
    createdAt: Date.now(),
    received: new Set(),
  });
  return { uploadId: id, partSize: 512 * 1024 };
}

/**
 * 写入一个分片
 *
 * @param uploadId 会话
 * @param index 分片序号（从 0）
 * @param dataBase64 分片 base64
 * @author Seedcast
 * @date 2026-11-21
 */
export function writeVideoPart(
  uploadId: string,
  index: number,
  dataBase64: string,
): void {
  const s = sessions.get(uploadId);
  if (!s) {
    throw new Error('上传会话不存在或已过期');
  }
  if (!Number.isInteger(index) || index < 0) {
    throw new Error('index 无效');
  }
  let b64 = dataBase64.trim();
  const comma = b64.indexOf(',');
  if (b64.startsWith('data:') && comma >= 0) {
    b64 = b64.slice(comma + 1);
  }
  const buf = Buffer.from(b64, 'base64');
  if (buf.length === 0) {
    throw new Error('分片为空');
  }
  writeFileSync(join(s.partDir, `${index}.part`), buf);
  s.received.add(index);
}

/**
 * 合并分片到 assets
 *
 * @param dataDir 数据根
 * @param uploadId 会话
 * @returns 落盘结果
 * @author Seedcast
 * @date 2026-11-21
 */
export async function finishVideoUpload(
  dataDir: string,
  uploadId: string,
): Promise<{ path: string; filename: string }> {
  const s = sessions.get(uploadId);
  if (!s) {
    throw new Error('上传会话不存在或已过期');
  }
  const parts = readdirSync(s.partDir)
    .filter((n) => {
      return n.endsWith('.part');
    })
    .map((n) => {
      return Number(n.replace(/\.part$/, ''));
    })
    .filter((n) => {
      return Number.isInteger(n);
    })
    .sort((a, b) => {
      return a - b;
    });
  if (parts.length === 0) {
    throw new Error('没有收到任何分片');
  }
  for (let i = 0; i < parts.length; i += 1) {
    if (parts[i] !== i) {
      throw new Error(`分片不连续，缺第 ${i} 片`);
    }
  }

  const assetsDir = join(dataDir, 'assets');
  mkdirSync(assetsDir, { recursive: true });
  const abs = join(assetsDir, s.filename);
  const chunks: Buffer[] = [];
  let total = 0;
  for (const i of parts) {
    const chunk = readFileSync(join(s.partDir, `${i}.part`));
    total += chunk.length;
    if (total > VIDEO_MAX_BYTES) {
      throw new Error('合并后超出大小上限');
    }
    chunks.push(chunk);
  }
  writeFileSync(abs, Buffer.concat(chunks));

  sessions.delete(uploadId);
  rmSync(s.partDir, { recursive: true, force: true });
  return { path: abs, filename: s.filename };
}

/**
 * 检测本机 ffmpeg
 *
 * @returns 可执行路径或 null
 * @author Seedcast
 * @date 2026-11-21
 */
export function resolveFfmpeg(): string | null {
  const probe = spawnSync('ffmpeg', ['-version'], {
    encoding: 'utf8',
    timeout: 5000,
  });
  if (probe.status === 0) {
    return 'ffmpeg';
  }
  return null;
}

/**
 * 用 ffmpeg 抽取视频首帧为封面 PNG
 *
 * @param dataDir 数据根
 * @param videoAbs 视频绝对路径
 * @returns 封面路径
 * @throws Error 无 ffmpeg 或抽取失败
 * @author Seedcast
 * @date 2026-11-21
 */
export function extractVideoCover(
  dataDir: string,
  videoAbs: string,
): { path: string; filename: string } {
  if (!existsSync(videoAbs)) {
    throw new Error(`视频不存在: ${videoAbs}`);
  }
  const bin = resolveFfmpeg();
  if (!bin) {
    throw new Error(
      '自动提取需要先安装 ffmpeg，并将 ffmpeg 加入系统环境变量 PATH。',
    );
  }
  const assetsDir = join(dataDir, 'assets');
  mkdirSync(assetsDir, { recursive: true });
  const filename = `${randomUUID()}.png`;
  const out = join(assetsDir, filename);
  const result = spawnSync(
    bin,
    [
      '-y',
      '-ss',
      '0',
      '-i',
      videoAbs,
      '-frames:v',
      '1',
      '-q:v',
      '2',
      out,
    ],
    { encoding: 'utf8', timeout: 120_000 },
  );
  if (result.status !== 0 || !existsSync(out)) {
    const err = (result.stderr || result.stdout || '').slice(0, 400);
    throw new Error(`抽取封面失败: ${err || result.status}`);
  }
  return { path: out, filename };
}
