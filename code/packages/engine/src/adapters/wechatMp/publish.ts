/**
 * 微信公众号：Markdown → 草稿箱
 *
 * @author Seedcast
 * @date 2026-11-21
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type {
  Account,
  Content,
  PluginRecord,
  PublishTarget,
  Receipt,
} from '@seedcast/shared';
import { SeedcastErrorCode } from '@seedcast/shared';
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

/**
 * 发布到公众号草稿箱
 *
 * @param input 发布输入
 * @returns 回执
 * @author Seedcast
 * @date 2026-11-21
 */
export async function publishWechatMpDraft(input: {
  plugin: PluginRecord;
  content: Content;
  target: PublishTarget;
  account: Account;
  taskId: string;
  onInfo?: (message: string) => void;
}): Promise<Receipt> {
  const { plugin, content, target, account, taskId, onInfo } = input;
  const at = new Date().toISOString();
  const settings = target.settings ?? {};
  const log = (msg: string): void => {
    onInfo?.(msg);
  };

  try {
    // 1. 读凭证
    const credentials = readWechatCredentials(account.profileDir);
    if (!credentials) {
      return {
        taskId,
        target,
        ok: false,
        error: {
          code: SeedcastErrorCode.VALIDATION,
          message:
            '公众号账号未绑定 AppID/AppSecret，请到账号页使用「绑定凭证」',
        },
        at,
      };
    }

    // 2. 封面：settings.coverFile → 插件默认 cover
    const coverFromSettings =
      typeof settings.coverFile === 'string' ? settings.coverFile.trim() : '';
    const defaultCover = join(plugin.dir, 'fixtures', 'cover.png');
    const coverPath = coverFromSettings || defaultCover;
    if (!existsSync(coverPath)) {
      return {
        taskId,
        target,
        ok: false,
        error: {
          code: SeedcastErrorCode.VALIDATION,
          message: `封面图不存在: ${coverPath}（请在发布设置填写 coverFile）`,
        },
        at,
      };
    }

    const authorRaw =
      typeof settings.author === 'string' && settings.author.trim()
        ? settings.author.trim()
        : account.name;
    const digestRaw =
      typeof settings.digest === 'string' && settings.digest.trim()
        ? settings.digest.trim()
        : content.title;

    const title = truncateTitle(content.title);
    const author = truncateByBytes(authorRaw, WECHAT_MAX_AUTHOR_BYTES);
    const digest = truncateByBytes(digestRaw, WECHAT_MAX_DIGEST_BYTES);

    log('Markdown → 微信 HTML');
    let html = sanitizeWechatHtml(markdownToWechatHtml(content.markdown));

    // 3. 上传正文本地图片（file:// 或相对路径）
    html = await replaceLocalImages(
      html,
      account.profileDir,
      credentials,
      log,
    );

    log(`上传封面 ${coverPath}`);
    const { mediaId: thumbMediaId } = await uploadImage(
      account.profileDir,
      credentials,
      coverPath,
    );

    log('创建草稿');
    const draftId = await createDraft(account.profileDir, credentials, {
      title,
      author,
      digest,
      content: html,
      thumbMediaId,
      showCoverPic:
        settings.showCoverPic === 0 || settings.showCoverPic === '0' ? 0 : 1,
      contentSourceUrl:
        typeof settings.contentSourceUrl === 'string'
          ? settings.contentSourceUrl
          : '',
    });

    log('回查草稿校验');
    const item = await getDraft(account.profileDir, credentials, draftId);
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

    return {
      taskId,
      target,
      ok: true,
      url: previewUrl,
      at: new Date().toISOString(),
    };
  } catch (err) {
    const message =
      err instanceof WechatApiError
        ? err.message
        : err instanceof Error
          ? err.message
          : String(err);
    return {
      taskId,
      target,
      ok: false,
      error: {
        code:
          err instanceof WechatApiError
            ? SeedcastErrorCode.PLATFORM_REJECTED
            : SeedcastErrorCode.UNKNOWN,
        message: `[wechat-mp] ${message}`,
      },
      at: new Date().toISOString(),
    };
  }
}

/**
 * 上传 HTML 中的本地图片并替换 URL
 *
 * @param html HTML
 * @param profileDir 账号目录
 * @param credentials 凭证
 * @param log 日志
 * @returns 替换后 HTML
 */
async function replaceLocalImages(
  html: string,
  profileDir: string,
  credentials: ReturnType<typeof readWechatCredentials> & object,
  log: (m: string) => void,
): Promise<string> {
  if (!credentials) {
    return html;
  }
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

/**
 * 取文件名
 *
 * @param p 路径
 * @returns 文件名
 */
function basenameSafe(p: string): string {
  const parts = p.split(/[/\\]/);
  return parts[parts.length - 1] ?? p;
}
