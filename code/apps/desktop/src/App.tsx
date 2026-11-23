/**
 * Seedcast GUI：左侧导航工作台（内容 / 发布 / 记录 / 账号 / 插件 / 设置）
 *
 * @author Seedcast
 * @date 2026-11-21
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  EngineClient,
  fetchLocalEngineMeta,
  type AccountItem,
  type ContentItem,
  type EngineMeta,
  type PluginItem,
  type ProgressEvent,
  type PublishTargetDto,
  type RecordItem,
  type ContentType,
  type ImageHostPatch,
  type ImageHostProvider,
  type SettingTemplateItem,
  type SettingsInfo,
} from './api';
import { ImageTextComposer } from './ImageTextComposer';
import { MarkdownEditor } from './MarkdownEditor';
import { VideoComposer } from './VideoComposer';
import {
  defaultsFromSchema,
  SchemaForm,
  validateSchemaValues,
} from './SchemaForm';

type PageId =
  | 'contents'
  | 'accounts'
  | 'publish'
  | 'records'
  | 'plugins'
  | 'settings';

type AccountsTab = 'overview' | 'manage' | 'templates';

/**
 * 内容素材 → 可播放/预览 URL（本地 assets 文件名或绝对路径或 http）
 *
 * @param client 引擎客户端
 * @param ref 素材引用
 * @returns URL
 */
function resolveMediaSrc(client: EngineClient, ref: string): string {
  if (/^https?:\/\//i.test(ref)) {
    return ref;
  }
  const name = ref.includes('/') || ref.includes('\\')
    ? ref.replace(/^.*[/\\]/, '')
    : ref;
  return client.assetUrl(name);
}

/**
 * 是否可作为小红书发布的本地图片素材
 *
 * @param asset 素材引用
 * @returns 本地图片则 true
 */
function isLocalImageAsset(asset: string): boolean {
  if (!asset || /^https?:\/\//i.test(asset)) {
    return false;
  }
  return /\.(png|jpe?g|webp|gif)$/i.test(asset);
}

/**
 * File → data URL
 *
 * @param file 文件
 * @returns data URL
 */
function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      resolve(String(reader.result ?? ''));
    };
    reader.onerror = () => {
      reject(reader.error ?? new Error('读取文件失败'));
    };
    reader.readAsDataURL(file);
  });
}

/**
 * 从发布进度事件取出可点击的 http(s) 链接
 *
 * @param event SSE 进度事件
 * @returns URL 或 null
 */
function pickSuccessUrl(event: ProgressEvent): string | null {
  const data = event.data;
  if (data && typeof data === 'object' && 'url' in data) {
    const url = (data as { url?: unknown }).url;
    if (typeof url === 'string' && /^https?:\/\//i.test(url)) {
      return url;
    }
  }
  const msg = event.message?.trim() ?? '';
  if (/^https?:\/\//i.test(msg)) {
    return msg;
  }
  return null;
}

/**
 * 日志行内把 URL 渲成可点击链接
 *
 * @param line 日志文本
 * @param key React key
 * @returns 节点
 */
function renderLogLine(line: string, key: number): ReactNode {
  const parts = line.split(/(https?:\/\/[^\s]+)/g);
  return (
    <div key={key}>
      {parts.map((part, i) => {
        if (/^https?:\/\//i.test(part)) {
          return (
            <a
              key={`${key}-${i}`}
              href={part}
              target="_blank"
              rel="noopener noreferrer"
            >
              {part}
            </a>
          );
        }
        return <span key={`${key}-${i}`}>{part}</span>;
      })}
    </div>
  );
}

/**
 * 清洗 settings：去掉不可见/空字符串字段
 *
 * @param values 表单值
 * @returns 发布用 settings
 */
function compactSettings(
  values: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(values)) {
    if (v === undefined || v === null) {
      continue;
    }
    if (typeof v === 'string' && v.trim() === '') {
      continue;
    }
    out[k] = typeof v === 'string' ? v.trim() : v;
  }
  return out;
}

/**
 * 根组件
 *
 * @returns JSX
 * @author Seedcast
 * @date 2026-11-21
 */
export function App() {
  const [page, setPage] = useState<PageId>('contents');
  const [meta, setMeta] = useState<EngineMeta | null>(null);
  const [status, setStatus] = useState('尚未连接引擎');
  const [error, setError] = useState<string | null>(null);
  /** 应用内确认框（Tauri WebView 下 window.confirm 无效） */
  const [confirmDialog, setConfirmDialog] = useState<{
    title: string;
    message: string;
    confirmLabel?: string;
    onConfirm: () => void;
  } | null>(null);
  const [plugins, setPlugins] = useState<PluginItem[]>([]);
  const [accounts, setAccounts] = useState<AccountItem[]>([]);
  const [contents, setContents] = useState<ContentItem[]>([]);
  const [records, setRecords] = useState<RecordItem[]>([]);
  const [settingsInfo, setSettingsInfo] = useState<SettingsInfo | null>(null);

  const [contentId, setContentId] = useState('');
  const [contentType, setContentType] = useState<ContentType>('article');
  const [title, setTitle] = useState('第一篇 Seedcast');
  const [markdown, setMarkdown] = useState('来自 GUI 的 Markdown 正文');
  const [contentAssets, setContentAssets] = useState<string[]>([]);
  const [savingContent, setSavingContent] = useState(false);
  const [showImageTextComposer, setShowImageTextComposer] = useState(false);
  const [showVideoComposer, setShowVideoComposer] = useState(false);
  const [imageHostEnabled, setImageHostEnabled] = useState(true);
  const [imageHostProvider, setImageHostProvider] =
    useState<ImageHostProvider>('litterbox');
  const [litterboxTime, setLitterboxTime] = useState<
    '1h' | '12h' | '24h' | '72h'
  >('72h');
  const [smmsToken, setSmmsToken] = useState('');
  const [imgbbKey, setImgbbKey] = useState('');
  const [s3Endpoint, setS3Endpoint] = useState('');
  const [s3Region, setS3Region] = useState('us-east-1');
  const [s3Bucket, setS3Bucket] = useState('');
  const [s3Prefix, setS3Prefix] = useState('');
  const [s3CustomDomain, setS3CustomDomain] = useState('');
  const [s3AccessKeyId, setS3AccessKeyId] = useState('');
  const [s3SecretAccessKey, setS3SecretAccessKey] = useState('');
  const [s3SessionToken, setS3SessionToken] = useState('');
  const [s3ForcePathStyle, setS3ForcePathStyle] = useState(false);
  const [testingImageHost, setTestingImageHost] = useState(false);
  /** 图床测试结果（显示在按钮旁，避免顶栏 error 被忽略） */
  const [imageHostTestMsg, setImageHostTestMsg] = useState<{
    ok: boolean;
    text: string;
  } | null>(null);

  const [pluginId, setPluginId] = useState('mock');
  const [accountId, setAccountId] = useState('');
  const [settings, setSettings] = useState<Record<string, unknown>>({});
  const [accountName, setAccountName] = useState('本地测试号');
  const [loginPluginId, setLoginPluginId] = useState('mock');
  const [wechatAppId, setWechatAppId] = useState('');
  const [wechatAppSecret, setWechatAppSecret] = useState('');
  const [xApiKey, setXApiKey] = useState('');
  const [xApiSecret, setXApiSecret] = useState('');
  const [xAccessToken, setXAccessToken] = useState('');
  const [xAccessTokenSecret, setXAccessTokenSecret] = useState('');
  const [ytClientId, setYtClientId] = useState('');
  const [ytClientSecret, setYtClientSecret] = useState('');
  const [ytRefreshToken, setYtRefreshToken] = useState('');

  const [logs, setLogs] = useState<string[]>([]);
  const [resultLinks, setResultLinks] = useState<string[]>([]);
  const [publishing, setPublishing] = useState(false);
  const [xhsUploading, setXhsUploading] = useState(false);
  const xhsFileRef = useRef<HTMLInputElement | null>(null);
  const [loggingIn, setLoggingIn] = useState(false);
  const [binding, setBinding] = useState(false);
  const [loginAbort, setLoginAbort] = useState<AbortController | null>(null);

  const [recordPluginFilter, setRecordPluginFilter] = useState('');
  const [recordFailedOnly, setRecordFailedOnly] = useState(false);

  const [contentFilter, setContentFilter] = useState<
    'all' | 'draft' | 'published'
  >('all');

  const [accountsTab, setAccountsTab] = useState<AccountsTab>('overview');
  const [templates, setTemplates] = useState<SettingTemplateItem[]>([]);
  const [templateName, setTemplateName] = useState('默认配置');
  const [templatePluginId, setTemplatePluginId] = useState('mock');
  const [templateSettings, setTemplateSettings] = useState<
    Record<string, unknown>
  >({});
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [pluginSourcePath, setPluginSourcePath] = useState('');
  const [pluginRiskAck, setPluginRiskAck] = useState(false);
  const [installingPlugin, setInstallingPlugin] = useState(false);
  const [dataDirInput, setDataDirInput] = useState('');
  const [savingSettings, setSavingSettings] = useState(false);

  const client = useMemo(() => {
    return meta ? new EngineClient(meta) : null;
  }, [meta]);

  /**
   * 组装当前图床表单补丁（密钥留空表示不改）
   *
   * @returns 补丁
   */
  const buildImageHostPatch = useCallback((): ImageHostPatch => {
    const patch: ImageHostPatch = {
      enabled: imageHostEnabled,
      provider: imageHostProvider,
      litterboxTime,
      s3Endpoint: s3Endpoint.trim(),
      s3Region: s3Region.trim() || 'us-east-1',
      s3Bucket: s3Bucket.trim(),
      s3Prefix: s3Prefix.trim(),
      s3CustomDomain: s3CustomDomain.trim(),
      s3ForcePathStyle,
    };
    if (smmsToken.trim()) {
      patch.smmsToken = smmsToken.trim();
    }
    if (imgbbKey.trim()) {
      patch.imgbbKey = imgbbKey.trim();
    }
    if (s3AccessKeyId.trim()) {
      patch.s3AccessKeyId = s3AccessKeyId.trim();
    }
    if (s3SecretAccessKey.trim()) {
      patch.s3SecretAccessKey = s3SecretAccessKey.trim();
    }
    if (s3SessionToken.trim()) {
      patch.s3SessionToken = s3SessionToken.trim();
    }
    return patch;
  }, [
    imageHostEnabled,
    imageHostProvider,
    litterboxTime,
    smmsToken,
    imgbbKey,
    s3Endpoint,
    s3Region,
    s3Bucket,
    s3Prefix,
    s3CustomDomain,
    s3AccessKeyId,
    s3SecretAccessKey,
    s3SessionToken,
    s3ForcePathStyle,
  ]);

  const selectedPlugin = useMemo(() => {
    return plugins.find((p) => {
      return p.id === pluginId;
    });
  }, [plugins, pluginId]);

  const loginIsWechat = loginPluginId === 'wechat-mp';
  const loginIsX = loginPluginId === 'x';
  const loginIsYouTube = loginPluginId === 'youtube';
  const loginIsCredentialBind =
    loginIsWechat || loginIsX || loginIsYouTube;
  const publishIsWechat = pluginId === 'wechat-mp';
  const isCredentialPlugin = (id: string): boolean => {
    return id === 'wechat-mp' || id === 'x' || id === 'youtube';
  };

  const templatePlugin = useMemo(() => {
    return plugins.find((p) => {
      return p.id === templatePluginId;
    });
  }, [plugins, templatePluginId]);

  /** 至少有一次发布成功的内容 ID */
  const publishedContentIds = useMemo(() => {
    const ids = new Set<string>();
    for (const rec of records) {
      if (
        rec.receipts.some((r) => {
          return r.ok;
        })
      ) {
        ids.add(rec.task.contentId);
      }
    }
    return ids;
  }, [records]);

  const filteredContents = useMemo(() => {
    if (contentFilter === 'all') {
      return contents;
    }
    if (contentFilter === 'published') {
      return contents.filter((c) => {
        return publishedContentIds.has(c.id);
      });
    }
    return contents.filter((c) => {
      return !publishedContentIds.has(c.id);
    });
  }, [contentFilter, contents, publishedContentIds]);

  /**
   * 刷新账号列表
   *
   * @param c 客户端
   */
  const refreshAccounts = useCallback(async (c: EngineClient) => {
    const accountRes = await c.accounts();
    setAccounts(accountRes.accounts);
    if (accountRes.accounts[0]) {
      setAccountId((prev) => {
        return prev || accountRes.accounts[0].id;
      });
    }
  }, []);

  /**
   * 刷新发布配置模板
   *
   * @param c 客户端
   * @param plugin 可选插件过滤
   */
  const refreshTemplates = useCallback(
    async (c: EngineClient, plugin?: string) => {
      const res = await c.settingTemplates(plugin);
      setTemplates(res.templates);
    },
    [],
  );

  /**
   * 刷新发布记录
   *
   * @param c 客户端
   */
  const refreshRecords = useCallback(
    async (c: EngineClient) => {
      const res = await c.records({
        limit: 50,
        plugin: recordPluginFilter || undefined,
        failed: recordFailedOnly ? true : undefined,
      });
      setRecords(res.records);
    },
    [recordFailedOnly, recordPluginFilter],
  );

  /**
   * 连接本机引擎
   */
  const connect = useCallback(async () => {
    setError(null);
    try {
      const nextMeta = await fetchLocalEngineMeta();
      const nextClient = new EngineClient(nextMeta);
      const ping = await nextClient.ping();
      setMeta(nextMeta);
      setStatus(
        `已连接 · api v${ping.apiVersion} · schema v${ping.schemaVersion} · :${nextMeta.port}`,
      );
      const [pluginRes, contentRes, settingsRes] = await Promise.all([
        nextClient.plugins(),
        nextClient.contents(),
        nextClient.settings().catch(() => {
          return null;
        }),
      ]);
      setPlugins(pluginRes.plugins);
      setContents(contentRes.contents);
      if (settingsRes?.settings) {
        setSettingsInfo(settingsRes.settings);
        setDataDirInput(
          settingsRes.settings.configuredDataDir ||
            settingsRes.settings.dataDir ||
            '',
        );
        if (settingsRes.settings.imageHost) {
          const ih = settingsRes.settings.imageHost;
          setImageHostEnabled(ih.enabled !== false);
          setImageHostProvider(ih.provider);
          setLitterboxTime(ih.litterboxTime ?? '72h');
          setS3Endpoint(ih.s3Endpoint ?? '');
          setS3Region(ih.s3Region || 'us-east-1');
          setS3Bucket(ih.s3Bucket ?? '');
          setS3Prefix(ih.s3Prefix ?? '');
          setS3CustomDomain(ih.s3CustomDomain ?? '');
          setS3ForcePathStyle(Boolean(ih.s3ForcePathStyle));
        }
      }
      if (contentRes.contents[0]) {
        const first = contentRes.contents[0];
        setContentId(first.id);
        setContentType(first.contentType ?? 'article');
        setTitle(first.title);
        setMarkdown(first.markdown);
        setContentAssets(first.assets ?? []);
      }
      if (pluginRes.plugins[0]) {
        const p0 = pluginRes.plugins[0];
        setPluginId(p0.id);
        setLoginPluginId(p0.id);
        setTemplatePluginId(p0.id);
        setSettings(defaultsFromSchema(p0.schema));
        setTemplateSettings(defaultsFromSchema(p0.schema));
      }
      await refreshAccounts(nextClient);
      await refreshTemplates(nextClient);
      const rec = await nextClient.records({ limit: 50 });
      setRecords(rec.records);
    } catch (err) {
      setMeta(null);
      const msg = err instanceof Error ? err.message : String(err);
      let tip = msg;
      if (msg === 'not_found') {
        tip =
          '接口不存在（not_found）：引擎可能是旧进程，请重启引擎后点「重新连接」';
      } else if (/load failed/i.test(msg) || /failed to fetch/i.test(msg)) {
        tip =
          '无法访问本机引擎（Load failed）。请确认引擎已启动，或安装含 CORS 修复的新版后点「重新连接」';
      }
      setError(tip);
      setStatus('连接失败');
    }
  }, [refreshAccounts, refreshTemplates]);

  useEffect(() => {
    void connect();
  }, [connect]);

  useEffect(() => {
    if (!client || page !== 'records') {
      return;
    }
    void refreshRecords(client).catch((err: unknown) => {
      setError(err instanceof Error ? err.message : String(err));
    });
  }, [client, page, refreshRecords]);

  useEffect(() => {
    if (!client || page !== 'accounts') {
      return;
    }
    void refreshTemplates(client).catch((err: unknown) => {
      setError(err instanceof Error ? err.message : String(err));
    });
  }, [client, page, refreshTemplates]);

  /**
   * 小红书：按内容类型推断发布形式（文章→长文，图文→图文笔记）
   *
   * @param base schema 默认 settings
   * @param type 内容类型
   * @returns 合并后的 settings
   */
  const withXhsPublishTypeHint = (
    base: Record<string, unknown>,
    type: ContentType,
  ): Record<string, unknown> => {
    return {
      ...base,
      publishType: type === 'article' ? 'article' : 'imageText',
    };
  };

  /**
   * 切换目标插件时重置 schema 默认值，并尽量保留同名账号
   *
   * @param nextId 插件 ID
   */
  const onChangePlugin = (nextId: string): void => {
    setPluginId(nextId);
    const next = plugins.find((p) => {
      return p.id === nextId;
    });
    let nextSettings = defaultsFromSchema(next?.schema);
    if (nextId === 'xiaohongshu') {
      nextSettings = withXhsPublishTypeHint(nextSettings, contentType);
    }
    setSettings(nextSettings);
    const match = accounts.find((a) => {
      return a.pluginId === nextId;
    });
    setAccountId(match?.id ?? '');
  };

  /**
   * 从内容库选中一篇
   *
   * @param id 内容 ID
   */
  const selectContent = (id: string): void => {
    const item = contents.find((c) => {
      return c.id === id;
    });
    if (!item) {
      return;
    }
    const nextType = item.contentType ?? 'article';
    setContentId(item.id);
    setContentType(nextType);
    setTitle(item.title);
    setMarkdown(item.markdown);
    setContentAssets(item.assets ?? []);
    setShowImageTextComposer(false);
    setShowVideoComposer(false);
    if (pluginId === 'xiaohongshu') {
      setSettings((prev) => {
        return withXhsPublishTypeHint(prev, nextType);
      });
    }
  };

  /**
   * 新建空白文章（本地草稿，未保存）
   */
  const onNewContent = (): void => {
    setContentId('');
    setContentType('article');
    setTitle('未命名');
    setMarkdown('');
    setContentAssets([]);
    setShowImageTextComposer(false);
    setShowVideoComposer(false);
  };

  /**
   * 打开新建图文表单
   */
  const onNewImageText = (): void => {
    setShowVideoComposer(false);
    setShowImageTextComposer(true);
    setPage('contents');
  };

  /**
   * 打开新建视频表单
   */
  const onNewVideo = (): void => {
    setShowImageTextComposer(false);
    setShowVideoComposer(true);
    setPage('contents');
  };

  /**
   * 保存内容（新建或更新）
   */
  const onSaveContent = async (): Promise<void> => {
    if (!client) {
      return;
    }
    if (!title.trim()) {
      setError('标题不能为空');
      return;
    }
    setSavingContent(true);
    setError(null);
    try {
      if (contentId) {
        const res = await client.updateContent(contentId, {
          title: title.trim(),
          markdown,
          assets: contentAssets,
        });
        setContents((prev) => {
          return prev.map((c) => {
            return c.id === res.content.id ? res.content : c;
          });
        });
        setContentId(res.content.id);
      } else {
        const res = await client.createContent({
          title: title.trim(),
          markdown,
          assets: contentAssets,
        });
        setContents((prev) => {
          return [res.content, ...prev];
        });
        setContentId(res.content.id);
      }
      setStatus('内容已保存');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSavingContent(false);
    }
  };

  /**
   * 弹出应用内确认（替代 window.confirm）
   *
   * @param input 文案与回调
   */
  const askConfirm = (input: {
    title: string;
    message: string;
    confirmLabel?: string;
    onConfirm: () => void | Promise<void>;
  }): void => {
    setConfirmDialog({
      title: input.title,
      message: input.message,
      confirmLabel: input.confirmLabel,
      onConfirm: () => {
        void input.onConfirm();
      },
    });
  };

  /**
   * 删除当前内容
   */
  const onDeleteContent = (): void => {
    if (!client || !contentId) {
      return;
    }
    const id = contentId;
    askConfirm({
      title: '删除内容',
      message: '确定删除这篇内容？此操作不可恢复。',
      confirmLabel: '删除',
      onConfirm: async () => {
        setError(null);
        try {
          await client.deleteContent(id);
          const list = await client.contents();
          setContents(list.contents);
          if (list.contents[0]) {
            selectContent(list.contents[0].id);
          } else {
            onNewContent();
          }
          setStatus('内容已删除');
        } catch (err) {
          setError(err instanceof Error ? err.message : String(err));
        }
      },
    });
  };

  /**
   * 取消登录
   */
  const onCancelLogin = (): void => {
    loginAbort?.abort();
    setLoginAbort(null);
    setLoggingIn(false);
    setError('已取消登录。若已关闭浏览器，可再次添加登录或检测/删除账号。');
    if (client) {
      void refreshAccounts(client);
    }
  };

  /**
   * 浏览器扫码登录
   */
  const onLogin = async (): Promise<void> => {
    if (!client || loggingIn || loginIsWechat) {
      return;
    }
    const ac = new AbortController();
    setLoginAbort(ac);
    setLoggingIn(true);
    setError(null);
    try {
      const result = await client.loginAccount(
        {
          plugin: loginPluginId,
          name: accountName,
        },
        ac.signal,
      );
      await refreshAccounts(client);
      setAccountId(result.account.id);
      if (!result.loggedIn) {
        const tip =
          result.outcome === 'browser_closed'
            ? '检测到登录窗口已关闭，请重新「添加并登录」'
            : result.outcome === 'cancelled'
              ? '登录已取消'
              : '登录超时或未检测到登录态，请重试扫码';
        setError(tip);
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        setError('已取消登录');
      } else {
        setError(err instanceof Error ? err.message : String(err));
      }
      if (client) {
        await refreshAccounts(client);
      }
    } finally {
      setLoginAbort(null);
      setLoggingIn(false);
    }
  };

  /**
   * 绑定官方 API 凭证（公众号 / X / YouTube）
   */
  const onBindCredentials = async (): Promise<void> => {
    if (!client || binding) {
      return;
    }
    setBinding(true);
    setError(null);
    try {
      let result: {
        ok: boolean;
        loggedIn: boolean;
        account: { id: string };
      };
      if (loginIsWechat) {
        if (!wechatAppId.trim() || !wechatAppSecret.trim()) {
          setError('请填写 AppID 与 AppSecret');
          setBinding(false);
          return;
        }
        result = await client.bindAccount({
          plugin: 'wechat-mp',
          name: accountName,
          appid: wechatAppId.trim(),
          appsecret: wechatAppSecret.trim(),
        });
        setWechatAppSecret('');
      } else if (loginIsX) {
        if (
          !xApiKey.trim() ||
          !xApiSecret.trim() ||
          !xAccessToken.trim() ||
          !xAccessTokenSecret.trim()
        ) {
          setError('请填写完整的 X API Key / Secret 与 Access Token');
          setBinding(false);
          return;
        }
        result = await client.bindAccount({
          plugin: 'x',
          name: accountName,
          apiKey: xApiKey.trim(),
          apiSecret: xApiSecret.trim(),
          accessToken: xAccessToken.trim(),
          accessTokenSecret: xAccessTokenSecret.trim(),
        });
        setXApiSecret('');
        setXAccessTokenSecret('');
      } else if (loginIsYouTube) {
        if (
          !ytClientId.trim() ||
          !ytClientSecret.trim() ||
          !ytRefreshToken.trim()
        ) {
          setError('请填写 Client ID / Client Secret / Refresh Token');
          setBinding(false);
          return;
        }
        result = await client.bindAccount({
          plugin: 'youtube',
          name: accountName,
          clientId: ytClientId.trim(),
          clientSecret: ytClientSecret.trim(),
          refreshToken: ytRefreshToken.trim(),
        });
        setYtClientSecret('');
        setYtRefreshToken('');
      } else {
        setError('当前插件不支持凭证绑定');
        setBinding(false);
        return;
      }
      await refreshAccounts(client);
      setAccountId(result.account.id);
      if (!result.loggedIn) {
        setError('凭证已保存但校验未通过');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      if (client) {
        await refreshAccounts(client);
      }
    } finally {
      setBinding(false);
    }
  };

  /**
   * 检测登录态
   *
   * @param account 账号
   */
  const onCheckSession = async (account: AccountItem): Promise<void> => {
    if (!client) {
      return;
    }
    setError(null);
    try {
      await client.checkSession(account.pluginId, account.id);
      await refreshAccounts(client);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  /**
   * 删除账号
   *
   * @param id 账号 ID
   */
  const onDeleteAccount = async (id: string): Promise<void> => {
    if (!client) {
      return;
    }
    await client.deleteAccount(id);
    await refreshAccounts(client);
  };

  /**
   * 打开账号浏览器
   *
   * @param account 账号
   */
  const onOpenAccount = async (account: AccountItem): Promise<void> => {
    if (!client) {
      return;
    }
    setError(null);
    try {
      const result = await client.openAccount(account.id);
      setStatus(`已打开 ${account.name} 的浏览器 · ${result.url}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(
        msg === 'not_found'
          ? '打开失败：引擎缺少 /accounts/open（请重启引擎后点「重新连接」）'
          : msg,
      );
    }
  };

  /**
   * 执行发布（SSE）
   *
   * @param targets 目标列表
   * @param cid 内容 ID
   */
  const runPublish = async (
    targets: PublishTargetDto[],
    cid: string,
  ): Promise<void> => {
    if (!client) {
      return;
    }
    setPublishing(true);
    setLogs([]);
    setResultLinks([]);
    setError(null);
    try {
      await client.publish({ contentId: cid, targets }, (event) => {
        setLogs((prev) => {
          return [...prev, `[${event.type}] ${event.message ?? ''}`.trim()];
        });
        if (event.type === 'success') {
          const url = pickSuccessUrl(event);
          if (url) {
            setResultLinks((prev) => {
              return prev.includes(url) ? prev : [...prev, url];
            });
          }
        }
      });
      const contentRes = await client.contents();
      setContents(contentRes.contents);
      await refreshRecords(client);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPublishing(false);
    }
  };

  /**
   * 小红书：本地上传笔记图片（最多 9 张）
   *
   * @param files 选中文件
   */
  const onUploadXhsImages = async (
    files: FileList | File[],
  ): Promise<void> => {
    if (!client) {
      setError('请先连接引擎');
      return;
    }
    const list = Array.from(files).filter((f) => {
      return f.type.startsWith('image/');
    });
    if (list.length === 0) {
      return;
    }
    setXhsUploading(true);
    setError(null);
    try {
      const room = Math.max(
        0,
        9 - contentAssets.filter(isLocalImageAsset).length,
      );
      for (const file of list.slice(0, room)) {
        const dataUrl = await readFileAsDataUrl(file);
        const saved = await client.uploadAsset({
          mime: file.type || 'image/png',
          dataBase64: dataUrl,
          filename: file.name || 'xhs.png',
        });
        const ref = saved.filename || saved.path;
        setContentAssets((prev) => {
          return prev.includes(ref) ? prev : [...prev, ref];
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setXhsUploading(false);
    }
  };

  /**
   * 发布中心：保存内容（如需）后发布当前目标
   */
  const onPublish = async (): Promise<void> => {
    if (!client) {
      return;
    }
    if (!accountId) {
      setError('请先选择账号，或到「账号」页完成登录/绑定');
      return;
    }
    const schemaErr = validateSchemaValues(selectedPlugin?.schema, settings);
    if (schemaErr) {
      setError(schemaErr);
      return;
    }
    // 公众号链接额外校验
    if (
      settings.publishType === 'article' &&
      settings.articleImport === 'wechatLink'
    ) {
      const u = String(settings.importUrl ?? '');
      if (!/^https?:\/\//i.test(u.trim())) {
        setError('导入公众号链接需填写有效的 http(s) 网址');
        return;
      }
    }
    // 小红书图文：发布前强制至少 1 张本地图片；写长文不强制
    if (pluginId === 'xiaohongshu') {
      const xhsMode =
        settings.publishType === 'article' ||
        (settings.publishType !== 'imageText' && contentType === 'article')
          ? 'article'
          : 'imageText';
      if (xhsMode === 'imageText') {
        const localImages = contentAssets.filter(isLocalImageAsset);
        if (localImages.length === 0) {
          setError(
            '小红书「上传图文」请至少上传 1 张本地图片；长文请改选「写长文」',
          );
          return;
        }
      }
    }

    let cid = contentId;
    try {
      if (cid) {
        await client.updateContent(cid, {
          title: title.trim() || '未命名',
          markdown,
          assets: contentAssets,
        });
      } else {
        const created = await client.createContent({
          title: title.trim() || '未命名',
          markdown,
          assets: contentAssets,
        });
        cid = created.content.id;
        setContentId(cid);
        setContents((prev) => {
          return [created.content, ...prev];
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return;
    }

    await runPublish(
      [
        {
          pluginId,
          accountId,
          settings: compactSettings(settings),
        },
      ],
      cid,
    );
  };

  /**
   * 仅重试某任务的失败目标
   *
   * @param record 发布记录
   */
  const onRetryFailed = async (record: RecordItem): Promise<void> => {
    if (!client) {
      return;
    }
    const failed = record.receipts.filter((r) => {
      return !r.ok;
    });
    if (failed.length === 0) {
      setError('该任务没有失败目标');
      return;
    }
    setPage('publish');
    await runPublish(
      failed.map((r) => {
        return r.target;
      }),
      record.task.contentId,
    );
  };

  const navItems: Array<{ id: PageId; label: string; icon: string }> = [
    { id: 'contents', label: '内容库', icon: '文' },
    { id: 'publish', label: '发布中心', icon: '发' },
    { id: 'records', label: '发布记录', icon: '录' },
    { id: 'accounts', label: '账号库', icon: '账' },
    { id: 'plugins', label: '插件', icon: '插' },
    { id: 'settings', label: '设置', icon: '设' },
  ];

  const pageTitle =
    navItems.find((n) => {
      return n.id === page;
    })?.label ?? 'Seedcast';

  /**
   * 切换模板编辑用的插件
   *
   * @param nextId 插件 ID
   */
  const onChangeTemplatePlugin = (nextId: string): void => {
    setTemplatePluginId(nextId);
    setSelectedTemplateId('');
    const next = plugins.find((p) => {
      return p.id === nextId;
    });
    setTemplateSettings(defaultsFromSchema(next?.schema));
  };

  /**
   * 加载已有模板到编辑器
   *
   * @param id 模板 ID
   */
  const onLoadTemplateForEdit = (id: string): void => {
    const tpl = templates.find((t) => {
      return t.id === id;
    });
    if (!tpl) {
      return;
    }
    setSelectedTemplateId(tpl.id);
    setTemplatePluginId(tpl.pluginId);
    setTemplateName(tpl.name);
    setTemplateSettings({ ...tpl.settings });
  };

  /**
   * 保存发布配置模板（新建或覆盖）
   */
  const onSaveTemplate = async (): Promise<void> => {
    if (!client) {
      return;
    }
    if (!templateName.trim()) {
      setError('请填写模板名称');
      return;
    }
    setSavingTemplate(true);
    setError(null);
    try {
      if (selectedTemplateId) {
        await client.updateSettingTemplate(selectedTemplateId, {
          name: templateName.trim(),
          settings: compactSettings(templateSettings),
        });
      } else {
        const res = await client.createSettingTemplate({
          pluginId: templatePluginId,
          name: templateName.trim(),
          settings: compactSettings(templateSettings),
        });
        setSelectedTemplateId(res.template.id);
      }
      await refreshTemplates(client);
      setStatus('发布配置模板已保存');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSavingTemplate(false);
    }
  };

  /**
   * 删除当前选中模板
   */
  const onDeleteTemplate = (): void => {
    if (!client || !selectedTemplateId) {
      return;
    }
    const id = selectedTemplateId;
    askConfirm({
      title: '删除模板',
      message: '确定删除该发布配置模板？',
      confirmLabel: '删除',
      onConfirm: async () => {
        setError(null);
        try {
          await client.deleteSettingTemplate(id);
          setSelectedTemplateId('');
          setTemplateName('默认配置');
          setTemplateSettings(defaultsFromSchema(templatePlugin?.schema));
          await refreshTemplates(client);
          setStatus('模板已删除');
        } catch (err) {
          setError(err instanceof Error ? err.message : String(err));
        }
      },
    });
  };

  /**
   * 发布页套用模板
   *
   * @param id 模板 ID
   */
  const onApplyTemplateToPublish = (id: string): void => {
    const tpl = templates.find((t) => {
      return t.id === id;
    });
    if (!tpl) {
      return;
    }
    if (tpl.pluginId !== pluginId) {
      onChangePlugin(tpl.pluginId);
    }
    setSettings({
      ...defaultsFromSchema(
        plugins.find((p) => {
          return p.id === tpl.pluginId;
        })?.schema,
      ),
      ...tpl.settings,
    });
    setSelectedTemplateId(tpl.id);
  };

  /**
   * 安装本地第三方插件（需勾选风险确认）
   */
  const onInstallPlugin = async (): Promise<void> => {
    if (!client) {
      return;
    }
    if (!pluginSourcePath.trim()) {
      setError('请填写本机插件目录绝对路径');
      return;
    }
    if (!pluginRiskAck) {
      setError('请先勾选风险确认后再安装');
      return;
    }
    setInstallingPlugin(true);
    setError(null);
    try {
      const res = await client.installPlugin({
        sourcePath: pluginSourcePath.trim(),
        confirmRisk: true,
        overwrite: false,
      });
      const pluginRes = await client.plugins();
      setPlugins(pluginRes.plugins);
      setStatus(
        `已安装插件 ${res.installed?.name ?? ''}（${res.installed?.pluginId}）`,
      );
      setPluginSourcePath('');
      setPluginRiskAck(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setInstallingPlugin(false);
    }
  };

  /**
   * 保存数据目录配置（需重启引擎）
   */
  const onSaveDataDir = async (): Promise<void> => {
    if (!client) {
      return;
    }
    setSavingSettings(true);
    setError(null);
    try {
      const res = await client.updateSettings({
        dataDir: dataDirInput.trim(),
      });
      const settingsRes = await client.settings();
      setSettingsInfo(settingsRes.settings);
      setStatus(res.settings.note);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSavingSettings(false);
    }
  };

  /**
   * 顶栏「创作」：进入内容库并新建
   */
  const onCreateEntry = (): void => {
    onNewContent();
    setPage('contents');
  };

  /**
   * 顶栏「快速发布」：进入发布中心
   */
  const onQuickPublish = (): void => {
    setPage('publish');
  };

  return (
    <div className="workbench">
      <aside className="sidebar" aria-label="主导航">
        <div className="sidebar-brand">
          <div className="brand">Seedcast</div>
          <div className="brand-sub">飞播</div>
        </div>
        <nav className="side-nav">
          {navItems.map((item) => {
            return (
              <button
                key={item.id}
                type="button"
                className={page === item.id ? 'side-nav-item active' : 'side-nav-item'}
                onClick={() => {
                  setPage(item.id);
                }}
              >
                <span className="side-nav-icon" aria-hidden>
                  {item.icon}
                </span>
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
      </aside>

      <div className="workbench-main">
        <header className="topbar">
          <div className="topbar-left">
            <h1 className="topbar-title">{pageTitle}</h1>
            <span className="muted topbar-hint">一份内容，播到多个平台</span>
          </div>
          <div className="topbar-actions">
            <button type="button" className="btn secondary" onClick={onCreateEntry}>
              写文章
            </button>
            <button type="button" className="btn secondary" onClick={onNewImageText}>
              新建图文
            </button>
            <button type="button" className="btn secondary" onClick={onNewVideo}>
              新建视频
            </button>
            <button type="button" className="btn" onClick={onQuickPublish}>
              快速发布
            </button>
            <button
              type="button"
              className="btn secondary"
              onClick={() => void connect()}
            >
              重新连接
            </button>
          </div>
        </header>

        {error ? <p className="err banner-err">{error}</p> : null}

        <main className="main-panel">
        {page === 'contents' ? (
          <div className="contents-layout">
            <aside className="contents-list">
              <div className="row" style={{ marginBottom: 8 }}>
                <h2 style={{ margin: 0, flex: 1 }}>内容</h2>
                <button
                  type="button"
                  className="btn secondary"
                  onClick={onNewContent}
                >
                  新建
                </button>
              </div>
              <div className="sub-tabs compact-tabs" role="tablist">
                {(
                  [
                    { id: 'all' as const, label: '全部' },
                    { id: 'draft' as const, label: '草稿' },
                    { id: 'published' as const, label: '已发布' },
                  ] as const
                ).map((tab) => {
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      role="tab"
                      className={
                        contentFilter === tab.id ? 'sub-tab active' : 'sub-tab'
                      }
                      onClick={() => {
                        setContentFilter(tab.id);
                      }}
                    >
                      {tab.label}
                    </button>
                  );
                })}
              </div>
              {contents.length === 0 ? (
                <div className="empty-state compact">
                  <p className="muted">还没有内容</p>
                  <button type="button" className="btn" onClick={onCreateEntry}>
                    创作第一篇
                  </button>
                </div>
              ) : filteredContents.length === 0 ? (
                <p className="muted" style={{ marginTop: 12 }}>
                  {contentFilter === 'published'
                    ? '还没有发布成功的内容'
                    : '没有草稿（均已至少成功发布过一次）'}
                </p>
              ) : (
                <ul className="content-ul">
                  {filteredContents.map((c) => {
                    const published = publishedContentIds.has(c.id);
                    return (
                      <li key={c.id}>
                        <button
                          type="button"
                          className={
                            c.id === contentId
                              ? 'content-item active'
                              : 'content-item'
                          }
                          onClick={() => {
                            selectContent(c.id);
                          }}
                        >
                          <strong>
                            {(c.contentType ?? 'article') === 'imageText'
                              ? '图文 · '
                              : (c.contentType ?? 'article') === 'video'
                                ? '视频 · '
                                : ''}
                            {c.title || '（无标题）'}
                          </strong>
                          <span className="muted">
                            {published ? '已发布 · ' : '草稿 · '}
                            {c.updatedAt.slice(0, 19).replace('T', ' ')}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </aside>
            <div className="stack contents-editor">
              {showImageTextComposer ? (
                <ImageTextComposer
                  client={client}
                  onCancel={() => {
                    setShowImageTextComposer(false);
                  }}
                  onError={setError}
                  onCreated={async (id) => {
                    setShowImageTextComposer(false);
                    if (!client) {
                      return;
                    }
                    const list = await client.contents();
                    setContents(list.contents);
                    const item = list.contents.find((c) => {
                      return c.id === id;
                    });
                    if (item) {
                      setContentId(item.id);
                      setContentType(item.contentType ?? 'imageText');
                      setTitle(item.title);
                      setMarkdown(item.markdown);
                      setContentAssets(item.assets ?? []);
                    }
                    setStatus('图文已创建（图片已上传至图床）');
                  }}
                />
              ) : showVideoComposer ? (
                <VideoComposer
                  client={client}
                  ffmpegAvailable={settingsInfo?.ffmpegAvailable}
                  onCancel={() => {
                    setShowVideoComposer(false);
                  }}
                  onError={setError}
                  onCreated={async (id) => {
                    setShowVideoComposer(false);
                    if (!client) {
                      return;
                    }
                    const list = await client.contents();
                    setContents(list.contents);
                    const item = list.contents.find((c) => {
                      return c.id === id;
                    });
                    if (item) {
                      setContentId(item.id);
                      setContentType(item.contentType ?? 'video');
                      setTitle(item.title);
                      setMarkdown(item.markdown);
                      setContentAssets(item.assets ?? []);
                    }
                    setStatus('视频已创建');
                  }}
                />
              ) : (
                <>
                  <label className="field">
                    标题
                    <input
                      value={title}
                      onChange={(e) => {
                        setTitle(e.target.value);
                      }}
                    />
                  </label>
                  {contentType === 'imageText' ? (
                    <div className="field">
                      <span>描述</span>
                      <textarea
                        className="itc-textarea"
                        rows={4}
                        value={markdown}
                        onChange={(e) => {
                          setMarkdown(e.target.value);
                        }}
                      />
                      <span className="muted">图片（本地入库，可供小红书等使用）</span>
                      <div className="itc-thumbs itc-thumbs-readonly">
                        {contentAssets.length === 0 ? (
                          <p className="muted">无图片</p>
                        ) : (
                          contentAssets.map((ref) => {
                            const src = client
                              ? resolveMediaSrc(client, ref)
                              : ref;
                            return (
                              <a
                                key={ref}
                                className="itc-thumb"
                                href={src}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                <img src={src} alt="" />
                              </a>
                            );
                          })
                        )}
                      </div>
                    </div>
                  ) : contentType === 'video' ? (
                    <div className="field">
                      <span>描述</span>
                      <textarea
                        className="vc-textarea"
                        rows={4}
                        value={markdown}
                        onChange={(e) => {
                          setMarkdown(e.target.value);
                        }}
                      />
                      <span className="muted">视频 / 封面</span>
                      <div className="vc-preview-row">
                        {contentAssets[0] ? (
                          <video
                            className="vc-preview-video"
                            controls
                            src={
                              client
                                ? resolveMediaSrc(client, contentAssets[0])
                                : contentAssets[0]
                            }
                          />
                        ) : (
                          <p className="muted">无视频文件</p>
                        )}
                        {contentAssets[1] ? (
                          <img
                            className="vc-preview-cover"
                            src={
                              client
                                ? resolveMediaSrc(client, contentAssets[1])
                                : contentAssets[1]
                            }
                            alt="封面"
                          />
                        ) : null}
                      </div>
                    </div>
                  ) : (
                    <div className="field md-field">
                      <span>正文</span>
                      <MarkdownEditor
                        value={markdown}
                        onChange={setMarkdown}
                        client={client}
                        useRemoteImageHost={
                          settingsInfo?.imageHost?.enabled !== false
                        }
                        onAssetSaved={(path) => {
                          setContentAssets((prev) => {
                            return prev.includes(path) ? prev : [...prev, path];
                          });
                        }}
                        onError={setError}
                      />
                    </div>
                  )}
                  <div className="row">
                    <button
                      type="button"
                      className="btn"
                      disabled={!client || savingContent}
                      onClick={() => void onSaveContent()}
                    >
                      {savingContent ? '保存中…' : '保存'}
                    </button>
                    <button
                      type="button"
                      className="btn secondary"
                      disabled={!client || !contentId}
                      onClick={onDeleteContent}
                    >
                      删除
                    </button>
                    <button
                      type="button"
                      className="btn secondary"
                      onClick={() => {
                        setPage('publish');
                      }}
                    >
                      去发布
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        ) : null}

        {page === 'accounts' ? (
          <div className="stack">
            <div className="sub-tabs" role="tablist" aria-label="账号库二级">
              {(
                [
                  { id: 'overview' as const, label: '平台概览' },
                  { id: 'manage' as const, label: '账号管理' },
                  { id: 'templates' as const, label: '发布配置' },
                ] as const
              ).map((tab) => {
                return (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={accountsTab === tab.id}
                    className={
                      accountsTab === tab.id ? 'sub-tab active' : 'sub-tab'
                    }
                    onClick={() => {
                      setAccountsTab(tab.id);
                    }}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>

            {accountsTab === 'overview' ? (
              <div className="stack">
                <p className="muted">
                  已装插件能力一览。点「添加账号」可跳到账号管理。
                </p>
                {plugins.length === 0 ? (
                  <p className="muted">暂无插件</p>
                ) : (
                  <div className="platform-grid">
                    {plugins.map((p) => {
                      const count = accounts.filter((a) => {
                        return a.pluginId === p.id;
                      }).length;
                      const loggedIn = accounts.filter((a) => {
                        return (
                          a.pluginId === p.id && a.status === 'logged_in'
                        );
                      }).length;
                      const caps = p.capabilities;
                      const types = caps?.publishTypes ?? [];
                      const schemaKeys = p.schema?.properties
                        ? Object.keys(p.schema.properties).length
                        : 0;
                      return (
                        <div key={p.id} className="platform-card">
                          <div className="row" style={{ justifyContent: 'space-between' }}>
                            <strong>{p.name}</strong>
                            <span className="muted">{p.id}</span>
                          </div>
                          <div className="muted" style={{ fontSize: '0.85rem' }}>
                            v{p.version} · {p.adapter} · {p.source}
                          </div>
                          <ul className="cap-list">
                            <li>
                              账号 {count}（已登录 {loggedIn}）
                            </li>
                            <li>
                              {caps?.draft ? '支持草稿' : '无草稿声明'}
                              {caps?.nativeSchedule
                                ? ' · 原生定时'
                                : ' · 无原生定时'}
                            </li>
                            <li>
                              发布类型 {types.length || 1}
                              {types.length > 0
                                ? `（${types.map((t) => t.label).join(' / ')}）`
                                : ''}
                            </li>
                            <li>设置字段 {schemaKeys}</li>
                          </ul>
                          <button
                            type="button"
                            className="btn secondary"
                            onClick={() => {
                              setLoginPluginId(p.id);
                              setAccountsTab('manage');
                            }}
                          >
                            添加账号
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : null}

            {accountsTab === 'manage' ? (
              <div className="stack">
                <p className="muted">
                  {loginIsWechat
                    ? '公众号使用官方 API：绑定 AppID / AppSecret（写入草稿箱，不自动群发）。'
                    : loginIsX
                      ? 'X 使用官方 API：绑定 API Key / Access Token（按次计费，请自查控制台）。'
                      : loginIsYouTube
                        ? 'YouTube 使用官方 Data API：绑定 OAuth Client 与 Refresh Token（默认上传为私密）。'
                        : '将打开本机 Chrome（独立 profile）。mock 用 fixture；其它平台需扫码。'}
                </p>
                <label className="field">
                  平台插件
                  <select
                    value={loginPluginId}
                    onChange={(e) => {
                      setLoginPluginId(e.target.value);
                    }}
                  >
                    {plugins.map((p) => {
                      return (
                        <option key={p.id} value={p.id}>
                          {p.name} ({p.id})
                        </option>
                      );
                    })}
                  </select>
                </label>
                <label className="field">
                  账号备注名
                  <input
                    value={accountName}
                    onChange={(e) => {
                      setAccountName(e.target.value);
                    }}
                  />
                </label>
                {loginIsCredentialBind ? (
                  <>
                    {loginIsWechat ? (
                      <>
                        <div className="hint-box" role="note">
                          <strong>如何获取 AppID / AppSecret</strong>
                          <ol>
                            <li>
                              登录微信公众平台：
                              <a
                                href="https://mp.weixin.qq.com"
                                target="_blank"
                                rel="noreferrer"
                              >
                                https://mp.weixin.qq.com
                              </a>
                            </li>
                            <li>左侧进入「设置与开发」→「基本配置」</li>
                            <li>
                              在「开发者 ID (AppID)」查看 AppID（wx 开头）
                            </li>
                            <li>
                              在「开发者密码 (AppSecret)」点生成/重置后复制（只显示一次）
                            </li>
                            <li>同页将本机出口 IP 加入「IP 白名单」</li>
                          </ol>
                        </div>
                        <label className="field">
                          AppID
                          <input
                            value={wechatAppId}
                            placeholder="wx…"
                            onChange={(e) => {
                              setWechatAppId(e.target.value);
                            }}
                          />
                        </label>
                        <label className="field">
                          AppSecret
                          <input
                            type="password"
                            value={wechatAppSecret}
                            onChange={(e) => {
                              setWechatAppSecret(e.target.value);
                            }}
                          />
                        </label>
                      </>
                    ) : null}
                    {loginIsX ? (
                      <>
                        <div className="hint-box" role="note">
                          <strong>如何获取 X API 凭证</strong>
                          <ol>
                            <li>
                              打开{' '}
                              <a
                                href="https://console.x.com"
                                target="_blank"
                                rel="noreferrer"
                              >
                                console.x.com
                              </a>{' '}
                              创建 App
                            </li>
                            <li>在 Keys and tokens 生成 API Key / Secret</li>
                            <li>
                              生成 Access Token / Secret（需具备发帖权限）
                            </li>
                            <li>注意：新开发者多为按次计费，请自查定价</li>
                          </ol>
                        </div>
                        <label className="field">
                          API Key
                          <input
                            value={xApiKey}
                            onChange={(e) => {
                              setXApiKey(e.target.value);
                            }}
                          />
                        </label>
                        <label className="field">
                          API Key Secret
                          <input
                            type="password"
                            value={xApiSecret}
                            onChange={(e) => {
                              setXApiSecret(e.target.value);
                            }}
                          />
                        </label>
                        <label className="field">
                          Access Token
                          <input
                            value={xAccessToken}
                            onChange={(e) => {
                              setXAccessToken(e.target.value);
                            }}
                          />
                        </label>
                        <label className="field">
                          Access Token Secret
                          <input
                            type="password"
                            value={xAccessTokenSecret}
                            onChange={(e) => {
                              setXAccessTokenSecret(e.target.value);
                            }}
                          />
                        </label>
                      </>
                    ) : null}
                    {loginIsYouTube ? (
                      <>
                        <div className="hint-box" role="note">
                          <strong>如何获取 YouTube OAuth 凭证</strong>
                          <ol>
                            <li>
                              Google Cloud Console 启用 YouTube Data API v3
                            </li>
                            <li>创建 OAuth 客户端（桌面应用）拿到 ID/Secret</li>
                            <li>
                              本机完成一次授权，取得含 youtube.upload
                              的 refresh_token
                            </li>
                            <li>默认上传为私密，可在 Studio 再公开</li>
                          </ol>
                        </div>
                        <label className="field">
                          Client ID
                          <input
                            value={ytClientId}
                            onChange={(e) => {
                              setYtClientId(e.target.value);
                            }}
                          />
                        </label>
                        <label className="field">
                          Client Secret
                          <input
                            type="password"
                            value={ytClientSecret}
                            onChange={(e) => {
                              setYtClientSecret(e.target.value);
                            }}
                          />
                        </label>
                        <label className="field">
                          Refresh Token
                          <input
                            type="password"
                            value={ytRefreshToken}
                            onChange={(e) => {
                              setYtRefreshToken(e.target.value);
                            }}
                          />
                        </label>
                      </>
                    ) : null}
                    <button
                      type="button"
                      className="btn"
                      disabled={!client || binding}
                      onClick={() => void onBindCredentials()}
                    >
                      {binding ? '校验中…' : '绑定凭证'}
                    </button>
                  </>
                ) : (
                  <div className="row">
                    <button
                      type="button"
                      className="btn"
                      disabled={!client || loggingIn}
                      onClick={() => void onLogin()}
                    >
                      {loggingIn ? '等待登录…' : '添加并登录'}
                    </button>
                    {loggingIn ? (
                      <button
                        type="button"
                        className="btn secondary"
                        onClick={onCancelLogin}
                      >
                        取消登录
                      </button>
                    ) : null}
                  </div>
                )}
                {accounts.length === 0 ? (
                  <p className="muted">暂无账号</p>
                ) : (
                  <table className="table">
                    <thead>
                      <tr>
                        <th>名称</th>
                        <th>插件</th>
                        <th>状态</th>
                        <th>操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {accounts.map((a) => {
                        return (
                          <tr key={a.id}>
                            <td>{a.name}</td>
                            <td>{a.pluginId}</td>
                            <td
                              className={
                                a.status === 'logged_in' ? 'ok' : 'err'
                              }
                            >
                              {a.status}
                            </td>
                            <td>
                              <div className="row">
                                {!isCredentialPlugin(a.pluginId) ? (
                                  <button
                                    type="button"
                                    className="btn secondary"
                                    onClick={() => void onOpenAccount(a)}
                                  >
                                    打开
                                  </button>
                                ) : null}
                                <button
                                  type="button"
                                  className="btn secondary"
                                  onClick={() => void onCheckSession(a)}
                                >
                                  检测
                                </button>
                                <button
                                  type="button"
                                  className="btn secondary"
                                  onClick={() => void onDeleteAccount(a.id)}
                                >
                                  删除
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            ) : null}

            {accountsTab === 'templates' ? (
              <div className="stack">
                <p className="muted">
                  按插件保存 schema 发布设置，可在发布中心一键套用。
                </p>
                <label className="field">
                  平台插件
                  <select
                    value={templatePluginId}
                    onChange={(e) => {
                      onChangeTemplatePlugin(e.target.value);
                    }}
                  >
                    {plugins.map((p) => {
                      return (
                        <option key={p.id} value={p.id}>
                          {p.name} ({p.id})
                        </option>
                      );
                    })}
                  </select>
                </label>
                <label className="field">
                  已有模板
                  <select
                    value={selectedTemplateId}
                    onChange={(e) => {
                      const id = e.target.value;
                      if (!id) {
                        setSelectedTemplateId('');
                        setTemplateName('默认配置');
                        setTemplateSettings(
                          defaultsFromSchema(templatePlugin?.schema),
                        );
                        return;
                      }
                      onLoadTemplateForEdit(id);
                    }}
                  >
                    <option value="">（新建模板）</option>
                    {templates
                      .filter((t) => {
                        return t.pluginId === templatePluginId;
                      })
                      .map((t) => {
                        return (
                          <option key={t.id} value={t.id}>
                            {t.name}
                          </option>
                        );
                      })}
                  </select>
                </label>
                <label className="field">
                  模板名称
                  <input
                    value={templateName}
                    onChange={(e) => {
                      setTemplateName(e.target.value);
                    }}
                  />
                </label>
                <SchemaForm
                  schema={templatePlugin?.schema}
                  values={templateSettings}
                  onChange={setTemplateSettings}
                />
                <div className="row">
                  <button
                    type="button"
                    className="btn"
                    disabled={!client || savingTemplate}
                    onClick={() => void onSaveTemplate()}
                  >
                    {savingTemplate
                      ? '保存中…'
                      : selectedTemplateId
                        ? '更新模板'
                        : '保存为模板'}
                  </button>
                  <button
                    type="button"
                    className="btn secondary"
                    disabled={!selectedTemplateId}
                    onClick={onDeleteTemplate}
                  >
                    删除
                  </button>
                  <button
                    type="button"
                    className="btn secondary"
                    onClick={() => {
                      if (selectedTemplateId) {
                        onApplyTemplateToPublish(selectedTemplateId);
                      } else {
                        onChangePlugin(templatePluginId);
                        setSettings({ ...templateSettings });
                      }
                      setPage('publish');
                    }}
                  >
                    带到发布中心
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        {page === 'publish' ? (
          <div className="stack">
            <h2>发布中心</h2>
            <label className="field">
              内容
              <select
                value={contentId}
                onChange={(e) => {
                  const id = e.target.value;
                  if (id) {
                    selectContent(id);
                  } else {
                    onNewContent();
                  }
                }}
              >
                <option value="">（新建未保存草稿）</option>
                {contents.map((c) => {
                  return (
                    <option key={c.id} value={c.id}>
                      {c.title}
                    </option>
                  );
                })}
              </select>
            </label>
            <label className="field">
              标题
              <input
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value);
                }}
              />
            </label>
            <div className="field">
              <span>Markdown</span>
              <MarkdownEditor
                value={markdown}
                onChange={setMarkdown}
                client={client}
                useRemoteImageHost={
                  settingsInfo?.imageHost?.enabled !== false
                }
                onAssetSaved={(path) => {
                  setContentAssets((prev) => {
                    return prev.includes(path) ? prev : [...prev, path];
                  });
                }}
                onError={setError}
              />
            </div>
            <label className="field">
              目标插件
              <select
                value={pluginId}
                onChange={(e) => {
                  onChangePlugin(e.target.value);
                }}
              >
                {plugins.map((p) => {
                  return (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.id})
                    </option>
                  );
                })}
              </select>
            </label>
            <label className="field">
              账号
              <select
                value={accountId}
                onChange={(e) => {
                  setAccountId(e.target.value);
                }}
              >
                <option value="">（未选账号）</option>
                {accounts
                  .filter((a) => {
                    return a.pluginId === pluginId;
                  })
                  .map((a) => {
                    return (
                      <option key={a.id} value={a.id}>
                        {a.name} · {a.status}
                      </option>
                    );
                  })}
              </select>
            </label>
            {publishIsWechat ? (
              <div className="hint-box" role="note">
                <strong>公众号接口能力</strong>
                <ul className="cap-list">
                  <li>
                    <span className="cap-on">已接入</span>
                    access_token、永久素材、draft/add、draft/get
                  </li>
                  <li>
                    <span className="cap-off">未接入</span>
                    freepublish / 群发 / 原创（刻意不做自动群发）
                  </li>
                </ul>
              </div>
            ) : null}
            {pluginId === 'xiaohongshu' &&
            settings.publishType !== 'article' ? (
              <div className="field">
                <span>
                  笔记图片（图文必填，最多 9 张）
                  <span className="muted" style={{ marginLeft: 8 }}>
                    长文请在上方改选「写长文」
                  </span>
                </span>
                <div className="itc-thumbs">
                  {contentAssets.filter(isLocalImageAsset).map((ref) => {
                    return (
                      <div key={ref} className="itc-thumb">
                        <img
                          src={
                            client ? resolveMediaSrc(client, ref) : ref
                          }
                          alt=""
                        />
                        <button
                          type="button"
                          className="itc-thumb-remove"
                          title="移除"
                          onClick={() => {
                            setContentAssets((prev) => {
                              return prev.filter((x) => {
                                return x !== ref;
                              });
                            });
                          }}
                        >
                          ×
                        </button>
                      </div>
                    );
                  })}
                  <button
                    type="button"
                    className="itc-add"
                    disabled={
                      !client ||
                      xhsUploading ||
                      contentAssets.filter(isLocalImageAsset).length >= 9
                    }
                    onClick={() => {
                      xhsFileRef.current?.click();
                    }}
                  >
                    <span className="itc-add-icon">＋</span>
                    <span>{xhsUploading ? '上传中…' : '添加图片'}</span>
                  </button>
                </div>
                <input
                  ref={xhsFileRef}
                  type="file"
                  accept="image/png,image/jpeg,image/jpg,image/webp,image/gif"
                  multiple
                  hidden
                  onChange={(e) => {
                    if (e.target.files?.length) {
                      void onUploadXhsImages(e.target.files);
                    }
                    e.target.value = '';
                  }}
                />
                {contentAssets.filter(isLocalImageAsset).length === 0 ? (
                  <p className="muted" role="status">
                    图文未上传图片时无法发布；长内容请选「写长文」
                  </p>
                ) : null}
              </div>
            ) : null}
            {pluginId === 'xiaohongshu' &&
            settings.publishType === 'article' ? (
              <p className="muted" role="note">
                将走创作者中心「写长文 → 新的创作」，标题最长 64 字，不强制配图
              </p>
            ) : null}
            <label className="field">
              套用发布配置模板
              <select
                value={
                  templates.some((t) => {
                    return t.id === selectedTemplateId && t.pluginId === pluginId;
                  })
                    ? selectedTemplateId
                    : ''
                }
                onChange={(e) => {
                  const id = e.target.value;
                  if (!id) {
                    setSelectedTemplateId('');
                    setSettings(defaultsFromSchema(selectedPlugin?.schema));
                    return;
                  }
                  onApplyTemplateToPublish(id);
                }}
              >
                <option value="">（不套用 / 手动填写）</option>
                {templates
                  .filter((t) => {
                    return t.pluginId === pluginId;
                  })
                  .map((t) => {
                    return (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    );
                  })}
              </select>
            </label>
            <SchemaForm
              schema={selectedPlugin?.schema}
              values={settings}
              onChange={setSettings}
            />
            <div className="row">
              <button
                type="button"
                className="btn"
                disabled={!client || publishing}
                onClick={() => void onPublish()}
              >
                {publishing ? '发布中…' : '创建并发布'}
              </button>
              <span className="muted">内容库已有 {contents.length} 篇</span>
            </div>
            {resultLinks.length > 0 ? (
              <div className="result-box" role="status">
                <strong>发布成功 · 可点击打开</strong>
                <ul>
                  {resultLinks.map((url) => {
                    return (
                      <li key={url}>
                        <a href={url} target="_blank" rel="noopener noreferrer">
                          {url}
                        </a>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : null}
            <div className="log" aria-live="polite">
              {logs.length === 0
                ? '等待发布事件…'
                : logs.map((line, i) => {
                    return renderLogLine(line, i);
                  })}
            </div>
          </div>
        ) : null}

        {page === 'records' ? (
          <div className="stack">
            <h2>发布记录</h2>
            <div className="row">
              <label className="field" style={{ minWidth: 180 }}>
                插件筛选
                <select
                  value={recordPluginFilter}
                  onChange={(e) => {
                    setRecordPluginFilter(e.target.value);
                  }}
                >
                  <option value="">全部</option>
                  {plugins.map((p) => {
                    return (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    );
                  })}
                </select>
              </label>
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={recordFailedOnly}
                  onChange={(e) => {
                    setRecordFailedOnly(e.target.checked);
                  }}
                />
                仅看有失败
              </label>
              <button
                type="button"
                className="btn secondary"
                disabled={!client}
                onClick={() => {
                  if (client) {
                    void refreshRecords(client);
                  }
                }}
              >
                刷新
              </button>
            </div>
            {records.length === 0 ? (
              <p className="muted">暂无记录</p>
            ) : (
              records.map((rec) => {
                const failCount = rec.receipts.filter((r) => {
                  return !r.ok;
                }).length;
                const okCount = rec.receipts.filter((r) => {
                  return r.ok;
                }).length;
                return (
                  <div key={rec.task.id} className="record-card">
                    <div className="row" style={{ justifyContent: 'space-between' }}>
                      <div>
                        <strong>
                          {rec.contentTitle ?? rec.task.contentId.slice(0, 8)}
                        </strong>
                        <span className="muted" style={{ marginLeft: 8 }}>
                          {rec.task.createdAt.slice(0, 19).replace('T', ' ')} ·{' '}
                          {rec.task.status} · 成功 {okCount} / 失败 {failCount}
                        </span>
                      </div>
                      {failCount > 0 ? (
                        <button
                          type="button"
                          className="btn"
                          disabled={publishing}
                          onClick={() => void onRetryFailed(rec)}
                        >
                          仅重试失败
                        </button>
                      ) : null}
                    </div>
                    <ul className="receipt-ul">
                      {rec.receipts.map((r, idx) => {
                        const shotUrl =
                          !r.ok && r.error?.screenshot && client
                            ? client.screenshotUrlFromPath(r.error.screenshot)
                            : null;
                        return (
                          <li key={`${rec.task.id}-${idx}`}>
                            <span className={r.ok ? 'ok' : 'err'}>
                              {r.ok ? '成功' : '失败'}
                            </span>{' '}
                            {r.target.pluginId}
                            {r.url ? (
                              <>
                                {' '}
                                ·{' '}
                                <a
                                  href={r.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                >
                                  打开链接
                                </a>
                              </>
                            ) : null}
                            {!r.ok && r.error ? (
                              <div className="receipt-error">
                                {r.error.code ? (
                                  <div className="muted">
                                    错误码：{r.error.code}
                                  </div>
                                ) : null}
                                {r.error.step ? (
                                  <div className="muted">
                                    步骤：{r.error.step}
                                    {r.error.selector
                                      ? ` · 选择器：${r.error.selector}`
                                      : ''}
                                  </div>
                                ) : null}
                                {r.error.message ? (
                                  <div className="muted">{r.error.message}</div>
                                ) : null}
                                {shotUrl ? (
                                  <a
                                    href={shotUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="shot-link"
                                  >
                                    <img
                                      src={shotUrl}
                                      alt="失败截图"
                                      className="shot-thumb"
                                    />
                                    <span>查看失败截图</span>
                                  </a>
                                ) : null}
                              </div>
                            ) : null}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                );
              })
            )}
          </div>
        ) : null}

        {page === 'plugins' ? (
          <div className="stack">
            <h2>已加载插件</h2>
            {plugins.length === 0 ? (
              <p className="muted">暂无插件</p>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>名称</th>
                    <th>版本</th>
                    <th>适配器</th>
                    <th>schema</th>
                    <th>来源</th>
                  </tr>
                </thead>
                <tbody>
                  {plugins.map((p) => {
                    return (
                      <tr key={p.id}>
                        <td>{p.id}</td>
                        <td>{p.name}</td>
                        <td>{p.version}</td>
                        <td>{p.adapter}</td>
                        <td>{p.schema ? '有' : '—'}</td>
                        <td>{p.source}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}

            <div className="hint-box" role="note">
              <strong>安装第三方插件</strong>
              <p className="muted" style={{ margin: '6px 0' }}>
                插件在引擎进程内执行，持有账号会话，属于受信代码而非安全沙箱。请只安装可信来源。
              </p>
              <label className="field">
                本机插件目录（绝对路径，需含 manifest.json）
                <input
                  value={pluginSourcePath}
                  placeholder="/path/to/my-plugin"
                  onChange={(e) => {
                    setPluginSourcePath(e.target.value);
                  }}
                />
              </label>
              <label className="check-row" style={{ marginTop: 8 }}>
                <input
                  type="checkbox"
                  checked={pluginRiskAck}
                  onChange={(e) => {
                    setPluginRiskAck(e.target.checked);
                  }}
                />
                我已了解风险，确认安装此插件
              </label>
              <div className="row" style={{ marginTop: 10 }}>
                <button
                  type="button"
                  className="btn"
                  disabled={!client || installingPlugin || !pluginRiskAck}
                  onClick={() => void onInstallPlugin()}
                >
                  {installingPlugin ? '安装中…' : '确认安装'}
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {page === 'settings' ? (
          <div className="stack">
            <h2>设置</h2>
            {settingsInfo ? (
              <dl className="settings-dl">
                <dt>当前数据根</dt>
                <dd>
                  <code>{settingsInfo.dataDir}</code>
                </dd>
                <dt>默认数据根</dt>
                <dd>
                  <code>{settingsInfo.defaultDataDir ?? '—'}</code>
                </dd>
                <dt>配置文件</dt>
                <dd>
                  <code>{settingsInfo.configFile ?? '~/.seedcast-config.json'}</code>
                </dd>
                <dt>数据库</dt>
                <dd>
                  <code>{settingsInfo.dbPath}</code>
                </dd>
                <dt>账号 profile</dt>
                <dd>
                  <code>{settingsInfo.profilesDir}</code>
                </dd>
                <dt>素材</dt>
                <dd>
                  <code>{settingsInfo.assetsDir}</code>
                </dd>
                <dt>第三方插件</dt>
                <dd>
                  <code>{settingsInfo.pluginsDir}</code>
                </dd>
                <dt>遥测</dt>
                <dd>{settingsInfo.telemetry ? '开启' : '关闭（默认零遥测）'}</dd>
              </dl>
            ) : (
              <p className="muted">连接引擎后显示路径信息</p>
            )}
            <label className="field">
              自定义数据根目录
              <input
                value={dataDirInput}
                placeholder={settingsInfo?.defaultDataDir ?? '~/.seedcast'}
                onChange={(e) => {
                  setDataDirInput(e.target.value);
                }}
              />
            </label>
            <p className="muted">
              写入 <code>~/.seedcast-config.json</code>；环境变量{' '}
              <code>SEEDCAST_DATA_DIR</code> 优先。保存后需重启引擎。
            </p>
            <div className="row">
              <button
                type="button"
                className="btn"
                disabled={!client || savingSettings}
                onClick={() => void onSaveDataDir()}
              >
                {savingSettings ? '保存中…' : '保存数据目录'}
              </button>
              <button
                type="button"
                className="btn secondary"
                disabled={!client || savingSettings}
                onClick={() => {
                  setDataDirInput('');
                  void (async () => {
                    if (!client) {
                      return;
                    }
                    setSavingSettings(true);
                    try {
                      await client.updateSettings({ dataDir: '' });
                      const settingsRes = await client.settings();
                      setSettingsInfo(settingsRes.settings);
                      setDataDirInput(settingsRes.settings.dataDir);
                      setStatus('已恢复默认数据目录配置（需重启引擎）');
                    } catch (err) {
                      setError(
                        err instanceof Error ? err.message : String(err),
                      );
                    } finally {
                      setSavingSettings(false);
                    }
                  })();
                }}
              >
                恢复默认
              </button>
            </div>
            <h3>图床配置</h3>
            <p className="muted">
              启用后，仅新粘贴和插入的正文图片会上传到公网；已有的本地图库图片保持不变。
            </p>
            <label className="toggle-row">
              <span>
                <strong>使用公网图床</strong>
                <span className="field-hint">
                  密钥保存在本机 ~/.seedcast-config.json；关闭后正文图片仅存本机
                </span>
              </span>
              <input
                type="checkbox"
                role="switch"
                checked={imageHostEnabled}
                onChange={(e) => {
                  setImageHostEnabled(e.target.checked);
                }}
              />
            </label>
            <div className="provider-grid" aria-label="图床提供方">
              {(
                [
                  {
                    id: 'litterbox' as const,
                    title: 'litterbox',
                    desc: '免密钥 · 临时过期',
                  },
                  {
                    id: 's3' as const,
                    title: 'S3 / OSS',
                    desc: '兼容阿里云 OSS、AWS S3 等',
                  },
                  {
                    id: 'smms' as const,
                    title: 'SM.MS',
                    desc: '需免费 Token',
                  },
                  {
                    id: 'imgbb' as const,
                    title: 'ImgBB',
                    desc: '需免费 API Key',
                  },
                ] as const
              ).map((p) => {
                return (
                  <button
                    key={p.id}
                    type="button"
                    className={
                      imageHostProvider === p.id
                        ? 'provider-card provider-card-active'
                        : 'provider-card'
                    }
                    disabled={!imageHostEnabled}
                    onClick={() => {
                      setImageHostProvider(p.id);
                    }}
                  >
                    <strong>{p.title}</strong>
                    <span className="muted">{p.desc}</span>
                  </button>
                );
              })}
            </div>
            {imageHostProvider === 'litterbox' ? (
              <label className="field">
                保留时长
                <select
                  value={litterboxTime}
                  disabled={!imageHostEnabled}
                  onChange={(e) => {
                    setLitterboxTime(
                      e.target.value as '1h' | '12h' | '24h' | '72h',
                    );
                  }}
                >
                  <option value="1h">1 小时</option>
                  <option value="12h">12 小时</option>
                  <option value="24h">24 小时</option>
                  <option value="72h">72 小时</option>
                </select>
              </label>
            ) : null}
            {imageHostProvider === 'smms' ? (
              <label className="field">
                SM.MS API Token
                <input
                  type="password"
                  value={smmsToken}
                  disabled={!imageHostEnabled}
                  placeholder={
                    settingsInfo?.imageHost?.hasSmmsToken
                      ? '已保存（留空则不改）'
                      : '从 sm.ms 免费注册获取'
                  }
                  onChange={(e) => {
                    setSmmsToken(e.target.value);
                  }}
                />
              </label>
            ) : null}
            {imageHostProvider === 'imgbb' ? (
              <label className="field">
                ImgBB API Key
                <input
                  type="password"
                  value={imgbbKey}
                  disabled={!imageHostEnabled}
                  placeholder={
                    settingsInfo?.imageHost?.hasImgbbKey
                      ? '已保存（留空则不改）'
                      : '从 api.imgbb.com 免费申请'
                  }
                  onChange={(e) => {
                    setImgbbKey(e.target.value);
                  }}
                />
              </label>
            ) : null}
            {imageHostProvider === 's3' ? (
              <div className="stack s3-fields">
                <label className="field">
                  Endpoint（可选）
                  <input
                    value={s3Endpoint}
                    disabled={!imageHostEnabled}
                    placeholder="https://oss-cn-shanghai.aliyuncs.com"
                    onChange={(e) => {
                      setS3Endpoint(e.target.value);
                    }}
                  />
                </label>
                <label className="field">
                  Region
                  <input
                    value={s3Region}
                    disabled={!imageHostEnabled}
                    placeholder="us-east-1"
                    onChange={(e) => {
                      setS3Region(e.target.value);
                    }}
                  />
                  <span className="field-hint">
                    阿里云 OSS 请填如 cn-shanghai
                  </span>
                </label>
                <label className="field">
                  Bucket
                  <input
                    value={s3Bucket}
                    disabled={!imageHostEnabled}
                    placeholder="my-public-images"
                    onChange={(e) => {
                      setS3Bucket(e.target.value);
                    }}
                  />
                </label>
                <label className="field">
                  目录前缀
                  <input
                    value={s3Prefix}
                    disabled={!imageHostEnabled}
                    placeholder="seedcast/images"
                    onChange={(e) => {
                      setS3Prefix(e.target.value);
                    }}
                  />
                </label>
                <label className="field">
                  自定义域名（可选）
                  <input
                    value={s3CustomDomain}
                    disabled={!imageHostEnabled}
                    placeholder="https://img.example.com"
                    onChange={(e) => {
                      setS3CustomDomain(e.target.value);
                    }}
                  />
                </label>
                <label className="field">
                  Access Key ID
                  <input
                    type="password"
                    value={s3AccessKeyId}
                    disabled={!imageHostEnabled}
                    placeholder={
                      settingsInfo?.imageHost?.hasS3AccessKeyId
                        ? '已保存（留空则不改）'
                        : ''
                    }
                    onChange={(e) => {
                      setS3AccessKeyId(e.target.value);
                    }}
                  />
                </label>
                <label className="field">
                  Secret Access Key
                  <input
                    type="password"
                    value={s3SecretAccessKey}
                    disabled={!imageHostEnabled}
                    placeholder={
                      settingsInfo?.imageHost?.hasS3SecretAccessKey
                        ? '已保存（留空则不改）'
                        : ''
                    }
                    onChange={(e) => {
                      setS3SecretAccessKey(e.target.value);
                    }}
                  />
                </label>
                <label className="field">
                  Session Token（可选）
                  <input
                    type="password"
                    value={s3SessionToken}
                    disabled={!imageHostEnabled}
                    placeholder={
                      settingsInfo?.imageHost?.hasS3SessionToken
                        ? '已保存（留空则不改）'
                        : '临时凭据使用'
                    }
                    onChange={(e) => {
                      setS3SessionToken(e.target.value);
                    }}
                  />
                </label>
                <label className="toggle-row">
                  <span>
                    <strong>强制 Path Style</strong>
                    <span className="field-hint">
                      MinIO / 部分 OSS 需要；阿里云一般可关
                    </span>
                  </span>
                  <input
                    type="checkbox"
                    role="switch"
                    checked={s3ForcePathStyle}
                    disabled={!imageHostEnabled}
                    onChange={(e) => {
                      setS3ForcePathStyle(e.target.checked);
                    }}
                  />
                </label>
              </div>
            ) : null}
            <div className="row">
              <button
                type="button"
                className="btn ghost"
                disabled={!client || !imageHostEnabled || testingImageHost}
                onClick={() => {
                  void (async () => {
                    if (!client) {
                      setImageHostTestMsg({
                        ok: false,
                        text: '未连接引擎，请先点右上角「重新连接」',
                      });
                      return;
                    }
                    setTestingImageHost(true);
                    setError(null);
                    setImageHostTestMsg({ ok: true, text: '正在上传测试图…' });
                    try {
                      const draft = buildImageHostPatch();
                      const res = await client.testImageHost(draft);
                      const text = `成功：${res.remoteUrl}${res.note ? `（${res.note}）` : ''}`;
                      setImageHostTestMsg({ ok: true, text });
                      setStatus(`测试上传成功：${res.remoteUrl}`);
                    } catch (err) {
                      const text =
                        err instanceof Error ? err.message : String(err);
                      setImageHostTestMsg({ ok: false, text });
                      setError(text);
                    } finally {
                      setTestingImageHost(false);
                    }
                  })();
                }}
              >
                {testingImageHost ? '测试中…' : '上传测试图'}
              </button>
              <button
                type="button"
                className="btn"
                disabled={!client || savingSettings}
                onClick={() => {
                  void (async () => {
                    if (!client) {
                      return;
                    }
                    setSavingSettings(true);
                    setError(null);
                    setImageHostTestMsg(null);
                    try {
                      const res = await client.updateSettings({
                        imageHost: buildImageHostPatch(),
                      });
                      const settingsRes = await client.settings();
                      setSettingsInfo(settingsRes.settings);
                      setSmmsToken('');
                      setImgbbKey('');
                      setS3AccessKeyId('');
                      setS3SecretAccessKey('');
                      setS3SessionToken('');
                      setStatus(res.settings.note);
                    } catch (err) {
                      setError(
                        err instanceof Error ? err.message : String(err),
                      );
                    } finally {
                      setSavingSettings(false);
                    }
                  })();
                }}
              >
                {savingSettings ? '保存中…' : '保存配置'}
              </button>
            </div>
            {imageHostTestMsg ? (
              <p
                className={
                  imageHostTestMsg.ok ? 'ok image-host-test-msg' : 'err image-host-test-msg'
                }
              >
                {imageHostTestMsg.text}
              </p>
            ) : (
              <p className="muted image-host-test-msg">
                测试会实际上传 1×1 像素图；ImgBB 若报 forbidden 多为网络拦截，可改 litterbox / S3。
              </p>
            )}
            <div className="hint-box">
              <strong>使用提示</strong>
              <ul>
                <li>需安装本机 Chrome（浏览器类平台扫码登录）</li>
                <li>账号会话与内容仅存本机；图床会把图片发到第三方（注意隐私）</li>
                <li>换机迁移：整包复制数据根目录（含 profiles / db / assets）</li>
                <li>自动化发布可能违反平台 ToS，风险自负</li>
              </ul>
            </div>
          </div>
        ) : null}
        </main>

        <footer className="statusbar">
          <span>本机 · Seedcast</span>
          <span className="statusbar-sep">·</span>
          <span>{status}</span>
          {meta ? (
            <>
              <span className="statusbar-sep">·</span>
              <span>
                {meta.host}:{meta.port}
              </span>
            </>
          ) : null}
        </footer>
      </div>
      {confirmDialog ? (
        <div
          className="confirm-backdrop"
          role="presentation"
          onClick={() => {
            setConfirmDialog(null);
          }}
        >
          <div
            className="confirm-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-title"
            aria-describedby="confirm-msg"
            onClick={(e) => {
              e.stopPropagation();
            }}
          >
            <h3 id="confirm-title">{confirmDialog.title}</h3>
            <p id="confirm-msg" className="muted">
              {confirmDialog.message}
            </p>
            <div className="row confirm-actions">
              <button
                type="button"
                className="btn secondary"
                onClick={() => {
                  setConfirmDialog(null);
                }}
              >
                取消
              </button>
              <button
                type="button"
                className="btn danger"
                onClick={() => {
                  const fn = confirmDialog.onConfirm;
                  setConfirmDialog(null);
                  fn();
                }}
              >
                {confirmDialog.confirmLabel ?? '确定'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
