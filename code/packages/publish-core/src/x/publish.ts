/**
 * X：标题 + Markdown → 发帖（官方 API）
 *
 * @author Seedcast
 * @date 2026-11-23
 */

import {
  buildXPostText,
  createXPost,
  getXUserMe,
  xPostUrl,
} from './client.js';
import { readXCredentials } from './credentials.js';

export interface XPublishInput {
  profileDir: string;
  title: string;
  markdown: string;
  /** 覆盖文案（可选） */
  text?: string;
  onInfo?: (message: string) => void;
}

export interface XPublishResult {
  ok: boolean;
  url?: string;
  postId?: string;
  error?: { code: string; message: string };
}

/**
 * 发布到 X
 *
 * @param input 发布输入
 * @returns 结果
 */
export async function publishXPost(
  input: XPublishInput,
): Promise<XPublishResult> {
  const log = (msg: string): void => {
    input.onInfo?.(msg);
  };

  try {
    const credentials = readXCredentials(input.profileDir);
    if (!credentials) {
      return {
        ok: false,
        error: {
          code: 'VALIDATION',
          message:
            'X 账号未绑定 API 凭证，请 accounts add --platform x --apikey ...',
        },
      };
    }

    log('校验 X 凭证');
    const me = await getXUserMe(credentials);
    log(`已授权：@${me.username}`);

    const custom = typeof input.text === 'string' ? input.text.trim() : '';
    const text =
      custom || buildXPostText(input.title, input.markdown ?? '');
    if (!text.trim()) {
      throw new Error('发帖文案为空');
    }

    log('发布帖子');
    const { id } = await createXPost(credentials, text);
    return {
      ok: true,
      postId: id,
      url: xPostUrl(me.username, id),
    };
  } catch (err) {
    return {
      ok: false,
      error: {
        code: 'PLATFORM_REJECTED',
        message: err instanceof Error ? err.message : String(err),
      },
    };
  }
}
