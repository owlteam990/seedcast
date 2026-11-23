/**
 * 微信公众号：Markdown → 草稿箱（供引擎与 Skill 共用）
 *
 * @author Seedcast
 * @date 2026-11-23
 */

import { existsSync } from 'node:fs';
import {
  createDraft,
  getDraft,
  uploadImage,
  WechatApiError,
} from './client.js';
import { readWechatCredentials } from './credentials.js';
import {
  markdownToWechatHtml,
  sanitizeWechatHtml,
} from './markdownHtml.js';
import {
  truncateByBytes,
  truncateTitle,
  WECHAT_MAX_AUTHOR_BYTES,
  WECHAT_MAX_DIGEST_BYTES,
} from './truncate.js';

export interface WechatPublishInput {
  /** 账号 profile 目录 */
  profileDir: string;
  /** 标题 */
  title: string;
  /** Markdown 正文 */
  markdown: string;
  /** 账号显示名（作者缺省） */
  accountName?: string;
  /** 封面本地路径（必填，除非有 defaultCoverPath） */
  coverFile?: string;
  /** 插件默认封面 */
  defaultCoverPath?: string;
  /** 作者 */
  author?: string;
  /** 摘要 */
  digest?: string;
  /** 正文是否显示封面 */
  showCoverPic?: number | string;
  /** 原文链接 */
  contentSourceUrl?: string;
  /** 日志 */
  onInfo?: (message: string) => void;
}

export interface WechatPublishResult {
  ok: boolean;
  url?: string;
  draftId?: string;
  error?: { code: string; message: string };
}

/**
 * 发布到公众号草稿箱
 *
 * @param input 发布输入
 * @returns 结果
 */
export async function publishWechatMpDraft(
  input: WechatPublishInput,
): Promise<WechatPublishResult> {
  const log = (msg: string): void => {
    input.onInfo?.(msg);
  };

  try {
    const credentials = readWechatCredentials(input.profileDir);
    if (!credentials) {
      return {
        ok: false,
        error: {
          code: 'VALIDATION',
          message:
            '公众号账号未绑定 AppID/AppSecret，请先 scripts/login.mjs --platform wechat-mp',
        },
      };
    }

    const coverFromSettings = input.coverFile?.trim() ?? '';
    const coverPath = coverFromSettings || input.defaultCoverPath || '';
    if (!coverPath || !existsSync(coverPath)) {
      return {
        ok: false,
        error: {
          code: 'VALIDATION',
          message: `封面图不存在: ${coverPath || '(未指定)'}（请传 --cover）`,
        },
      };
    }

    const authorRaw =
      input.author?.trim() || input.accountName?.trim() || '作者';
    const digestRaw = input.digest?.trim() || input.title;
    const title = truncateTitle(input.title);
    const author = truncateByBytes(authorRaw, WECHAT_MAX_AUTHOR_BYTES);
    const digest = truncateByBytes(digestRaw, WECHAT_MAX_DIGEST_BYTES);

    log('Markdown → 微信 HTML');
    let html = sanitizeWechatHtml(markdownToWechatHtml(input.markdown));
    html = await replaceLocalImages(html, input.profileDir, credentials, log);

    log(`上传封面 ${coverPath}`);
    const { mediaId: thumbMediaId } = await uploadImage(
      input.profileDir,
      credentials,
      coverPath,
    );

    log('创建草稿');
    const draftId = await createDraft(input.profileDir, credentials, {
      title,
      author,
      digest,
      content: html,
      thumbMediaId,
      showCoverPic:
        input.showCoverPic === 0 || input.showCoverPic === '0' ? 0 : 1,
      contentSourceUrl: input.contentSourceUrl ?? '',
    });

    log('回查草稿校验');
    const item = await getDraft(input.profileDir, credentials, draftId);
    const gotTitle = String(item.title ?? '');
    const gotThumb = String(item.thumb_media_id ?? '');
    if (gotTitle !== title) {
      throw new Error(
        `草稿回查标题不一致：期望「${title}」实际「${gotTitle}」`,
      );
    }
    if (!gotThumb) {
      throw new Error('草稿回查缺少 thumb_media_id（封面可能丢失）');
    }

    const previewUrl =
      typeof item.url === 'string' && item.url.length > 0
        ? item.url
        : `wechat-draft:${draftId}`;

    return { ok: true, url: previewUrl, draftId };
  } catch (err) {
    const message =
      err instanceof WechatApiError
        ? err.message
        : err instanceof Error
          ? err.message
          : String(err);
    return {
      ok: false,
      error: {
        code: err instanceof WechatApiError ? 'PLATFORM_REJECTED' : 'UNKNOWN',
        message: `[wechat-mp] ${message}`,
      },
    };
  }
}

/**
 * 上传 HTML 中的本地图片并替换 URL
 */
async function replaceLocalImages(
  html: string,
  profileDir: string,
  credentials: NonNullable<ReturnType<typeof readWechatCredentials>>,
  log: (m: string) => void,
): Promise<string> {
  const re = /<img([^>]*?)src=["']([^"']+)["']([^>]*?)>/gi;
  const matches = [...html.matchAll(re)];
  let out = html;
  for (const m of matches) {
    const src = m[2];
    if (/^https?:\/\//i.test(src) || src.startsWith('data:')) {
      continue;
    }
    if (/cover\.(png|jpe?g|gif)$/i.test(src)) {
      continue;
    }
    let path = src;
    if (src.startsWith('file://')) {
      path = decodeURIComponent(src.replace(/^file:\/\//, ''));
    }
    if (!existsSync(path)) {
      log(`跳过不存在的正文图: ${src}`);
      continue;
    }
    try {
      const { url } = await uploadImage(profileDir, credentials, path);
      if (url) {
        out = out.replace(m[0], `<img${m[1]}src="${url}"${m[3]}>`);
        log(`正文图已上传: ${basenameSafe(path)}`);
      }
    } catch (err) {
      log(
        `正文图上传失败 ${src}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
  return out;
}

function basenameSafe(p: string): string {
  const parts = p.split(/[/\\]/);
  return parts[parts.length - 1] ?? p;
}
