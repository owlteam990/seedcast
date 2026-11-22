#!/usr/bin/env node
/**
 * Seedcast MCP Server（stdio）
 * Claude / Cursor 等通过 MCP 调用本机引擎发布链路（薄代理，零侵入）
 *
 * 架构：AI Client → seedcast-mcp (stdio) → HTTP → seedcast-engine (127.0.0.1)
 *
 * @author Seedcast
 * @date 2026-11-22
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { LocalApiClient } from '../client/localApi.js';

/**
 * 将任意结果包成 MCP text content
 *
 * @param data 数据
 * @returns CallToolResult 形状
 */
function textResult(data: unknown): {
  content: Array<{ type: 'text'; text: string }>;
} {
  return {
    content: [
      {
        type: 'text',
        text: typeof data === 'string' ? data : JSON.stringify(data, null, 2),
      },
    ],
  };
}

/**
 * 将错误包成 isError 结果
 *
 * @param err 错误
 * @returns CallToolResult
 */
function errorResult(err: unknown): {
  content: Array<{ type: 'text'; text: string }>;
  isError: true;
} {
  const msg = err instanceof Error ? err.message : String(err);
  return {
    content: [{ type: 'text', text: msg }],
    isError: true,
  };
}

/**
 * 懒连接本机引擎
 *
 * @returns 客户端
 */
function client(): LocalApiClient {
  return LocalApiClient.connect();
}

/**
 * 注册全部 tools 并启动 stdio
 *
 * @author Seedcast
 * @date 2026-11-22
 */
async function main(): Promise<void> {
  const server = new McpServer({
    name: 'seedcast',
    version: '0.0.1',
  });

  // --- 健康 / 插件 / 账号 ---
  server.registerTool(
    'ping',
    {
      title: 'Ping',
      description: '检查本机 Seedcast 引擎是否可达，返回端口与 apiVersion',
    },
    async () => {
      try {
        const c = client();
        const meta = c.getMeta();
        const ping = await c.ping();
        return textResult({
          meta: { host: meta.host, port: meta.port, pid: meta.pid },
          ping,
        });
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.registerTool(
    'list_plugins',
    {
      title: 'List Plugins',
      description: '列出已加载的平台插件及其内容类型与发布能力',
    },
    async () => {
      try {
        return textResult(await client().listPlugins());
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.registerTool(
    'list_accounts',
    {
      title: 'List Accounts',
      description: '列出本机已添加的平台账号；可按插件过滤',
      inputSchema: {
        plugin: z
          .string()
          .optional()
          .describe('插件 ID，如 zhihu / wechat-mp / csdn'),
      },
    },
    async ({ plugin }) => {
      try {
        return textResult(await client().listAccounts(plugin));
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.registerTool(
    'check_account_session',
    {
      title: 'Check Account Session',
      description: '检测指定账号登录态是否有效（logged_in / expired）',
      inputSchema: {
        plugin: z.string().describe('插件 ID'),
        account: z.string().describe('账号 ID'),
      },
    },
    async ({ plugin, account }) => {
      try {
        return textResult(await client().checkSession(plugin, account));
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  // --- 内容库 ---
  server.registerTool(
    'list_contents',
    {
      title: 'List Contents',
      description: '列出内容库中的文章 / 图文 / 视频',
    },
    async () => {
      try {
        return textResult(await client().listContents());
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.registerTool(
    'get_content',
    {
      title: 'Get Content',
      description: '按 ID 获取内容详情（含 markdown）',
      inputSchema: {
        id: z.string().describe('内容 ID'),
      },
    },
    async ({ id }) => {
      try {
        return textResult(await client().getContent(id));
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.registerTool(
    'create_content',
    {
      title: 'Create Content',
      description:
        '在内容库创建一篇内容。AI 写稿后调用本工具入库，再 publish 到各平台',
      inputSchema: {
        title: z.string().describe('标题'),
        markdown: z.string().describe('Markdown 正文'),
        contentType: z
          .enum(['article', 'imageText', 'video', 'audio'])
          .optional()
          .describe('内容类型，默认 article'),
        assets: z
          .array(z.string())
          .optional()
          .describe('可选素材文件名列表（相对 assets）'),
      },
    },
    async ({ title, markdown, contentType, assets }) => {
      try {
        return textResult(
          await client().createContent({
            title,
            markdown,
            contentType,
            assets,
          }),
        );
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.registerTool(
    'update_content',
    {
      title: 'Update Content',
      description: '更新已有内容的标题 / 正文 / 素材',
      inputSchema: {
        id: z.string().describe('内容 ID'),
        title: z.string().optional(),
        markdown: z.string().optional(),
        contentType: z
          .enum(['article', 'imageText', 'video', 'audio'])
          .optional(),
        assets: z.array(z.string()).optional(),
      },
    },
    async ({ id, title, markdown, contentType, assets }) => {
      try {
        return textResult(
          await client().updateContent(id, {
            title,
            markdown,
            contentType,
            assets,
          }),
        );
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.registerTool(
    'delete_content',
    {
      title: 'Delete Content',
      description: '删除内容库中的一条内容',
      inputSchema: {
        id: z.string().describe('内容 ID'),
      },
    },
    async ({ id }) => {
      try {
        return textResult(await client().deleteContent(id));
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  // --- 发布 / 记录 ---
  server.registerTool(
    'publish',
    {
      title: 'Publish',
      description:
        '将内容发布到一个或多个账号。等待 SSE 完成并返回成功/失败聚合。目标 settings 按各插件 schema 填写（如知乎 publishType）',
      inputSchema: {
        contentId: z.string().describe('内容库 ID'),
        targets: z
          .array(
            z.object({
              pluginId: z.string().describe('插件 ID'),
              accountId: z.string().describe('账号 ID'),
              settings: z
                .record(z.string(), z.unknown())
                .optional()
                .describe('平台 settings（可选）'),
            }),
          )
          .min(1)
          .describe('发布目标列表'),
      },
    },
    async ({ contentId, targets }) => {
      try {
        const result = await client().publish({ contentId, targets });
        return textResult({
          ok: result.finished && result.errors.length === 0,
          finished: result.finished,
          successCount: result.successes.length,
          errorCount: result.errors.length,
          successes: result.successes,
          errors: result.errors,
          events: result.events,
        });
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.registerTool(
    'list_records',
    {
      title: 'List Records',
      description: '查询发布记录与回执，可按插件 / 仅失败过滤',
      inputSchema: {
        limit: z.number().int().positive().max(200).optional(),
        plugin: z.string().optional().describe('插件 ID 过滤'),
        failedOnly: z
          .boolean()
          .optional()
          .describe('仅返回含失败回执的记录'),
      },
    },
    async ({ limit, plugin, failedOnly }) => {
      try {
        return textResult(
          await client().listRecords({ limit, plugin, failedOnly }),
        );
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  // stdio：日志只能打 stderr，避免污染协议
  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write(
    '[seedcast-mcp] ready (stdio → local engine HTTP)\n',
  );
}

main().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  process.stderr.write(`[seedcast-mcp] fatal: ${msg}\n`);
  process.exit(1);
});
