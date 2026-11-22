/**
 * 本机引擎 HTTP 客户端（CLI / MCP 共用）
 *
 * @author Seedcast
 * @date 2026-11-22
 */

import type { ProgressEvent } from '@seedcast/shared';
import { discoverEngineMeta } from './discover.js';
import type { EngineMeta } from '../meta.js';

/** 发布目标 */
export interface PublishTargetInput {
  pluginId: string;
  accountId: string;
  settings?: Record<string, unknown>;
}

/** 发布聚合结果 */
export interface PublishAggregateResult {
  events: ProgressEvent[];
  successes: ProgressEvent[];
  errors: ProgressEvent[];
  finished: boolean;
}

/**
 * 本地 API 客户端
 */
export class LocalApiClient {
  /**
   * @param meta 引擎元信息
   */
  constructor(private readonly meta: EngineMeta) {}

  /**
   * 从本机发现并创建客户端
   *
   * @returns 客户端
   * @author Seedcast
   * @date 2026-11-22
   */
  static connect(): LocalApiClient {
    return new LocalApiClient(discoverEngineMeta());
  }

  /**
   * 当前连接元信息
   *
   * @returns 元信息副本
   */
  getMeta(): EngineMeta {
    return { ...this.meta };
  }

  /**
   * 基础 URL
   *
   * @returns http://host:port
   */
  get baseUrl(): string {
    return `http://${this.meta.host}:${this.meta.port}`;
  }

  /**
   * JSON 请求
   *
   * @param path 路径
   * @param init fetch 选项
   * @returns 解析后的 JSON
   * @author Seedcast
   * @date 2026-11-22
   */
  async json<T>(path: string, init?: RequestInit): Promise<T> {
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}${path}`, {
        ...init,
        headers: {
          Authorization: this.meta.token,
          'Content-Type': 'application/json',
          Accept: 'application/json',
          ...(init?.headers ?? {}),
        },
      });
    } catch (err) {
      const tip = err instanceof Error ? err.message : String(err);
      throw new Error(
        `无法连接引擎 ${this.meta.host}:${this.meta.port}（${tip}）。请确认引擎已启动`,
      );
    }
    const text = await res.text();
    let data: T & { ok?: boolean; error?: string };
    try {
      data = JSON.parse(text) as T & { ok?: boolean; error?: string };
    } catch {
      throw new Error(
        `引擎返回非 JSON（HTTP ${res.status}）: ${text.slice(0, 200)}`,
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
  ping(): Promise<Record<string, unknown>> {
    return this.json('/ping');
  }

  /**
   * 插件列表
   *
   * @returns 插件响应
   */
  listPlugins(): Promise<Record<string, unknown>> {
    return this.json('/plugins');
  }

  /**
   * 账号列表
   *
   * @param plugin 可选插件过滤
   * @returns 账号响应
   */
  listAccounts(plugin?: string): Promise<Record<string, unknown>> {
    const q = plugin ? `?plugin=${encodeURIComponent(plugin)}` : '';
    return this.json(`/accounts${q}`);
  }

  /**
   * 检测账号会话
   *
   * @param plugin 插件 ID
   * @param account 账号 ID
   * @returns 会话结果
   */
  checkSession(
    plugin: string,
    account: string,
  ): Promise<Record<string, unknown>> {
    const q = new URLSearchParams({ plugin, account });
    return this.json(`/accounts/session?${q.toString()}`);
  }

  /**
   * 内容列表
   *
   * @returns 内容响应
   */
  listContents(): Promise<Record<string, unknown>> {
    return this.json('/contents');
  }

  /**
   * 单条内容
   *
   * @param id 内容 ID
   * @returns 内容响应
   */
  getContent(id: string): Promise<Record<string, unknown>> {
    return this.json(`/contents/${encodeURIComponent(id)}`);
  }

  /**
   * 创建内容
   *
   * @param input 标题与正文
   * @returns 创建结果
   */
  createContent(input: {
    title: string;
    markdown: string;
    assets?: string[];
    contentType?: string;
  }): Promise<Record<string, unknown>> {
    return this.json('/contents', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  /**
   * 更新内容
   *
   * @param id 内容 ID
   * @param patch 补丁
   * @returns 更新结果
   */
  updateContent(
    id: string,
    patch: {
      title?: string;
      markdown?: string;
      assets?: string[];
      contentType?: string;
    },
  ): Promise<Record<string, unknown>> {
    return this.json(`/contents/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(patch),
    });
  }

  /**
   * 删除内容
   *
   * @param id 内容 ID
   * @returns 删除结果
   */
  deleteContent(id: string): Promise<Record<string, unknown>> {
    return this.json(`/contents/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  }

  /**
   * 发布记录
   *
   * @param opts 过滤
   * @returns 记录响应
   */
  listRecords(opts?: {
    limit?: number;
    plugin?: string;
    failedOnly?: boolean;
  }): Promise<Record<string, unknown>> {
    const q = new URLSearchParams();
    if (opts?.limit !== undefined) {
      q.set('limit', String(opts.limit));
    }
    if (opts?.plugin) {
      q.set('plugin', opts.plugin);
    }
    if (opts?.failedOnly === true) {
      q.set('failed', '1');
    } else if (opts?.failedOnly === false) {
      q.set('failed', '0');
    }
    const qs = q.toString();
    return this.json(`/records${qs ? `?${qs}` : ''}`);
  }

  /**
   * 发布并消费 SSE，聚合进度
   *
   * @param body contentId + targets
   * @param onEvent 可选进度回调
   * @returns 聚合结果
   * @author Seedcast
   * @date 2026-11-22
   */
  async publish(
    body: { contentId: string; targets: PublishTargetInput[] },
    onEvent?: (event: ProgressEvent) => void,
  ): Promise<PublishAggregateResult> {
    const targets = body.targets.map((t) => {
      return {
        pluginId: t.pluginId,
        accountId: t.accountId,
        settings: t.settings ?? {},
      };
    });

    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}/publish`, {
        method: 'POST',
        headers: {
          Authorization: this.meta.token,
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
        },
        body: JSON.stringify({ contentId: body.contentId, targets }),
      });
    } catch (err) {
      const tip = err instanceof Error ? err.message : String(err);
      throw new Error(`无法连接引擎发起发布（${tip}）`);
    }

    if (!res.ok || !res.body) {
      const text = await res.text();
      throw new Error(text || `发布失败 HTTP ${res.status}`);
    }

    const events: ProgressEvent[] = [];
    const successes: ProgressEvent[] = [];
    const errors: ProgressEvent[] = [];
    let finished = false;

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
          const event = JSON.parse(dataLine) as ProgressEvent;
          events.push(event);
          if (event.type === 'success') {
            successes.push(event);
          } else if (event.type === 'error') {
            errors.push(event);
          } else if (event.type === 'finish') {
            finished = true;
          }
          if (onEvent) {
            onEvent(event);
          }
        } catch {
          // 忽略残缺帧
        }
      }
    }

    return { events, successes, errors, finished };
  }
}
