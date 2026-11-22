/**
 * 发布任务执行器（串行目标 + 进度回调）
 *
 * @author Seedcast
 * @date 2026-11-21
 */

import { join } from 'node:path';
import type {
  Account,
  Content,
  PluginRecord,
  ProgressEvent,
  PublishTarget,
  Receipt,
} from '@seedcast/shared';
import { SeedcastErrorCode } from '@seedcast/shared';
import { publishBaijiahaoDraft } from '../adapters/baijiahao/publish.js';
import { publishCsdnDraft } from '../adapters/csdn/publish.js';
import { publishJianshuDraft } from '../adapters/jianshu/publish.js';
import { publishToutiaoDraft } from '../adapters/toutiao/publish.js';
import { publishWechatMpDraft } from '../adapters/wechatMp/publish.js';
import { getAccount } from '../db/accounts.js';
import type { SeedcastDatabase } from '../db/database.js';
import { getContent } from '../db/contents.js';
import {
  createTask,
  insertReceipt,
  updateTaskStatus,
} from '../db/tasks.js';
import type { PluginLoadResult } from '../plugins/loader.js';
import { checkAccountSession } from '../session/accountsService.js';
import {
  publishWithFlow,
  validatePublishSettings,
} from './flowPublisher.js';

/**
 * Cookie / 官方 API 代码适配器发布函数
 */
type CodePublishFn = (input: {
  plugin: PluginRecord;
  content: Content;
  target: PublishTarget;
  account: Account;
  taskId: string;
  onInfo?: (message: string) => void;
}) => Promise<Receipt>;

/** 已接入的代码适配器 */
const CODE_PUBLISHERS: Record<
  string,
  { label: string; publish: CodePublishFn }
> = {
  'wechat-mp': {
    label: '写入公众号草稿箱（官方 API）',
    publish: publishWechatMpDraft,
  },
  csdn: {
    label: '写入 CSDN 草稿箱（Web API）',
    publish: publishCsdnDraft,
  },
  jianshu: {
    label: '写入简书草稿（Web API）',
    publish: publishJianshuDraft,
  },
  baijiahao: {
    label: '写入百家号草稿（Web API）',
    publish: publishBaijiahaoDraft,
  },
  toutiao: {
    label: '写入头条号图文（Web API）',
    publish: publishToutiaoDraft,
  },
};

/**
 * 发布请求体
 */
export interface PublishRequest {
  /** 内容 ID */
  contentId: string;
  /** 目标列表 */
  targets: PublishTarget[];
}

/**
 * 执行一次发布任务（调用方负责串行入队）
 *
 * @param input 依赖与请求
 * @param emit 进度事件回调
 * @returns 任务 ID 与全部回执
 * @author Seedcast
 * @date 2026-11-21
 */
export async function runPublishJob(
  input: {
    db: SeedcastDatabase;
    dataDir: string;
    pluginResult: PluginLoadResult;
    request: PublishRequest;
  },
  emit: (event: ProgressEvent) => void,
): Promise<{ taskId: string; receipts: Receipt[] }> {
  const { db, dataDir, pluginResult, request } = input;

  // 1. 校验内容
  const content = getContent(db, request.contentId);
  if (!content) {
    throw new Error(`内容不存在: ${request.contentId}`);
  }
  if (!request.targets || request.targets.length === 0) {
    throw new Error('targets 不能为空');
  }

  // 2. 建任务
  const task = createTask(db, content.id, request.targets);
  updateTaskStatus(db, task.id, 'running');
  emit({
    type: 'info',
    taskId: task.id,
    message: `任务开始，共 ${request.targets.length} 个目标`,
  });

  const receipts: Receipt[] = [];
  const pluginMap = new Map(
    pluginResult.plugins.map((p) => {
      return [p.manifest.id, p] as const;
    }),
  );

  // 3. 按目标顺序串行发布
  for (let i = 0; i < request.targets.length; i += 1) {
    const target = request.targets[i];
    emit({
      type: 'info',
      taskId: task.id,
      targetIndex: i,
      message: `开始发布 → ${target.pluginId}`,
    });

    const plugin = pluginMap.get(target.pluginId);
    let receipt: Receipt;

    if (!plugin || !plugin.enabled) {
      receipt = {
        taskId: task.id,
        target,
        ok: false,
        error: {
          code: SeedcastErrorCode.PLUGIN_NOT_FOUND,
          message: `插件未加载或未启用: ${target.pluginId}`,
        },
        at: new Date().toISOString(),
      };
    } else if (!target.accountId || target.accountId === 'local-dev') {
      receipt = {
        taskId: task.id,
        target,
        ok: false,
        error: {
          code: SeedcastErrorCode.VALIDATION,
          message: '请先选择已登录的账号再发布',
        },
        at: new Date().toISOString(),
      };
    } else {
      const account = getAccount(db, target.accountId);
      if (!account || account.pluginId !== target.pluginId) {
        receipt = {
          taskId: task.id,
          target,
          ok: false,
          error: {
            code: SeedcastErrorCode.VALIDATION,
            message: `账号不存在或不属于插件 ${target.pluginId}`,
          },
          at: new Date().toISOString(),
        };
      } else if (plugin.manifest.adapter === 'flow') {
        // 3.0 设置校验（非法 publishType 等，避免先开浏览器）
        let settingsError: string | null = null;
        try {
          validatePublishSettings(
            plugin.manifest.id,
            target.settings ?? {},
          );
        } catch (err) {
          settingsError =
            err instanceof Error ? err.message : String(err);
        }

        if (settingsError) {
          receipt = {
            taskId: task.id,
            target,
            ok: false,
            error: {
              code: SeedcastErrorCode.VALIDATION,
              message: settingsError,
            },
            at: new Date().toISOString(),
          };
        } else {
          // 3.1 发布前登录态检测（失败则引导重登，不继续盲发）
          emit({
            type: 'info',
            taskId: task.id,
            targetIndex: i,
            message: `检测登录态 → ${account.name}`,
          });
          let loggedIn = account.status === 'logged_in';
          try {
            loggedIn = await checkAccountSession({ db, account, plugin });
          } catch (err) {
            emit({
              type: 'info',
              taskId: task.id,
              targetIndex: i,
              message: `登录态检测异常，继续尝试发布: ${
                err instanceof Error ? err.message : String(err)
              }`,
            });
          }

          if (!loggedIn && plugin.manifest.id !== 'mock') {
            receipt = {
              taskId: task.id,
              target,
              ok: false,
              error: {
                code: SeedcastErrorCode.SESSION_EXPIRED,
                message: `账号「${account.name}」登录态失效，请到账号页重新扫码登录`,
              },
              at: new Date().toISOString(),
            };
          } else {
            // mock 无头；真实平台有头便于观察与过验证
            const headless = plugin.manifest.id === 'mock';
            emit({
              type: 'info',
              taskId: task.id,
              targetIndex: i,
              message: headless
                ? '执行 flow（无头）'
                : '执行 flow（将打开 Chrome，请勿关闭）',
            });
            receipt = await publishWithFlow({
              plugin,
              content,
              target,
              account,
              taskId: task.id,
              screenshotDir: join(dataDir, 'logs', 'screenshots', task.id),
              headless,
            });
          }
        }
      } else if (plugin.manifest.adapter === 'code') {
        // 代码适配器：公众号官方 API / 各平台 Cookie Web API
        const codePluginId = plugin.manifest.id;
        const publisher = CODE_PUBLISHERS[codePluginId];
        const isWechat = codePluginId === 'wechat-mp';

        if (!publisher) {
          receipt = {
            taskId: task.id,
            target,
            ok: false,
            error: {
              code: SeedcastErrorCode.VALIDATION,
              message: `代码适配器尚未接入: ${target.pluginId}`,
            },
            at: new Date().toISOString(),
          };
        } else {
          emit({
            type: 'info',
            taskId: task.id,
            targetIndex: i,
            message: isWechat
              ? `检测公众号凭证 → ${account.name}`
              : `检测登录态 → ${account.name}`,
          });
          let loggedIn = account.status === 'logged_in';
          try {
            loggedIn = await checkAccountSession({ db, account, plugin });
          } catch (err) {
            emit({
              type: 'info',
              taskId: task.id,
              targetIndex: i,
              message: `会话检测异常: ${
                err instanceof Error ? err.message : String(err)
              }`,
            });
            loggedIn = false;
          }
          if (!loggedIn) {
            receipt = {
              taskId: task.id,
              target,
              ok: false,
              error: {
                code: SeedcastErrorCode.SESSION_EXPIRED,
                message: isWechat
                  ? `公众号「${account.name}」凭证失效，请重新绑定 AppID/AppSecret`
                  : `账号「${account.name}」登录态失效，请到账号页重新登录`,
              },
              at: new Date().toISOString(),
            };
          } else {
            emit({
              type: 'info',
              taskId: task.id,
              targetIndex: i,
              message: publisher.label,
            });
            receipt = await publisher.publish({
              plugin,
              content,
              target,
              account,
              taskId: task.id,
              onInfo: (message: string) => {
                emit({
                  type: 'info',
                  taskId: task.id,
                  targetIndex: i,
                  message,
                });
              },
            });
          }
        }
      } else {
        receipt = {
          taskId: task.id,
          target,
          ok: false,
          error: {
            code: SeedcastErrorCode.VALIDATION,
            message: `未知适配器类型: ${String(plugin.manifest.adapter)}`,
          },
          at: new Date().toISOString(),
        };
      }
    }

    insertReceipt(db, receipt);
    receipts.push(receipt);

    if (receipt.ok) {
      emit({
        type: 'success',
        taskId: task.id,
        targetIndex: i,
        message: receipt.url ?? '发布成功',
        data: { url: receipt.url },
      });
    } else {
      emit({
        type: 'error',
        taskId: task.id,
        targetIndex: i,
        message: receipt.error?.message ?? '发布失败',
        data: { error: receipt.error },
      });
    }
  }

  // 4. 收尾
  updateTaskStatus(db, task.id, 'done');
  emit({
    type: 'finish',
    taskId: task.id,
    message: '任务结束',
    data: {
      okCount: receipts.filter((r) => {
        return r.ok;
      }).length,
      failCount: receipts.filter((r) => {
        return !r.ok;
      }).length,
    },
  });

  return { taskId: task.id, receipts };
}
