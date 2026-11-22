/**
 * 第三方图床上传
 *
 * 支持 litterbox（免密钥临时）、SM.MS / ImgBB、S3/OSS 兼容存储。
 *
 * @author Seedcast
 * @date 2026-11-22
 */

import { putObjectS3, type S3PutConfig } from './s3Put.js';

/**
 * 图床提供方
 * @see ImageHostProvider
 */
export type ImageHostProvider = 'litterbox' | 'smms' | 'imgbb' | 's3';

/**
 * litterbox 保留时长
 */
export type LitterboxTime = '1h' | '12h' | '24h' | '72h';

/**
 * S3/OSS 图床字段（密钥单独存于 ImageHostConfig）
 */
export type ImageHostS3Fields = Omit<
  S3PutConfig,
  'accessKeyId' | 'secretAccessKey' | 'sessionToken'
> & {
  accessKeyId?: string;
  secretAccessKey?: string;
  sessionToken?: string;
};

/**
 * 图床配置
 */
export interface ImageHostConfig {
  /**
   * 是否启用公网图床（关闭后图文上传将拒绝走第三方）
   */
  enabled?: boolean;
  /**
   * 提供方
   * @see ImageHostProvider
   */
  provider: ImageHostProvider;
  /** litterbox 过期时间，默认 72h */
  litterboxTime?: LitterboxTime;
  /** SM.MS API Token（https://smms.app 免费注册） */
  smmsToken?: string;
  /** ImgBB API Key（https://api.imgbb.com 免费申请） */
  imgbbKey?: string;
  /** S3/OSS Endpoint（可选） */
  s3Endpoint?: string;
  /** S3/OSS Region */
  s3Region?: string;
  /** S3/OSS Bucket */
  s3Bucket?: string;
  /** 对象键目录前缀 */
  s3Prefix?: string;
  /** 自定义访问域名（可选） */
  s3CustomDomain?: string;
  /** Access Key ID */
  s3AccessKeyId?: string;
  /** Secret Access Key */
  s3SecretAccessKey?: string;
  /** Session Token（临时凭据，可选） */
  s3SessionToken?: string;
  /** 强制 Path Style */
  s3ForcePathStyle?: boolean;
}

/**
 * 上传结果
 */
export interface ImageHostUploadResult {
  /** 公网 URL */
  remoteUrl: string;
  /** 使用的提供方 */
  provider: ImageHostProvider;
  /** 额外说明（如过期） */
  note?: string;
}

/** 默认配置 */
export const DEFAULT_IMAGE_HOST: ImageHostConfig = {
  enabled: true,
  provider: 'litterbox',
  litterboxTime: '72h',
  s3Region: 'us-east-1',
  s3ForcePathStyle: false,
};

/**
 * 合并图床配置
 *
 * @param partial 用户覆盖
 * @returns 完整配置
 */
export function resolveImageHostConfig(
  partial?: Partial<ImageHostConfig> | null,
): ImageHostConfig {
  return {
    ...DEFAULT_IMAGE_HOST,
    ...(partial ?? {}),
    enabled: partial?.enabled ?? DEFAULT_IMAGE_HOST.enabled,
    provider: partial?.provider ?? DEFAULT_IMAGE_HOST.provider,
  };
}

/**
 * 从 ImageHostConfig 抽出 S3 连接参数
 *
 * @param cfg 图床配置
 * @returns S3PutConfig
 */
export function toS3PutConfig(cfg: ImageHostConfig): S3PutConfig {
  return {
    endpoint: cfg.s3Endpoint,
    region: cfg.s3Region || 'us-east-1',
    bucket: cfg.s3Bucket || '',
    prefix: cfg.s3Prefix,
    customDomain: cfg.s3CustomDomain,
    accessKeyId: cfg.s3AccessKeyId || '',
    secretAccessKey: cfg.s3SecretAccessKey || '',
    sessionToken: cfg.s3SessionToken,
    forcePathStyle: Boolean(cfg.s3ForcePathStyle),
  };
}

/**
 * 上传 Buffer 到第三方图床
 *
 * @param buf 文件内容
 * @param input 文件名 / mime / 配置
 * @returns 公网 URL
 * @throws Error 上传失败
 * @author Seedcast
 * @date 2026-11-22
 */
export async function uploadToImageHost(
  buf: Buffer,
  input: {
    filename: string;
    mime: string;
    config: ImageHostConfig;
  },
): Promise<ImageHostUploadResult> {
  const cfg = resolveImageHostConfig(input.config);
  if (cfg.enabled === false) {
    throw new Error('公网图床已关闭，请在设置中开启「使用公网图床」');
  }
  if (buf.length === 0) {
    throw new Error('图片内容为空');
  }
  if (buf.length > 20 * 1024 * 1024) {
    throw new Error('图床上传上限 20MB');
  }

  if (cfg.provider === 'litterbox') {
    return uploadLitterbox(buf, input.filename, cfg.litterboxTime ?? '72h');
  }
  if (cfg.provider === 'smms') {
    return uploadSmms(buf, input.filename, cfg.smmsToken);
  }
  if (cfg.provider === 'imgbb') {
    return uploadImgbb(buf, input.filename, cfg.imgbbKey);
  }
  if (cfg.provider === 's3') {
    return uploadS3(buf, input.filename, input.mime, cfg);
  }
  throw new Error(`未知图床: ${String(cfg.provider)}`);
}

/**
 * litterbox.catbox.moe（免密钥，有过期）
 *
 * @param buf 内容
 * @param filename 文件名
 * @param time 过期
 * @returns 结果
 */
async function uploadLitterbox(
  buf: Buffer,
  filename: string,
  time: LitterboxTime,
): Promise<ImageHostUploadResult> {
  const form = new FormData();
  form.set('reqtype', 'fileupload');
  form.set('time', time);
  form.set(
    'fileToUpload',
    new Blob([Uint8Array.from(buf)]),
    filename || 'image.png',
  );

  const res = await fetch(
    'https://litterbox.catbox.moe/resources/internals/api.php',
    {
      method: 'POST',
      body: form,
      signal: AbortSignal.timeout(60_000),
    },
  );
  const text = (await res.text()).trim();
  if (!res.ok || !/^https?:\/\//i.test(text)) {
    throw new Error(`litterbox 上传失败: ${text || res.status}`);
  }
  return {
    remoteUrl: text,
    provider: 'litterbox',
    note: `临时链接，约 ${time} 后过期（免密钥免费图床）`,
  };
}

/**
 * SM.MS v2（需 Token）
 *
 * @param buf 内容
 * @param filename 文件名
 * @param token API Token
 * @returns 结果
 */
async function uploadSmms(
  buf: Buffer,
  filename: string,
  token?: string,
): Promise<ImageHostUploadResult> {
  if (!token || !token.trim()) {
    throw new Error('请先在设置中填写 SM.MS API Token（免费注册）');
  }
  const form = new FormData();
  form.set(
    'smfile',
    new Blob([Uint8Array.from(buf)]),
    filename || 'image.png',
  );

  const res = await fetch('https://sm.ms/api/v2/upload', {
    method: 'POST',
    headers: {
      Authorization: token.trim(),
    },
    body: form,
    signal: AbortSignal.timeout(60_000),
    redirect: 'follow',
  });
  const raw = (await res.json()) as {
    success?: boolean;
    code?: string | number;
    message?: string;
    data?: { url?: string };
  };
  const url =
    raw.data?.url ||
    (raw as { images?: string }).images ||
    undefined;
  if (!url) {
    throw new Error(
      `SM.MS 上传失败: ${raw.message || raw.code || res.status}`,
    );
  }
  return {
    remoteUrl: url,
    provider: 'smms',
    note: 'SM.MS 永久图床（受免费额度限制）',
  };
}

/**
 * ImgBB（需 API Key）
 *
 * @param buf 内容
 * @param filename 文件名
 * @param key API Key
 * @returns 结果
 */
async function uploadImgbb(
  buf: Buffer,
  filename: string,
  key?: string,
): Promise<ImageHostUploadResult> {
  if (!key || !key.trim()) {
    throw new Error('请先在设置中填写 ImgBB API Key（免费申请）');
  }

  // 同时尝试 base64 字段与文件字段（部分网络/WAF 对一种方式更友好）
  const attempts: Array<{ label: string; build: () => FormData }> = [
    {
      label: 'base64',
      build: () => {
        const form = new FormData();
        form.set('image', buf.toString('base64'));
        form.set('name', filename.replace(/\.[^.]+$/, '') || 'seedcast');
        return form;
      },
    },
    {
      label: 'file',
      build: () => {
        const form = new FormData();
        form.set(
          'image',
          new Blob([Uint8Array.from(buf)], { type: 'image/png' }),
          filename || 'image.png',
        );
        return form;
      },
    },
  ];

  const url = `https://api.imgbb.com/1/upload?key=${encodeURIComponent(key.trim())}`;
  let lastErr = '未知错误';

  for (const attempt of attempts) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        body: attempt.build(),
        headers: {
          // 部分地区 WAF 会拦默认 Node UA
          'User-Agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          Accept: 'application/json',
        },
        signal: AbortSignal.timeout(60_000),
      });
      const text = await res.text();
      let raw: {
        success?: boolean;
        status_code?: number;
        error?: { message?: string };
        data?: { url?: string; display_url?: string };
      } = {};
      try {
        raw = JSON.parse(text) as typeof raw;
      } catch {
        lastErr = `非 JSON 响应 HTTP ${res.status}: ${text.slice(0, 120)}`;
        continue;
      }
      const remote = raw.data?.display_url || raw.data?.url;
      if (raw.success && remote) {
        return {
          remoteUrl: remote,
          provider: 'imgbb',
          note: 'ImgBB 免费图床（受额度限制）',
        };
      }
      lastErr =
        raw.error?.message ||
        `HTTP ${res.status}${raw.status_code ? ` / ${raw.status_code}` : ''}`;
      // forbidden 换另一种 body 再试；其它错误直接停
      if (!/forbidden/i.test(lastErr) && attempt.label === 'base64') {
        // 继续试 file
      }
    } catch (err) {
      lastErr = err instanceof Error ? err.message : String(err);
    }
  }

  throw new Error(
    `ImgBB 上传失败: ${lastErr}。若提示 forbidden，多为网络/WAF 拦截 api.imgbb.com，可改用 litterbox 或 S3/OSS`,
  );
}

/**
 * S3 / OSS 兼容上传
 *
 * @param buf 内容
 * @param filename 文件名
 * @param mime MIME
 * @param cfg 图床配置
 * @returns 结果
 */
async function uploadS3(
  buf: Buffer,
  filename: string,
  mime: string,
  cfg: ImageHostConfig,
): Promise<ImageHostUploadResult> {
  const result = await putObjectS3(
    buf,
    toS3PutConfig(cfg),
    filename || 'image.png',
    mime || 'image/png',
  );
  return {
    remoteUrl: result.publicUrl,
    provider: 's3',
    note: '已上传至 S3/OSS 兼容存储',
  };
}
