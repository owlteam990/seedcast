/**
 * 核心领域类型（与 SQLite / 本地 API 对齐）
 *
 * @author Seedcast
 * @date 2026-11-21
 */

import type { SeedcastErrorCode } from './errors.js';

/**
 * 内容类型
 */
export type ContentType = 'article' | 'imageText' | 'video' | 'audio';

/**
 * 插件适配器类型
 */
export type AdapterKind = 'flow' | 'code';

/**
 * 插件来源
 */
export type PluginSource = 'builtin' | 'local' | 'registry';

/**
 * 任务状态
 */
export type TaskStatus = 'pending' | 'running' | 'done' | 'interrupted';

/**
 * 账号登录态
 */
export type AccountStatus = 'unknown' | 'logged_in' | 'expired';

/**
 * 内容库条目
 */
export interface Content {
  /** 内容 ID */
  id: string;
  /**
   * 内容类型
   * @see ContentType
   */
  contentType: ContentType;
  /** 标题 */
  title: string;
  /** Markdown 正文（图文则为描述） */
  markdown: string;
  /**
   * 素材列表：本地绝对路径、assets 文件名或公网图床 URL
   */
  assets: string[];
  /** 创建时间 ISO */
  createdAt: string;
  /** 更新时间 ISO */
  updatedAt: string;
}

/**
 * 平台账号
 */
export interface Account {
  /** 账号 ID */
  id: string;
  /** 插件 ID */
  pluginId: string;
  /** 展示名 / 昵称 */
  name: string;
  /** Chrome profile 目录 */
  profileDir: string;
  /** 最近登录态检测时间 */
  lastCheckAt: string | null;
  /**
   * 登录态
   * @see AccountStatus
   */
  status: AccountStatus;
}

/**
 * 发布目标
 */
export interface PublishTarget {
  /** 插件 ID */
  pluginId: string;
  /** 账号 ID */
  accountId: string;
  /** 平台设置（按插件 schema） */
  settings: Record<string, unknown>;
}

/**
 * 发布任务
 */
export interface Task {
  /** 任务 ID */
  id: string;
  /** 内容 ID */
  contentId: string;
  /** 目标列表 */
  targets: PublishTarget[];
  /**
   * 任务状态
   * @see TaskStatus
   */
  status: TaskStatus;
  /** 创建时间 ISO */
  createdAt: string;
}

/**
 * 单目标失败详情
 */
export interface ReceiptError {
  /** 错误码 */
  code: SeedcastErrorCode | string;
  /** 失败步骤名 */
  step?: string;
  /** 相关选择器键 */
  selector?: string;
  /** 截图路径 */
  screenshot?: string;
  /** 可读消息 */
  message?: string;
}

/**
 * 发布回执
 */
export interface Receipt {
  /** 所属任务 ID */
  taskId: string;
  /** 目标描述 */
  target: PublishTarget;
  /** 是否成功 */
  ok: boolean;
  /** 作品 URL（可提取时） */
  url?: string;
  /** 失败信息 */
  error?: ReceiptError;
  /** 完成时间 ISO */
  at: string;
}

/**
 * 插件 manifest（契约草案字段子集）
 */
export interface PluginManifest {
  /** 插件 ID */
  id: string;
  /** 显示名 */
  name: string;
  /** 语义化版本 */
  version: string;
  /** 契约版本 */
  apiVersion: number;
  /**
   * 适配器类型
   * @see AdapterKind
   */
  adapter: AdapterKind;
  /** 支持的内容类型 */
  contentTypes: ContentType[];
  /** 平台入口信息 */
  platform: {
    home: string;
    loginUrl: string;
    sessionCheck?: {
      url: string;
      loggedInSelector: string;
      /**
       * 可选：登录态 Cookie 名（如知乎 z_c0）；存在且非空则视为已登录。
       * 多个备选可用逗号分隔（如 CSDN: UserName,UserToken）。
       */
      loggedInCookie?: string;
      timeoutMs?: number;
    };
  };
  /** 能力声明 */
  capabilities?: {
    draft?: boolean;
    nativeSchedule?: boolean;
    /**
     * 平台可选发布类型（如知乎：提问题/发想法/写文章/发视频）
     */
    publishTypes?: Array<{ id: string; label: string }>;
    /**
     * 写文章时的正文导入方式（对应知乎编辑器「导入」）
     */
    articleImportModes?: Array<{ id: string; label: string }>;
  };
  /** 代码插件入口（adapter=code 时） */
  entry?: string;
}

/**
 * 已加载插件运行时记录
 */
export interface PluginRecord {
  /** manifest */
  manifest: PluginManifest;
  /** 插件目录绝对路径 */
  dir: string;
  /**
   * 来源
   * @see PluginSource
   */
  source: PluginSource;
  /** 是否启用 */
  enabled: boolean;
}

/**
 * SSE 进度事件类型
 */
export type ProgressEventType = 'info' | 'success' | 'error' | 'finish';

/**
 * 发布进度事件
 */
export interface ProgressEvent {
  /** 事件类型 */
  type: ProgressEventType;
  /** 任务 ID */
  taskId: string;
  /** 可选目标索引 */
  targetIndex?: number;
  /** 消息 */
  message?: string;
  /** 附加数据 */
  data?: unknown;
}
