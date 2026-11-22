/**
 * 本地引擎 HTTP 客户端
 *
 * @author Seedcast
 * @date 2026-11-21
 */

import type { JsonSchemaLite } from './SchemaForm';

export interface EngineMeta {
  host: string;
  port: number;
  token: string;
  pid: number;
  startedAt: string;
}

export interface PublishTypeOption {
  id: string;
  label: string;
}

export interface PluginItem {
  id: string;
  name: string;
  version: string;
  apiVersion: number;
  adapter: string;
  contentTypes: string[];
  source: string;
  enabled: boolean;
  dir: string;
  capabilities?: {
    draft?: boolean;
    nativeSchedule?: boolean;
    publishTypes?: PublishTypeOption[];
    articleImportModes?: PublishTypeOption[];
  } | null;
  /** 插件 schema.json */
  schema?: JsonSchemaLite | null;
}

export type ContentType = 'article' | 'imageText' | 'video' | 'audio';

export interface ContentItem {
  id: string;
  contentType?: ContentType;
  title: string;
  markdown: string;
  assets: string[];
  createdAt: string;
  updatedAt: string;
}

export interface AccountItem {
  id: string;
  pluginId: string;
  name: string;
  profileDir: string;
  lastCheckAt: string | null;
  status: 'unknown' | 'logged_in' | 'expired';
}

export interface ProgressEvent {
  type: 'info' | 'success' | 'error' | 'finish';
  taskId: string;
  targetIndex?: number;
  message?: string;
  data?: unknown;
}

export interface PublishTargetDto {
  pluginId: string;
  accountId: string;
  settings: Record<string, unknown>;
}

export interface ReceiptItem {
  taskId: string;
  target: PublishTargetDto;
  ok: boolean;
  url?: string;
  error?: {
    code?: string;
    message?: string;
    step?: string;
    selector?: string;
    screenshot?: string;
  };
  at: string;
}

export interface RecordItem {
  task: {
    id: string;
    contentId: string;
    targets: PublishTargetDto[];
    status: string;
    createdAt: string;
  };
  receipts: ReceiptItem[];
  contentTitle: string | null;
}

export type ImageHostProvider = 'litterbox' | 'smms' | 'imgbb' | 's3';

export interface ImageHostSettings {
  enabled?: boolean;
  provider: ImageHostProvider;
  litterboxTime?: '1h' | '12h' | '24h' | '72h';
  hasSmmsToken?: boolean;
  hasImgbbKey?: boolean;
  s3Endpoint?: string;
  s3Region?: string;
  s3Bucket?: string;
  s3Prefix?: string;
  s3CustomDomain?: string;
  hasS3AccessKeyId?: boolean;
  hasS3SecretAccessKey?: boolean;
  hasS3SessionToken?: boolean;
  s3ForcePathStyle?: boolean;
}

export interface ImageHostPatch {
  enabled?: boolean;
  provider?: ImageHostProvider;
  litterboxTime?: '1h' | '12h' | '24h' | '72h';
  smmsToken?: string;
  imgbbKey?: string;
  s3Endpoint?: string;
  s3Region?: string;
  s3Bucket?: string;
  s3Prefix?: string;
  s3CustomDomain?: string;
  s3AccessKeyId?: string;
  s3SecretAccessKey?: string;
  s3SessionToken?: string;
  s3ForcePathStyle?: boolean;
}

export interface SettingsInfo {
  dataDir: string;
  defaultDataDir?: string;
  configuredDataDir?: string | null;
  configFile?: string;
  dbPath: string;
  profilesDir: string;
  assetsDir: string;
  pluginsDir: string;
  telemetry: boolean;
  imageHost?: ImageHostSettings;
  ffmpegAvailable?: boolean;
  note: string;
}

export interface SettingTemplateItem {
  id: string;
  pluginId: string;
  name: string;
  settings: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

/**
 * 是否运行在 Tauri WebView
 *
 * @returns 是否 Tauri
 */
export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

/**
 * 从 Vite 开发中间件读取本机 engine.json
 *
 * @returns 元信息
 * @author Seedcast
 * @date 2026-11-21
 */
export async function fetchLocalEngineMeta(): Promise<EngineMeta> {
  // 1. Tauri：壳负责拉起引擎
  if (isTauri()) {
    const { invoke } = await import('@tauri-apps/api/core');
    const meta = await invoke<EngineMeta>('ensure_engine');
    return {
      host: meta.host,
      port: meta.port,
      token: meta.token,
      pid: meta.pid,
      startedAt: meta.startedAt,
    };
  }

  // 2. 浏览器开发模式：Vite 中间件读文件
  const res = await fetch('/__seedcast/engine-meta');
  const data = (await res.json()) as {
    ok: boolean;
    meta?: EngineMeta;
    error?: string;
  };
  if (!res.ok || !data.ok || !data.meta) {
    throw new Error(data.error ?? '无法读取 engine.json，请先启动引擎');
  }
  return data.meta;
}

/**
 * 引擎 API 封装
 */
export class EngineClient {
  /**
   * @param meta 引擎元信息
   */
  constructor(private readonly meta: EngineMeta) {}

  /**
   * 基础 URL
   *
   * @returns http://127.0.0.1:port
   */
  get baseUrl(): string {
    return `http://${this.meta.host}:${this.meta.port}`;
  }

  /**
   * 素材预览 URL（带 token）
   *
   * @param filename assets 下文件名
   * @returns 完整 URL
   */
  assetUrl(filename: string): string {
    return `${this.baseUrl}/assets/${encodeURIComponent(filename)}?token=${encodeURIComponent(this.meta.token)}`;
  }

  /**
   * 失败截图预览 URL（从本机绝对路径解析 taskId/文件名）
   *
   * @param absPath 引擎写入的截图绝对路径
   * @returns URL；无法解析时返回 null
   */
  screenshotUrlFromPath(absPath: string): string | null {
    const norm = absPath.replace(/\\/g, '/');
    const m = /\/logs\/screenshots\/([^/]+)\/(step-\d+\.png)$/i.exec(norm);
    if (!m) {
      return null;
    }
    return `${this.baseUrl}/screenshots/${encodeURIComponent(m[1])}/${encodeURIComponent(m[2])}?token=${encodeURIComponent(this.meta.token)}`;
  }

  /**
   * 带 Token 的 JSON 请求
   *
   * @param path 路径
   * @param init fetch 选项
   * @returns JSON
   */
  async json<T>(path: string, init?: RequestInit): Promise<T> {
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}${path}`, {
        ...init,
        headers: {
          Authorization: this.meta.token,
          'Content-Type': 'application/json',
          ...(init?.headers ?? {}),
        },
      });
    } catch (err) {
      if (init?.signal?.aborted) {
        throw new DOMException('登录已取消', 'AbortError');
      }
      const tip = err instanceof Error ? err.message : String(err);
      throw new Error(
        `无法连接引擎 ${this.meta.host}:${this.meta.port}（${tip}）。请点右上角「重新连接」`,
      );
    }
    if (init?.signal?.aborted) {
      throw new DOMException('登录已取消', 'AbortError');
    }
    const text = await res.text();
    let data: T & { ok?: boolean; error?: string };
    try {
      data = JSON.parse(text) as T & { ok?: boolean; error?: string };
    } catch {
      throw new Error(
        `引擎返回非 JSON（HTTP ${res.status}）: ${text.slice(0, 160)}`,
      );
    }
    if (!res.ok) {
      throw new Error(
        (data as { error?: string }).error ?? `HTTP ${res.status}`,
      );
    }
    return data;
  }

  /**
   * 健康检查
   *
   * @returns ping 结果
   */
  ping(): Promise<{
    ok: boolean;
    apiVersion: number;
    schemaVersion: number;
    dataDir?: string;
  }> {
    return this.json('/ping');
  }

  /**
   * 读取设置
   *
   * @returns 设置信息
   */
  settings(): Promise<{ ok: boolean; settings: SettingsInfo }> {
    return this.json('/settings');
  }

  /**
   * 更新设置（数据目录 / 图床）
   *
   * @param patch 补丁
   * @returns 结果
   */
  updateSettings(patch: {
    dataDir?: string;
    imageHost?: ImageHostPatch;
  }): Promise<{
    ok: boolean;
    settings: {
      configuredDataDir: string | null;
      configFile: string;
      activeDataDir: string;
      needsRestart: boolean;
      imageHost?: ImageHostSettings;
      note: string;
    };
  }> {
    return this.json('/settings', {
      method: 'PUT',
      body: JSON.stringify(patch),
    });
  }

  /**
   * 安装本地第三方插件（必须确认风险）
   *
   * @param input 源路径与确认
   * @returns 安装结果
   */
  installPlugin(input: {
    sourcePath: string;
    confirmRisk: boolean;
    overwrite?: boolean;
  }): Promise<{
    ok: boolean;
    risk?: string;
    installed?: {
      pluginId: string;
      name: string;
      version: string;
      targetDir: string;
      overwritten: boolean;
    };
    plugins?: string[];
  }> {
    return this.json('/plugins/install', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  /**
   * 插件列表
   *
   * @returns 插件
   */
  plugins(): Promise<{ ok: boolean; plugins: PluginItem[] }> {
    return this.json('/plugins');
  }

  /**
   * 账号列表
   *
   * @param plugin 可选插件过滤
   * @returns 账号
   */
  accounts(
    plugin?: string,
  ): Promise<{ ok: boolean; accounts: AccountItem[] }> {
    const q = plugin ? `?plugin=${encodeURIComponent(plugin)}` : '';
    return this.json(`/accounts${q}`);
  }

  /**
   * 添加账号并打开登录
   *
   * @param input 插件与名称
   * @param signal 可选取消信号（关闭窗口后点「取消登录」）
   * @returns 结果
   */
  loginAccount(
    input: {
      plugin: string;
      name: string;
    },
    signal?: AbortSignal,
  ): Promise<{
    ok: boolean;
    loggedIn: boolean;
    outcome?: string;
    account: AccountItem;
  }> {
    return this.json('/accounts/login', {
      method: 'POST',
      body: JSON.stringify(input),
      signal,
    });
  }

  /**
   * 绑定公众号 AppID/AppSecret
   *
   * @param input 插件、名称与凭证
   * @returns 结果
   */
  bindAccount(input: {
    plugin: string;
    name: string;
    appid: string;
    appsecret: string;
  }): Promise<{
    ok: boolean;
    loggedIn: boolean;
    account: AccountItem;
  }> {
    return this.json('/accounts/bind', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  /**
   * 检测登录态
   *
   * @param plugin 插件 ID
   * @param account 账号 ID
   * @returns 结果
   */
  checkSession(
    plugin: string,
    account: string,
  ): Promise<{
    ok: boolean;
    loggedIn: boolean;
    status: string;
    account: AccountItem;
  }> {
    const q = `?plugin=${encodeURIComponent(plugin)}&account=${encodeURIComponent(account)}`;
    return this.json(`/accounts/session${q}`);
  }

  /**
   * 删除账号
   *
   * @param id 账号 ID
   * @returns 结果
   */
  deleteAccount(id: string): Promise<{ ok: boolean }> {
    return this.json(`/accounts/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  }

  /**
   * 用账号 profile 打开平台页面（人工查看）
   *
   * @param accountId 账号 ID
   * @param url 可选覆盖 URL
   * @returns 打开结果
   */
  openAccount(
    accountId: string,
    url?: string,
  ): Promise<{ ok: boolean; url: string; message?: string }> {
    return this.json('/accounts/open', {
      method: 'POST',
      body: JSON.stringify({ accountId, url }),
    });
  }

  /**
   * 内容列表
   *
   * @returns 内容
   */
  contents(): Promise<{ ok: boolean; contents: ContentItem[] }> {
    return this.json('/contents');
  }

  /**
   * 创建内容
   *
   * @param input 标题与正文
   * @returns 新建内容
   */
  createContent(input: {
    title: string;
    markdown: string;
    assets?: string[];
    contentType?: ContentType;
  }): Promise<{ ok: boolean; content: ContentItem }> {
    return this.json('/contents', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  /**
   * 更新内容
   *
   * @param id 内容 ID
   * @param input 字段
   * @returns 更新后内容
   */
  updateContent(
    id: string,
    input: { title?: string; markdown?: string; assets?: string[] },
  ): Promise<{ ok: boolean; content: ContentItem }> {
    return this.json(`/contents/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(input),
    });
  }

  /**
   * 删除内容
   *
   * @param id 内容 ID
   * @returns 结果
   */
  deleteContent(id: string): Promise<{ ok: boolean }> {
    return this.json(`/contents/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  }

  /**
   * 上传素材（粘贴图）
   *
   * @param input base64 与 mime
   * @returns 路径
   */
  uploadAsset(input: {
    mime: string;
    dataBase64: string;
    filename?: string;
  }): Promise<{ ok: boolean; path: string; filename: string; url: string }> {
    return this.json('/assets', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  /**
   * 本地入库 + 上传到第三方免费图床
   *
   * @param input base64 与 mime
   * @returns 本地路径与公网 URL
   */
  uploadAssetRemote(input: {
    mime: string;
    dataBase64: string;
    filename?: string;
  }): Promise<{
    ok: boolean;
    path: string;
    filename: string;
    url: string;
    remoteUrl: string;
    provider: string;
    note?: string | null;
  }> {
    return this.json('/assets/remote', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  /**
   * 图床连通性测试（可用未保存草稿配置）
   *
   * @param imageHost 草稿覆盖
   * @returns 公网 URL
   */
  testImageHost(imageHost?: ImageHostPatch): Promise<{
    ok: boolean;
    remoteUrl: string;
    provider: string;
    note?: string | null;
  }> {
    return this.json('/assets/remote/test', {
      method: 'POST',
      body: JSON.stringify({ imageHost: imageHost ?? {} }),
    });
  }

  /**
   * 初始化视频分片上传
   *
   * @param input 文件元信息
   * @returns 会话
   */
  initVideoUpload(input: {
    filename: string;
    mime: string;
    size: number;
  }): Promise<{
    ok: boolean;
    uploadId: string;
    partSize: number;
    ffmpeg: boolean;
  }> {
    return this.json('/assets/video/init', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  /**
   * 上传视频分片
   *
   * @param input 分片
   * @returns 结果
   */
  uploadVideoPart(input: {
    uploadId: string;
    index: number;
    dataBase64: string;
  }): Promise<{ ok: boolean }> {
    return this.json('/assets/video/part', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  /**
   * 完成视频分片合并
   *
   * @param uploadId 会话
   * @returns 本地路径
   */
  finishVideoUpload(uploadId: string): Promise<{
    ok: boolean;
    path: string;
    filename: string;
    url: string;
  }> {
    return this.json('/assets/video/finish', {
      method: 'POST',
      body: JSON.stringify({ uploadId }),
    });
  }

  /**
   * ffmpeg 抽取视频封面
   *
   * @param input 视频路径或 assets 文件名
   * @returns 封面
   */
  extractVideoCover(input: {
    videoPath?: string;
    videoFilename?: string;
  }): Promise<{
    ok: boolean;
    path: string;
    filename: string;
    url: string;
    ffmpeg?: boolean;
  }> {
    return this.json('/assets/video/cover', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  /**
   * 分片上传完整视频文件
   *
   * @param file 浏览器 File
   * @param onProgress 进度 0–1
   * @returns 落盘结果
   */
  async uploadVideoFile(
    file: File,
    onProgress?: (ratio: number) => void,
  ): Promise<{ path: string; filename: string; url: string }> {
    const init = await this.initVideoUpload({
      filename: file.name,
      mime: file.type || 'video/mp4',
      size: file.size,
    });
    const partSize = init.partSize || 512 * 1024;
    const totalParts = Math.ceil(file.size / partSize);
    for (let i = 0; i < totalParts; i += 1) {
      const blob = file.slice(i * partSize, (i + 1) * partSize);
      const dataBase64 = await readBlobAsDataUrl(blob);
      await this.uploadVideoPart({
        uploadId: init.uploadId,
        index: i,
        dataBase64,
      });
      onProgress?.((i + 1) / totalParts);
    }
    const done = await this.finishVideoUpload(init.uploadId);
    return {
      path: done.path,
      filename: done.filename,
      url: done.url,
    };
  }

  /**
   * 发布配置模板列表
   *
   * @param plugin 可选插件过滤
   * @returns 模板
   */
  settingTemplates(
    plugin?: string,
  ): Promise<{ ok: boolean; templates: SettingTemplateItem[] }> {
    const q = plugin ? `?plugin=${encodeURIComponent(plugin)}` : '';
    return this.json(`/setting-templates${q}`);
  }

  /**
   * 新建发布配置模板
   *
   * @param input 插件、名称、settings
   * @returns 模板
   */
  createSettingTemplate(input: {
    pluginId: string;
    name: string;
    settings: Record<string, unknown>;
  }): Promise<{ ok: boolean; template: SettingTemplateItem }> {
    return this.json('/setting-templates', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  /**
   * 更新发布配置模板
   *
   * @param id 模板 ID
   * @param input 字段
   * @returns 模板
   */
  updateSettingTemplate(
    id: string,
    input: { name?: string; settings?: Record<string, unknown> },
  ): Promise<{ ok: boolean; template: SettingTemplateItem }> {
    return this.json(`/setting-templates/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(input),
    });
  }

  /**
   * 删除发布配置模板
   *
   * @param id 模板 ID
   * @returns 结果
   */
  deleteSettingTemplate(id: string): Promise<{ ok: boolean }> {
    return this.json(`/setting-templates/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  }

  /**
   * 发布记录
   *
   * @param opts 筛选
   * @returns 记录
   */
  records(opts?: {
    limit?: number;
    plugin?: string;
    failed?: boolean;
  }): Promise<{ ok: boolean; records: RecordItem[] }> {
    const q = new URLSearchParams();
    if (opts?.limit) {
      q.set('limit', String(opts.limit));
    }
    if (opts?.plugin) {
      q.set('plugin', opts.plugin);
    }
    if (opts?.failed === true) {
      q.set('failed', '1');
    } else if (opts?.failed === false) {
      q.set('failed', '0');
    }
    const qs = q.toString();
    return this.json(`/records${qs ? `?${qs}` : ''}`);
  }

  /**
   * SSE 发布
   *
   * @param body 请求体
   * @param onEvent 事件回调
   * @author Seedcast
   * @date 2026-11-21
   */
  async publish(
    body: {
      contentId: string;
      targets: PublishTargetDto[];
    },
    onEvent: (event: ProgressEvent) => void,
  ): Promise<void> {
    const res = await fetch(`${this.baseUrl}/publish`, {
      method: 'POST',
      headers: {
        Authorization: this.meta.token,
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok || !res.body) {
      const text = await res.text();
      throw new Error(text || `发布失败 HTTP ${res.status}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split('\n\n');
      buffer = parts.pop() ?? '';

      for (const part of parts) {
        const lines = part.split('\n');
        let dataLine = '';
        for (const line of lines) {
          if (line.startsWith('data:')) {
            dataLine += line.slice(5).trim();
          }
        }
        if (!dataLine) {
          continue;
        }
        try {
          onEvent(JSON.parse(dataLine) as ProgressEvent);
        } catch {
          // 忽略残缺帧
        }
      }
    }
  }
}

/**
 * Blob → data URL（视频分片上传用）
 *
 * @param blob 分片
 * @returns data URL
 */
function readBlobAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      resolve(String(reader.result ?? ''));
    };
    reader.onerror = () => {
      reject(reader.error ?? new Error('读取分片失败'));
    };
    reader.readAsDataURL(blob);
  });
}
