/**
 * 本地 HTTP API（仅 127.0.0.1）
 *
 * @author Seedcast
 * @date 2026-11-21
 */

import { createReadStream } from 'node:fs';
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http';
import { extname } from 'node:path';
import {
  ENGINE_API_VERSION,
  type ContentType,
  type PublishTarget,
} from '@seedcast/shared';
import { resolveScreenshotFile } from '../assets/screenshots.js';
import {
  resolveImageHostConfig,
  uploadToImageHost,
  type ImageHostConfig,
} from '../assets/imageHost.js';
import {
  resolveAssetFile,
  saveAssetFromBase64,
} from '../assets/store.js';
import {
  extractVideoCover,
  finishVideoUpload,
  initVideoUpload,
  resolveFfmpeg,
  writeVideoPart,
} from '../assets/videoStore.js';
import {
  getImageHostConfig,
  getUserConfigPath,
  mergeImageHostPatch,
  readUserConfig,
  writeUserConfig,
} from '../config/userConfig.js';

/**
 * 对外返回的图床摘要（不含密钥明文）
 *
 * @param imageHost 完整配置
 * @returns 安全摘要
 */
function imageHostPublicSummary(imageHost: ImageHostConfig) {
  return {
    enabled: imageHost.enabled !== false,
    provider: imageHost.provider,
    litterboxTime: imageHost.litterboxTime ?? '72h',
    hasSmmsToken: Boolean(imageHost.smmsToken),
    hasImgbbKey: Boolean(imageHost.imgbbKey),
    s3Endpoint: imageHost.s3Endpoint ?? '',
    s3Region: imageHost.s3Region ?? 'us-east-1',
    s3Bucket: imageHost.s3Bucket ?? '',
    s3Prefix: imageHost.s3Prefix ?? '',
    s3CustomDomain: imageHost.s3CustomDomain ?? '',
    hasS3AccessKeyId: Boolean(imageHost.s3AccessKeyId),
    hasS3SecretAccessKey: Boolean(imageHost.s3SecretAccessKey),
    hasS3SessionToken: Boolean(imageHost.s3SessionToken),
    s3ForcePathStyle: Boolean(imageHost.s3ForcePathStyle),
  };
}

/** 1×1 PNG，用于图床连通性测试 */
const IMAGE_HOST_TEST_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);
import type { SeedcastDatabase } from '../db/database.js';
import { getSchemaVersion } from '../db/database.js';
import {
  createContent,
  deleteContent,
  getContent,
  listContents,
  updateContent,
} from '../db/contents.js';
import { getAccount } from '../db/accounts.js';
import { listRecords } from '../db/tasks.js';
import {
  createSettingTemplate,
  deleteSettingTemplate,
  listSettingTemplates,
  updateSettingTemplate,
} from '../db/settingTemplates.js';
import { installLocalPlugin } from '../plugins/install.js';
import { loadAllPlugins, type PluginLoadResult } from '../plugins/loader.js';
import { loadPluginSchema } from '../plugins/schema.js';
import { getDefaultDataDir } from '../paths.js';
import { runPublishJob } from '../publish/runner.js';
import type { SerialQueue } from '../queue/serialQueue.js';
import { bindWechatMpAccount } from '../adapters/wechatMp/bindAccount.js';
import { bindXAccount } from '../adapters/x/bindAccount.js';
import { bindYouTubeAccount } from '../adapters/youtube/bindAccount.js';
import {
  checkAccountSession,
  listAllAccounts,
  loginAccount,
  openAccountBrowser,
  removeAccount,
} from '../session/accountsService.js';
import { assertAuthorized } from './auth.js';
import { readJsonBody } from './body.js';
import { endSse, initSse, sendSseEvent } from './sse.js';

/**
 * HTTP 服务依赖
 */
export interface EngineHttpContext {
  /** 启动时间 */
  startedAt: string;
  /** 认证 Token */
  token: string;
  /** SQLite */
  db: SeedcastDatabase;
  /** 已加载插件快照（安装后可热更新） */
  pluginResult: PluginLoadResult;
  /** 数据目录 */
  dataDir: string;
  /** 全局串行队列 */
  queue: SerialQueue;
}

/**
 * 风险提示文案（第三方插件安装）
 */
export const PLUGIN_INSTALL_RISK =
  '插件在引擎进程内执行，持有账号会话，属于受信代码而非安全沙箱。请只安装可信来源插件。';

/**
 * 启动结果
 */
export interface EngineHttpServer {
  /** Node Server */
  server: Server;
  /** 实际监听端口 */
  port: number;
  /** 关闭 */
  close: () => Promise<void>;
}

/**
 * 是否为本机 GUI 合法 Origin（Vite 开发态 + Tauri WebView）
 *
 * @param origin 请求 Origin
 * @returns 是否放行
 */
function isLocalGuiOrigin(origin: string): boolean {
  // Vite / 浏览器开发：http://127.0.0.1:5173
  if (/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/i.test(origin)) {
    return true;
  }
  // Tauri 2 发行包 WebView（否则 fetch 在 WKWebView 报 Load failed）
  if (/^tauri:\/\//i.test(origin)) {
    return true;
  }
  if (/^asset:\/\//i.test(origin)) {
    return true;
  }
  if (/^https?:\/\/tauri\.localhost(?::\d+)?$/i.test(origin)) {
    return true;
  }
  if (/^https?:\/\/ipc\.localhost(?::\d+)?$/i.test(origin)) {
    return true;
  }
  return false;
}

/**
 * 为本机 GUI 放行 CORS（开发 Vite + Tauri 壳）
 *
 * @param req 请求
 * @param res 响应
 */
function applyCors(req: IncomingMessage, res: ServerResponse): void {
  const origin = req.headers.origin;
  if (typeof origin === 'string' && isLocalGuiOrigin(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader(
      'Access-Control-Allow-Headers',
      'Authorization, Content-Type, Accept',
    );
    res.setHeader(
      'Access-Control-Allow-Methods',
      'GET,POST,PUT,DELETE,OPTIONS',
    );
  }
}

/**
 * 写入 JSON 响应
 *
 * @param res 响应
 * @param status HTTP 状态
 * @param body 对象
 */
function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = `${JSON.stringify(body)}\n`;
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
  });
  res.end(payload);
}

/**
 * 解析 URL
 *
 * @param req 请求
 * @returns URL
 */
function urlOf(req: IncomingMessage): URL {
  try {
    return new URL(req.url ?? '/', 'http://127.0.0.1');
  } catch {
    return new URL('/', 'http://127.0.0.1');
  }
}

/**
 * 处理发布配置模板路由
 *
 * @param ctx 上下文
 * @param req 请求
 * @param res 响应
 * @param method 方法
 * @param path 路径
 * @param url URL
 * @returns 是否已处理
 */
async function handleSettingTemplates(
  ctx: EngineHttpContext,
  req: IncomingMessage,
  res: ServerResponse,
  method: string,
  path: string,
  url: URL,
): Promise<boolean> {
  if (method === 'GET' && path === '/setting-templates') {
    const plugin = url.searchParams.get('plugin') ?? undefined;
    sendJson(res, 200, {
      ok: true,
      templates: listSettingTemplates(ctx.db, plugin),
    });
    return true;
  }

  if (method === 'POST' && path === '/setting-templates') {
    const body = (await readJsonBody(req)) as {
      pluginId?: string;
      name?: string;
      settings?: Record<string, unknown>;
    };
    if (!body.pluginId || !body.name?.trim()) {
      sendJson(res, 400, { ok: false, error: 'pluginId 与 name 必填' });
      return true;
    }
    const tpl = createSettingTemplate(ctx.db, {
      pluginId: body.pluginId,
      name: body.name,
      settings: body.settings ?? {},
    });
    sendJson(res, 201, { ok: true, template: tpl });
    return true;
  }

  const one = /^\/setting-templates\/([^/]+)$/.exec(path);
  if (method === 'PUT' && one) {
    const body = (await readJsonBody(req)) as {
      name?: string;
      settings?: Record<string, unknown>;
    };
    const tpl = updateSettingTemplate(
      ctx.db,
      decodeURIComponent(one[1]),
      body,
    );
    if (!tpl) {
      sendJson(res, 404, { ok: false, error: 'not_found' });
      return true;
    }
    sendJson(res, 200, { ok: true, template: tpl });
    return true;
  }

  if (method === 'DELETE' && one) {
    const ok = deleteSettingTemplate(ctx.db, decodeURIComponent(one[1]));
    sendJson(res, ok ? 200 : 404, { ok });
    return true;
  }

  return false;
}

/**
 * 处理内容库路由
 *
 * @param ctx 上下文
 * @param req 请求
 * @param res 响应
 * @param method 方法
 * @param path 路径
 * @returns 是否已处理
 */
async function handleContents(
  ctx: EngineHttpContext,
  req: IncomingMessage,
  res: ServerResponse,
  method: string,
  path: string,
): Promise<boolean> {
  if (method === 'GET' && path === '/contents') {
    sendJson(res, 200, { ok: true, contents: listContents(ctx.db) });
    return true;
  }

  const one = /^\/contents\/([^/]+)$/.exec(path);
  if (method === 'GET' && one) {
    const content = getContent(ctx.db, decodeURIComponent(one[1]));
    if (!content) {
      sendJson(res, 404, { ok: false, error: 'not_found' });
      return true;
    }
    sendJson(res, 200, { ok: true, content });
    return true;
  }

  if (method === 'POST' && path === '/contents') {
    const body = (await readJsonBody(req)) as {
      title?: string;
      markdown?: string;
      assets?: string[];
      contentType?: ContentType;
    };
    if (!body.title || typeof body.markdown !== 'string') {
      sendJson(res, 400, { ok: false, error: 'title 与 markdown 必填' });
      return true;
    }
    const content = createContent(ctx.db, {
      title: body.title,
      markdown: body.markdown,
      assets: body.assets,
      contentType: body.contentType,
    });
    sendJson(res, 201, { ok: true, content });
    return true;
  }

  if (method === 'PUT' && one) {
    const body = (await readJsonBody(req)) as {
      title?: string;
      markdown?: string;
      assets?: string[];
      contentType?: ContentType;
    };
    const content = updateContent(ctx.db, decodeURIComponent(one[1]), body);
    if (!content) {
      sendJson(res, 404, { ok: false, error: 'not_found' });
      return true;
    }
    sendJson(res, 200, { ok: true, content });
    return true;
  }

  if (method === 'DELETE' && one) {
    const ok = deleteContent(ctx.db, decodeURIComponent(one[1]));
    sendJson(res, ok ? 200 : 404, { ok });
    return true;
  }

  return false;
}

/**
 * 处理发布 SSE
 *
 * @param ctx 上下文
 * @param req 请求
 * @param res 响应
 */
async function handlePublish(
  ctx: EngineHttpContext,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  let body: { contentId?: string; targets?: PublishTarget[] };
  try {
    body = (await readJsonBody(req)) as {
      contentId?: string;
      targets?: PublishTarget[];
    };
  } catch (err) {
    sendJson(res, 400, {
      ok: false,
      error: err instanceof Error ? err.message : 'invalid_json',
    });
    return;
  }

  if (!body.contentId || !Array.isArray(body.targets)) {
    sendJson(res, 400, { ok: false, error: 'contentId 与 targets 必填' });
    return;
  }

  initSse(res);

  try {
    await ctx.queue.enqueue(async () => {
      return runPublishJob(
        {
          db: ctx.db,
          dataDir: ctx.dataDir,
          pluginResult: ctx.pluginResult,
          request: {
            contentId: body.contentId as string,
            targets: body.targets as PublishTarget[],
          },
        },
        (event) => {
          sendSseEvent(res, event);
        },
      );
    });
  } catch (err) {
    sendSseEvent(res, {
      type: 'error',
      taskId: '',
      message: err instanceof Error ? err.message : String(err),
    });
    sendSseEvent(res, {
      type: 'finish',
      taskId: '',
      message: '任务异常结束',
    });
  }

  endSse(res);
}

/**
 * 账号相关路由
 *
 * @param ctx 上下文
 * @param req 请求
 * @param res 响应
 * @param method 方法
 * @param path 路径
 * @param url URL
 * @returns 是否已处理
 */
async function handleAccounts(
  ctx: EngineHttpContext,
  req: IncomingMessage,
  res: ServerResponse,
  method: string,
  path: string,
  url: URL,
): Promise<boolean> {
  if (method === 'GET' && path === '/accounts') {
    const plugin = url.searchParams.get('plugin') ?? undefined;
    sendJson(res, 200, {
      ok: true,
      accounts: listAllAccounts(ctx.db, plugin ?? undefined),
    });
    return true;
  }

  if (method === 'POST' && path === '/accounts/login') {
    const body = (await readJsonBody(req)) as {
      plugin?: string;
      name?: string;
      timeoutMs?: number;
    };
    if (!body.plugin || !body.name) {
      sendJson(res, 400, { ok: false, error: 'plugin 与 name 必填' });
      return true;
    }
    const plugin = ctx.pluginResult.plugins.find((p) => {
      return p.manifest.id === body.plugin;
    });
    if (!plugin) {
      sendJson(res, 404, { ok: false, error: `插件不存在: ${body.plugin}` });
      return true;
    }
    // 客户端断开或取消请求时，中止扫码等待并释放 Chrome profile
    const abort = new AbortController();
    const onAbort = (): void => {
      abort.abort();
    };
    req.on('close', onAbort);
    req.on('aborted', onAbort);
    try {
      const result = await loginAccount({
        db: ctx.db,
        dataDir: ctx.dataDir,
        plugin,
        name: body.name,
        timeoutMs: body.timeoutMs,
        signal: abort.signal,
      });
      sendJson(res, 200, {
        ok: true,
        loggedIn: result.loggedIn,
        outcome: result.outcome,
        account: result.account,
      });
    } catch (err) {
      sendJson(res, 500, {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      req.off('close', onAbort);
      req.off('aborted', onAbort);
    }
    return true;
  }

  if (method === 'POST' && path === '/accounts/bind') {
    const body = (await readJsonBody(req)) as {
      plugin?: string;
      name?: string;
      appid?: string;
      appsecret?: string;
      apiKey?: string;
      apiSecret?: string;
      accessToken?: string;
      accessTokenSecret?: string;
      clientId?: string;
      clientSecret?: string;
      refreshToken?: string;
    };
    if (!body.plugin || !body.name) {
      sendJson(res, 400, {
        ok: false,
        error: 'plugin 与 name 必填',
      });
      return true;
    }
    const plugin = ctx.pluginResult.plugins.find((p) => {
      return p.manifest.id === body.plugin;
    });
    if (!plugin) {
      sendJson(res, 404, { ok: false, error: `插件不存在: ${body.plugin}` });
      return true;
    }
    try {
      let result: { account: unknown; loggedIn: boolean };
      if (body.plugin === 'wechat-mp') {
        if (!body.appid || !body.appsecret) {
          sendJson(res, 400, {
            ok: false,
            error: '公众号需填写 appid、appsecret',
          });
          return true;
        }
        result = await bindWechatMpAccount({
          db: ctx.db,
          dataDir: ctx.dataDir,
          plugin,
          name: body.name,
          appid: body.appid,
          appsecret: body.appsecret,
        });
      } else if (body.plugin === 'x') {
        if (
          !body.apiKey ||
          !body.apiSecret ||
          !body.accessToken ||
          !body.accessTokenSecret
        ) {
          sendJson(res, 400, {
            ok: false,
            error:
              'X 需填写 apiKey、apiSecret、accessToken、accessTokenSecret',
          });
          return true;
        }
        result = await bindXAccount({
          db: ctx.db,
          dataDir: ctx.dataDir,
          plugin,
          name: body.name,
          apiKey: body.apiKey,
          apiSecret: body.apiSecret,
          accessToken: body.accessToken,
          accessTokenSecret: body.accessTokenSecret,
        });
      } else if (body.plugin === 'youtube') {
        if (!body.clientId || !body.clientSecret || !body.refreshToken) {
          sendJson(res, 400, {
            ok: false,
            error: 'YouTube 需填写 clientId、clientSecret、refreshToken',
          });
          return true;
        }
        result = await bindYouTubeAccount({
          db: ctx.db,
          dataDir: ctx.dataDir,
          plugin,
          name: body.name,
          clientId: body.clientId,
          clientSecret: body.clientSecret,
          refreshToken: body.refreshToken,
        });
      } else {
        sendJson(res, 400, {
          ok: false,
          error: `插件 ${body.plugin} 不支持凭证绑定`,
        });
        return true;
      }
      sendJson(res, 200, {
        ok: true,
        loggedIn: result.loggedIn,
        account: result.account,
      });
    } catch (err) {
      sendJson(res, 500, {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
    return true;
  }

  if (method === 'GET' && path === '/accounts/session') {
    const pluginId = url.searchParams.get('plugin');
    const accountId = url.searchParams.get('account');
    if (!pluginId || !accountId) {
      sendJson(res, 400, { ok: false, error: 'plugin 与 account 必填' });
      return true;
    }
    const account = getAccount(ctx.db, accountId);
    if (!account || account.pluginId !== pluginId) {
      sendJson(res, 404, { ok: false, error: '账号不存在' });
      return true;
    }
    const plugin = ctx.pluginResult.plugins.find((p) => {
      return p.manifest.id === pluginId;
    });
    if (!plugin) {
      sendJson(res, 404, { ok: false, error: '插件不存在' });
      return true;
    }
    const loggedIn = await checkAccountSession({
      db: ctx.db,
      account,
      plugin,
    });
    sendJson(res, 200, {
      ok: true,
      loggedIn,
      status: loggedIn ? 'logged_in' : 'expired',
      account: getAccount(ctx.db, accountId),
    });
    return true;
  }

  if (method === 'POST' && path === '/accounts/open') {
    const body = (await readJsonBody(req)) as {
      accountId?: string;
      url?: string;
    };
    if (!body.accountId) {
      sendJson(res, 400, { ok: false, error: 'accountId 必填' });
      return true;
    }
    const account = getAccount(ctx.db, body.accountId);
    if (!account) {
      sendJson(res, 404, { ok: false, error: '账号不存在' });
      return true;
    }
    const plugin = ctx.pluginResult.plugins.find((p) => {
      return p.manifest.id === account.pluginId;
    });
    if (!plugin) {
      sendJson(res, 404, { ok: false, error: '插件不存在' });
      return true;
    }
    try {
      const opened = await openAccountBrowser({
        account,
        plugin,
        url: body.url,
      });
      sendJson(res, 200, {
        ok: true,
        url: opened.url,
        message: '已用该账号 profile 打开浏览器，关闭窗口即可结束',
      });
    } catch (err) {
      sendJson(res, 500, {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
    return true;
  }

  const del = /^\/accounts\/([^/]+)$/.exec(path);
  if (method === 'DELETE' && del) {
    const ok = await removeAccount({
      db: ctx.db,
      accountId: decodeURIComponent(del[1]),
    });
    sendJson(res, ok ? 200 : 404, { ok });
    return true;
  }

  return false;
}

/**
 * 创建并监听本地 HTTP 服务（port=0 表示系统分配随机端口）
 *
 * @param ctx 上下文
 * @param preferredPort 首选端口，默认 0
 * @returns 服务句柄
 * @author Seedcast
 * @date 2026-11-21
 */
export async function startHttpServer(
  ctx: EngineHttpContext,
  preferredPort = 0,
): Promise<EngineHttpServer> {
  const server = createServer((req, res) => {
    void (async () => {
      // 0. 本机 GUI CORS + 预检
      applyCors(req, res);
      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }

      // 1. 统一认证
      if (!assertAuthorized(req, res, ctx.token)) {
        return;
      }

      const method = req.method ?? 'GET';
      const url = urlOf(req);
      const path = url.pathname;

      // 2. 健康检查
      if (method === 'GET' && path === '/ping') {
        sendJson(res, 200, {
          ok: true,
          name: '@seedcast/engine',
          apiVersion: ENGINE_API_VERSION,
          schemaVersion: getSchemaVersion(ctx.db),
          dataDir: ctx.dataDir,
          startedAt: ctx.startedAt,
          pluginsLoaded: ctx.pluginResult.plugins.length,
          pluginErrors: ctx.pluginResult.errors.length,
          queueBusy: ctx.queue.isBusy(),
        });
        return;
      }

      // 3. 插件列表（附带 schema.json）
      if (method === 'GET' && path === '/plugins') {
        sendJson(res, 200, {
          ok: true,
          plugins: ctx.pluginResult.plugins.map((p) => {
            return {
              id: p.manifest.id,
              name: p.manifest.name,
              version: p.manifest.version,
              apiVersion: p.manifest.apiVersion,
              adapter: p.manifest.adapter,
              contentTypes: p.manifest.contentTypes,
              source: p.source,
              enabled: p.enabled,
              dir: p.dir,
              capabilities: p.manifest.capabilities ?? null,
              schema: loadPluginSchema(p.dir),
            };
          }),
          errors: ctx.pluginResult.errors,
        });
        return;
      }

      // 3b. 素材：上传（仅本地）
      if (method === 'POST' && path === '/assets') {
        const body = (await readJsonBody(req)) as {
          mime?: string;
          dataBase64?: string;
          filename?: string;
        };
        if (!body.dataBase64 || typeof body.dataBase64 !== 'string') {
          sendJson(res, 400, { ok: false, error: 'dataBase64 必填' });
          return;
        }
        try {
          const saved = saveAssetFromBase64(ctx.dataDir, {
            mime: body.mime ?? 'application/octet-stream',
            dataBase64: body.dataBase64,
            filename: body.filename,
          });
          sendJson(res, 201, {
            ok: true,
            path: saved.path,
            filename: saved.filename,
            url: `/assets/${encodeURIComponent(saved.filename)}`,
          });
        } catch (err) {
          sendJson(res, 400, {
            ok: false,
            error: err instanceof Error ? err.message : String(err),
          });
        }
        return;
      }

      // 3b2b. 图床连通性测试（可用未保存草稿配置）
      if (method === 'POST' && path === '/assets/remote/test') {
        const body = (await readJsonBody(req)) as {
          imageHost?: Partial<ImageHostConfig>;
        };
        try {
          const draft = mergeImageHostPatch(
            getImageHostConfig(),
            body.imageHost && typeof body.imageHost === 'object'
              ? body.imageHost
              : {},
          );
          const remote = await uploadToImageHost(IMAGE_HOST_TEST_PNG, {
            filename: 'seedcast-test.png',
            mime: 'image/png',
            config: draft,
          });
          sendJson(res, 200, {
            ok: true,
            remoteUrl: remote.remoteUrl,
            provider: remote.provider,
            note: remote.note ?? null,
          });
        } catch (err) {
          sendJson(res, 400, {
            ok: false,
            error: err instanceof Error ? err.message : String(err),
          });
        }
        return;
      }

      // 3b2. 素材：本地入库 + 第三方图床
      if (method === 'POST' && path === '/assets/remote') {
        const body = (await readJsonBody(req)) as {
          mime?: string;
          dataBase64?: string;
          filename?: string;
        };
        if (!body.dataBase64 || typeof body.dataBase64 !== 'string') {
          sendJson(res, 400, { ok: false, error: 'dataBase64 必填' });
          return;
        }
        try {
          const saved = saveAssetFromBase64(ctx.dataDir, {
            mime: body.mime ?? 'image/png',
            dataBase64: body.dataBase64,
            filename: body.filename,
          });
          let b64 = body.dataBase64.trim();
          const comma = b64.indexOf(',');
          if (b64.startsWith('data:') && comma >= 0) {
            b64 = b64.slice(comma + 1);
          }
          const buf = Buffer.from(b64, 'base64');
          const remote = await uploadToImageHost(buf, {
            filename: body.filename || saved.filename,
            mime: body.mime ?? 'image/png',
            config: getImageHostConfig(),
          });
          sendJson(res, 201, {
            ok: true,
            path: saved.path,
            filename: saved.filename,
            url: `/assets/${encodeURIComponent(saved.filename)}`,
            remoteUrl: remote.remoteUrl,
            provider: remote.provider,
            note: remote.note ?? null,
          });
        } catch (err) {
          sendJson(res, 400, {
            ok: false,
            error: err instanceof Error ? err.message : String(err),
          });
        }
        return;
      }

      // 3c. 视频分片上传
      if (method === 'POST' && path === '/assets/video/init') {
        const body = (await readJsonBody(req)) as {
          filename?: string;
          mime?: string;
          size?: number;
        };
        try {
          const init = initVideoUpload(ctx.dataDir, {
            filename: body.filename,
            mime: body.mime ?? 'video/mp4',
            size: Number(body.size),
          });
          sendJson(res, 200, {
            ok: true,
            ...init,
            ffmpeg: Boolean(resolveFfmpeg()),
          });
        } catch (err) {
          sendJson(res, 400, {
            ok: false,
            error: err instanceof Error ? err.message : String(err),
          });
        }
        return;
      }

      if (method === 'POST' && path === '/assets/video/part') {
        const body = (await readJsonBody(req)) as {
          uploadId?: string;
          index?: number;
          dataBase64?: string;
        };
        try {
          if (!body.uploadId || typeof body.dataBase64 !== 'string') {
            throw new Error('uploadId 与 dataBase64 必填');
          }
          writeVideoPart(body.uploadId, Number(body.index), body.dataBase64);
          sendJson(res, 200, { ok: true });
        } catch (err) {
          sendJson(res, 400, {
            ok: false,
            error: err instanceof Error ? err.message : String(err),
          });
        }
        return;
      }

      if (method === 'POST' && path === '/assets/video/finish') {
        const body = (await readJsonBody(req)) as { uploadId?: string };
        try {
          if (!body.uploadId) {
            throw new Error('uploadId 必填');
          }
          const saved = await finishVideoUpload(ctx.dataDir, body.uploadId);
          sendJson(res, 201, {
            ok: true,
            path: saved.path,
            filename: saved.filename,
            url: `/assets/${encodeURIComponent(saved.filename)}`,
          });
        } catch (err) {
          sendJson(res, 400, {
            ok: false,
            error: err instanceof Error ? err.message : String(err),
          });
        }
        return;
      }

      if (method === 'POST' && path === '/assets/video/cover') {
        const body = (await readJsonBody(req)) as {
          videoPath?: string;
          videoFilename?: string;
        };
        try {
          let videoAbs = body.videoPath?.trim() || '';
          if (!videoAbs && body.videoFilename) {
            videoAbs =
              resolveAssetFile(ctx.dataDir, body.videoFilename) || '';
          }
          if (!videoAbs) {
            throw new Error('videoPath 或 videoFilename 必填');
          }
          const cover = extractVideoCover(ctx.dataDir, videoAbs);
          sendJson(res, 201, {
            ok: true,
            path: cover.path,
            filename: cover.filename,
            url: `/assets/${encodeURIComponent(cover.filename)}`,
            ffmpeg: true,
          });
        } catch (err) {
          sendJson(res, 400, {
            ok: false,
            error: err instanceof Error ? err.message : String(err),
            ffmpeg: Boolean(resolveFfmpeg()),
          });
        }
        return;
      }

      // 3d. 素材：读取（预览；可用 ?token=）
      const assetGet = /^\/assets\/([^/]+)$/.exec(path);
      if (method === 'GET' && assetGet) {
        const filename = decodeURIComponent(assetGet[1]);
        const abs = resolveAssetFile(ctx.dataDir, filename);
        if (!abs) {
          sendJson(res, 404, { ok: false, error: 'not_found' });
          return;
        }
        const ext = extname(filename).toLowerCase();
        const ctype =
          ext === '.png'
            ? 'image/png'
            : ext === '.jpg' || ext === '.jpeg'
              ? 'image/jpeg'
              : ext === '.gif'
                ? 'image/gif'
                : ext === '.webp'
                  ? 'image/webp'
                  : ext === '.mp4'
                    ? 'video/mp4'
                    : ext === '.mov'
                      ? 'video/quicktime'
                      : ext === '.webm'
                        ? 'video/webm'
                        : ext === '.mkv'
                          ? 'video/x-matroska'
                          : ext === '.avi'
                            ? 'video/x-msvideo'
                            : ext === '.flv'
                              ? 'video/x-flv'
                              : 'application/octet-stream';
        res.writeHead(200, {
          'Content-Type': ctype,
          'Cache-Control': 'private, max-age=3600',
        });
        createReadStream(abs).pipe(res);
        return;
      }

      // 3d. 失败截图：/screenshots/:taskId/:file（仅 logs/screenshots）
      const shotGet = /^\/screenshots\/([^/]+)\/([^/]+)$/.exec(path);
      if (method === 'GET' && shotGet) {
        const taskId = decodeURIComponent(shotGet[1]);
        const filename = decodeURIComponent(shotGet[2]);
        const abs = resolveScreenshotFile(ctx.dataDir, taskId, filename);
        if (!abs) {
          sendJson(res, 404, { ok: false, error: 'not_found' });
          return;
        }
        res.writeHead(200, {
          'Content-Type': 'image/png',
          'Cache-Control': 'private, max-age=3600',
        });
        createReadStream(abs).pipe(res);
        return;
      }

      // 4. 内容库
      if (await handleContents(ctx, req, res, method, path)) {
        return;
      }

      // 5. 发布（SSE）
      if (method === 'POST' && path === '/publish') {
        await handlePublish(ctx, req, res);
        return;
      }

      // 6. 发布记录
      if (method === 'GET' && path === '/records') {
        const limitRaw = url.searchParams.get('limit');
        const limit = limitRaw ? Number(limitRaw) : 50;
        const pluginId = url.searchParams.get('plugin') ?? undefined;
        const failedRaw = url.searchParams.get('failed');
        let failedOnly: boolean | undefined;
        if (failedRaw === '1' || failedRaw === 'true') {
          failedOnly = true;
        } else if (failedRaw === '0' || failedRaw === 'false') {
          failedOnly = false;
        }
        sendJson(res, 200, {
          ok: true,
          dataDir: ctx.dataDir,
          records: listRecords(ctx.db, {
            limit: Number.isFinite(limit) ? limit : 50,
            pluginId,
            failedOnly,
          }),
        });
        return;
      }

      // 6b. 设置摘要
      if (method === 'GET' && path === '/settings') {
        const userCfg = readUserConfig();
        const imageHost = resolveImageHostConfig(userCfg.imageHost);
        sendJson(res, 200, {
          ok: true,
          settings: {
            dataDir: ctx.dataDir,
            defaultDataDir: getDefaultDataDir(),
            configuredDataDir: userCfg.dataDir ?? null,
            configFile: getUserConfigPath(),
            dbPath: `${ctx.dataDir}/db/seedcast.sqlite`,
            profilesDir: `${ctx.dataDir}/profiles`,
            assetsDir: `${ctx.dataDir}/assets`,
            pluginsDir: `${ctx.dataDir}/plugins`,
            telemetry: false,
            imageHost: imageHostPublicSummary(imageHost),
            ffmpegAvailable: Boolean(resolveFfmpeg()),
            note:
              '默认零遥测；数据仅存本机。修改数据目录后需重启引擎；图床配置即时生效。',
          },
        });
        return;
      }

      if (method === 'PUT' && path === '/settings') {
        const body = (await readJsonBody(req)) as {
          dataDir?: string;
          imageHost?: Partial<ImageHostConfig>;
        };
        if (body.dataDir === undefined && body.imageHost === undefined) {
          sendJson(res, 400, {
            ok: false,
            error: '请提供 dataDir 和/或 imageHost',
          });
          return;
        }
        const patch: {
          dataDir?: string;
          imageHost?: Partial<ImageHostConfig>;
        } = {};
        if (typeof body.dataDir === 'string') {
          patch.dataDir = body.dataDir;
        }
        if (body.imageHost && typeof body.imageHost === 'object') {
          patch.imageHost = body.imageHost;
        }
        const next = writeUserConfig(patch);
        const imageHost = resolveImageHostConfig(next.imageHost);
        sendJson(res, 200, {
          ok: true,
          settings: {
            configuredDataDir: next.dataDir ?? null,
            configFile: getUserConfigPath(),
            activeDataDir: ctx.dataDir,
            needsRestart: typeof body.dataDir === 'string',
            imageHost: imageHostPublicSummary(imageHost),
            note:
              typeof body.dataDir === 'string'
                ? '已写入配置。数据目录变更需重启引擎；图床配置即时生效。'
                : '图床配置已保存，即时生效。',
          },
        });
        return;
      }

      // 6b2. 安装本地第三方插件（需 confirmRisk）
      if (method === 'POST' && path === '/plugins/install') {
        const body = (await readJsonBody(req)) as {
          sourcePath?: string;
          confirmRisk?: boolean;
          overwrite?: boolean;
        };
        if (!body.confirmRisk) {
          sendJson(res, 400, {
            ok: false,
            error: 'missing_confirm',
            risk: PLUGIN_INSTALL_RISK,
            message: '请确认风险后设置 confirmRisk: true',
          });
          return;
        }
        if (!body.sourcePath || typeof body.sourcePath !== 'string') {
          sendJson(res, 400, { ok: false, error: 'sourcePath 必填' });
          return;
        }
        try {
          const installed = installLocalPlugin({
            dataDir: ctx.dataDir,
            sourcePath: body.sourcePath,
            overwrite: body.overwrite === true,
          });
          ctx.pluginResult = loadAllPlugins({ dataDir: ctx.dataDir });
          sendJson(res, 201, {
            ok: true,
            risk: PLUGIN_INSTALL_RISK,
            installed,
            plugins: ctx.pluginResult.plugins.map((p) => {
              return p.manifest.id;
            }),
          });
        } catch (err) {
          sendJson(res, 400, {
            ok: false,
            error: err instanceof Error ? err.message : String(err),
          });
        }
        return;
      }

      // 6c. 发布配置模板（FR-G7）
      if (await handleSettingTemplates(ctx, req, res, method, path, url)) {
        return;
      }

      // 7. 账号与会话
      if (await handleAccounts(ctx, req, res, method, path, url)) {
        return;
      }

      sendJson(res, 404, { ok: false, error: 'not_found' });
    })().catch((err: unknown) => {
      if (!res.headersSent) {
        sendJson(res, 500, {
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        });
      } else {
        res.end();
      }
    });
  });

  const port = await new Promise<number>((resolve, reject) => {
    server.once('error', reject);
    server.listen(preferredPort, '127.0.0.1', () => {
      const addr = server.address();
      if (!addr || typeof addr === 'string') {
        reject(new Error('无法获取监听端口'));
        return;
      }
      resolve(addr.port);
    });
  });

  return {
    server,
    port,
    close: () => {
      return new Promise((resolve, reject) => {
        server.close((err) => {
          if (err) {
            reject(err);
            return;
          }
          resolve();
        });
      });
    },
  };
}
