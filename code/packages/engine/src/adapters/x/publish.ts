/**
 * X：文章 / 图文 → 发帖（官方 API）
 *
 * @author Seedcast
 * @date 2026-11-22
 */

import type {
  Account,
  Content,
  PluginRecord,
  PublishTarget,
  Receipt,
} from '@seedcast/shared';
import { SeedcastErrorCode } from '@seedcast/shared';
import { buildXPostText, createXPost, getXUserMe, xPostUrl } from './client.js';
import { readXCredentials } from './credentials.js';

/**
 * 发布到 X
 *
 * @param input 发布输入
 * @returns 回执
 */
export async function publishXPost(input: {
  plugin: PluginRecord;
  content: Content;
  target: PublishTarget;
  account: Account;
  taskId: string;
  onInfo?: (message: string) => void;
}): Promise<Receipt> {
  const { content, target, account, taskId, onInfo } = input;
  const at = new Date().toISOString();
  const settings = target.settings ?? {};
  const log = (msg: string): void => {
    onInfo?.(msg);
  };

  try {
    const credentials = readXCredentials(account.profileDir);
    if (!credentials) {
      return {
        taskId,
        target,
        ok: false,
        error: {
          code: SeedcastErrorCode.VALIDATION,
          message: 'X 账号未绑定 API 凭证，请到账号页填写 Keys and tokens',
        },
        at,
      };
    }

    log('校验 X 凭证');
    const me = await getXUserMe(credentials);
    log(`已授权：@${me.username}`);

    const custom =
      typeof settings.text === 'string' ? settings.text.trim() : '';
    const text =
      custom || buildXPostText(content.title, content.markdown ?? '');
    if (!text.trim()) {
      throw new Error('发帖文案为空');
    }

    log('发布帖子');
    const { id } = await createXPost(credentials, text);
    return {
      taskId,
      target,
      ok: true,
      url: xPostUrl(me.username, id),
      at,
    };
  } catch (err) {
    return {
      taskId,
      target,
      ok: false,
      error: {
        code: SeedcastErrorCode.PLATFORM_REJECTED,
        message: err instanceof Error ? err.message : String(err),
      },
      at,
    };
  }
}
