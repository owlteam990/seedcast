/**
 * 插件 Adapter 契约（草案 v1）
 *
 * @author Seedcast
 * @date 2026-11-21
 */

import type {
  Content,
  PluginManifest,
  ProgressEvent,
  PublishTarget,
  Receipt,
} from '@seedcast/shared';

/**
 * 发布任务上下文中的作业描述
 */
export interface PublishJob {
  /** 内容 */
  content: Content;
  /** 目标 */
  target: PublishTarget;
}

/**
 * 渲染结果（如公众号内联 HTML）
 */
export interface RenderedContent {
  /** 标题 */
  title: string;
  /** 渲染后正文 */
  body: string;
  /** 额外字段 */
  extras?: Record<string, unknown>;
}

/**
 * 适配器运行时上下文（Playwright Page 等在引擎侧注入，此处保持解耦）
 */
export interface AdapterContext {
  /** 账号展示名 */
  accountName: string;
  /** 素材根目录 */
  assetsDir: string;
  /**
   * 发送进度事件
   *
   * @param event 进度事件（可省略 taskId，由引擎补全）
   */
  emit: (event: Omit<ProgressEvent, 'taskId'> & { taskId?: string }) => void;
  /**
   * 平台页面句柄（由引擎注入；类型在接入 Playwright 后收紧）
   */
  page?: unknown;
}

/**
 * 代码插件 Adapter 契约
 */
export interface Adapter {
  /** 插件元信息 */
  meta: PluginManifest;
  /**
   * 检测登录态
   *
   * @param ctx 运行时上下文
   * @returns 是否已登录
   */
  checkSession(ctx: AdapterContext): Promise<boolean>;
  /**
   * 可选：内容渲染
   *
   * @param content 原始内容
   * @param settings 平台设置
   * @returns 渲染结果
   */
  render?(
    content: Content,
    settings: Record<string, unknown>,
  ): Promise<RenderedContent>;
  /**
   * 执行发布
   *
   * @param ctx 运行时上下文
   * @param job 发布作业
   * @returns 回执（可无 taskId，由引擎补全）
   */
  publish(
    ctx: AdapterContext,
    job: PublishJob,
  ): Promise<Omit<Receipt, 'taskId'> & { taskId?: string }>;
}
