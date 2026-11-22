/**
 * S3 兼容 PutObject（AWS S3 / 阿里云 OSS / MinIO / R2）
 * 使用 Signature Version 4，无额外 SDK 依赖
 *
 * @author Seedcast
 * @date 2026-11-22
 */

import { createHash, createHmac, randomUUID } from 'node:crypto';
import { extname } from 'node:path';

/**
 * S3/OSS 连接参数
 */
export interface S3PutConfig {
  /** Endpoint，如 https://oss-cn-shanghai.aliyuncs.com；空则走 AWS 默认 */
  endpoint?: string;
  /** Region，如 cn-shanghai / us-east-1 */
  region: string;
  /** Bucket 名 */
  bucket: string;
  /** 对象键前缀，如 seedcast/images */
  prefix?: string;
  /** 自定义访问域名（可选） */
  customDomain?: string;
  /** Access Key ID */
  accessKeyId: string;
  /** Secret Access Key */
  secretAccessKey: string;
  /** 临时凭证 Session Token（可选） */
  sessionToken?: string;
  /** 强制 Path Style（MinIO / 部分 OSS 需要） */
  forcePathStyle?: boolean;
}

/**
 * HMAC-SHA256
 *
 * @param key 密钥
 * @param data 数据
 * @returns 摘要
 */
function hmac(key: Buffer | string, data: string): Buffer {
  return createHmac('sha256', key).update(data, 'utf8').digest();
}

/**
 * SHA256 hex
 *
 * @param data 数据
 * @returns hex
 */
function sha256Hex(data: Buffer | string): string {
  return createHash('sha256').update(data).digest('hex');
}

/**
 * 规范化前缀为 `a/b/` 或空
 *
 * @param prefix 原始前缀
 * @returns 规范化
 */
function normalizePrefix(prefix?: string): string {
  if (!prefix || !prefix.trim()) {
    return '';
  }
  return `${prefix.trim().replace(/^\/+|\/+$/g, '')}/`;
}

/**
 * 拼对象键
 *
 * @param prefix 前缀
 * @param filename 文件名
 * @returns key
 */
function buildObjectKey(prefix: string | undefined, filename: string): string {
  const ext = extname(filename) || '.png';
  const safeExt = ext.startsWith('.') ? ext : `.${ext}`;
  return `${normalizePrefix(prefix)}${randomUUID()}${safeExt}`;
}

/**
 * 解析 Endpoint → 协议与 host
 *
 * @param endpoint 可选 endpoint
 * @param region region
 * @param bucket bucket
 * @param forcePathStyle 是否 path-style
 * @returns host / baseUrl / objectUrl 构建所需
 */
function resolveEndpointParts(input: {
  endpoint?: string;
  region: string;
  bucket: string;
  forcePathStyle: boolean;
}): { protocol: string; host: string; pathPrefix: string } {
  const forcePathStyle = input.forcePathStyle;
  if (input.endpoint && input.endpoint.trim()) {
    const u = new URL(
      input.endpoint.includes('://')
        ? input.endpoint.trim()
        : `https://${input.endpoint.trim()}`,
    );
    const host = u.host;
    if (forcePathStyle) {
      return { protocol: u.protocol.replace(':', ''), host, pathPrefix: `/${input.bucket}` };
    }
    // virtual-hosted：bucket.endpointHost
    return {
      protocol: u.protocol.replace(':', ''),
      host: `${input.bucket}.${host}`,
      pathPrefix: '',
    };
  }
  // AWS 默认
  if (forcePathStyle) {
    return {
      protocol: 'https',
      host: `s3.${input.region}.amazonaws.com`,
      pathPrefix: `/${input.bucket}`,
    };
  }
  return {
    protocol: 'https',
    host: `${input.bucket}.s3.${input.region}.amazonaws.com`,
    pathPrefix: '',
  };
}

/**
 * 生成公网访问 URL
 *
 * @param cfg 配置
 * @param key 对象键
 * @returns URL
 */
export function buildPublicUrl(cfg: S3PutConfig, key: string): string {
  if (cfg.customDomain && cfg.customDomain.trim()) {
    const base = cfg.customDomain.trim().replace(/\/+$/, '');
    const withProto = /^https?:\/\//i.test(base) ? base : `https://${base}`;
    return `${withProto}/${key.replace(/^\//, '')}`;
  }
  const parts = resolveEndpointParts({
    endpoint: cfg.endpoint,
    region: cfg.region,
    bucket: cfg.bucket,
    forcePathStyle: Boolean(cfg.forcePathStyle),
  });
  return `${parts.protocol}://${parts.host}${parts.pathPrefix}/${key}`;
}

/**
 * PutObject 上传
 *
 * @param buf 文件内容
 * @param cfg S3 配置
 * @param filename 原始文件名（取扩展名）
 * @param mime Content-Type
 * @returns 公网 URL 与对象键
 * @author Seedcast
 * @date 2026-11-22
 */
export async function putObjectS3(
  buf: Buffer,
  cfg: S3PutConfig,
  filename: string,
  mime: string,
): Promise<{ key: string; publicUrl: string }> {
  if (!cfg.region?.trim()) {
    throw new Error('S3/OSS 需填写 Region');
  }
  if (!cfg.bucket?.trim()) {
    throw new Error('S3/OSS 需填写 Bucket');
  }
  if (!cfg.accessKeyId?.trim() || !cfg.secretAccessKey?.trim()) {
    throw new Error('S3/OSS 需填写 Access Key ID 与 Secret Access Key');
  }

  const region = cfg.region.trim();
  const key = buildObjectKey(cfg.prefix, filename);
  const forcePathStyle = Boolean(cfg.forcePathStyle);
  const parts = resolveEndpointParts({
    endpoint: cfg.endpoint,
    region,
    bucket: cfg.bucket.trim(),
    forcePathStyle,
  });

  const amzDate = new Date()
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}Z$/, 'Z');
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = sha256Hex(buf);
  const contentType = mime || 'application/octet-stream';
  // 路径仅编码非斜杠段（AWS SigV4）
  const canonicalUriFixed = `${parts.pathPrefix}/${key}`
    .split('/')
    .map((seg) => {
      if (seg === '') {
        return '';
      }
      return encodeURIComponent(seg).replace(/[!'()*]/g, (c) => {
        return `%${c.charCodeAt(0).toString(16).toUpperCase()}`;
      });
    })
    .join('/');

  const signedHeadersList = [
    'content-type',
    'host',
    'x-amz-content-sha256',
    'x-amz-date',
  ];
  if (cfg.sessionToken?.trim()) {
    signedHeadersList.push('x-amz-security-token');
  }
  signedHeadersList.sort();
  const signedHeaders = signedHeadersList.join(';');

  const headersMap: Record<string, string> = {
    'content-type': contentType,
    host: parts.host,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate,
  };
  if (cfg.sessionToken?.trim()) {
    headersMap['x-amz-security-token'] = cfg.sessionToken.trim();
  }

  const canonicalHeaders = signedHeadersList
    .map((h) => {
      return `${h}:${headersMap[h].trim()}\n`;
    })
    .join('');

  const canonicalRequest = [
    'PUT',
    canonicalUriFixed,
    '',
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');

  const credentialScope = `${dateStamp}/${region}/s3/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join('\n');

  const kDate = hmac(`AWS4${cfg.secretAccessKey.trim()}`, dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, 's3');
  const kSigning = hmac(kService, 'aws4_request');
  const signature = createHmac('sha256', kSigning)
    .update(stringToSign, 'utf8')
    .digest('hex');

  const authorization = `AWS4-HMAC-SHA256 Credential=${cfg.accessKeyId.trim()}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const url = `${parts.protocol}://${parts.host}${canonicalUriFixed}`;
  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      'Content-Type': contentType,
      Host: parts.host,
      'x-amz-content-sha256': payloadHash,
      'x-amz-date': amzDate,
      ...(cfg.sessionToken?.trim()
        ? { 'x-amz-security-token': cfg.sessionToken.trim() }
        : {}),
      Authorization: authorization,
    },
    body: new Uint8Array(buf),
    signal: AbortSignal.timeout(120_000),
  });

  if (!res.ok) {
    const text = (await res.text()).slice(0, 500);
    throw new Error(`S3/OSS 上传失败 HTTP ${res.status}: ${text || res.statusText}`);
  }

  return {
    key,
    publicUrl: buildPublicUrl(cfg, key),
  };
}
