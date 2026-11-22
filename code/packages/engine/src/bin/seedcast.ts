#!/usr/bin/env node
/**
 * Seedcast CLI：通过本机 HTTP API 编排内容 / 账号 / 发布 / 记录
 *
 * 用法示例：
 *   seedcast ping
 *   seedcast plugins list
 *   seedcast accounts list [--plugin zhihu]
 *   seedcast contents create --title "标题" --body "正文"
 *   seedcast publish --content <id> --target zhihu:<accountId>
 *
 * @author Seedcast
 * @date 2026-11-22
 */

import { readFileSync } from 'node:fs';
import {
  LocalApiClient,
  type PublishTargetInput,
} from '../client/localApi.js';

/**
 * 打印 JSON 到 stdout
 *
 * @param data 任意可序列化数据
 */
function printJson(data: unknown): void {
  process.stdout.write(`${JSON.stringify(data, null, 2)}\n`);
}

/**
 * 解析 `--key value` / `--flag` 形式参数
 *
 * @param argv 参数列表（不含命令）
 * @returns 位置参数与选项
 */
function parseArgs(argv: string[]): {
  positionals: string[];
  options: Record<string, string | boolean>;
} {
  const positionals: string[] = [];
  const options: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token.startsWith('--')) {
      const key = token.slice(2);
      const next = argv[i + 1];
      if (!next || next.startsWith('--')) {
        options[key] = true;
      } else {
        options[key] = next;
        i += 1;
      }
    } else {
      positionals.push(token);
    }
  }
  return { positionals, options };
}

/**
 * 读取字符串选项
 *
 * @param options 选项表
 * @param key 键
 * @returns 字符串或 undefined
 */
function optStr(
  options: Record<string, string | boolean>,
  key: string,
): string | undefined {
  const v = options[key];
  if (typeof v === 'string' && v.length > 0) {
    return v;
  }
  return undefined;
}

/**
 * 解析 --target plugin:account 列表（可重复）
 *
 * @param argv 原始 argv（含重复 --target）
 * @returns 目标列表
 */
function parseTargets(argv: string[]): PublishTargetInput[] {
  const targets: PublishTargetInput[] = [];
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] !== '--target') {
      continue;
    }
    const raw = argv[i + 1];
    if (!raw) {
      throw new Error('--target 需要 pluginId:accountId');
    }
    const colon = raw.indexOf(':');
    if (colon <= 0 || colon === raw.length - 1) {
      throw new Error(`--target 格式应为 pluginId:accountId，收到: ${raw}`);
    }
    targets.push({
      pluginId: raw.slice(0, colon),
      accountId: raw.slice(colon + 1),
      settings: {},
    });
    i += 1;
  }
  return targets;
}

/**
 * 帮助文案
 *
 * @returns 文本
 */
function helpText(): string {
  return `Seedcast CLI — 编排本机引擎发布链路

用法:
  seedcast <command> [subcommand] [options]

命令:
  ping                         健康检查
  plugins list                 已加载插件
  accounts list [--plugin id]  账号列表
  accounts check --plugin id --account id
                               检测登录态
  contents list                内容列表
  contents get <id>            内容详情
  contents create --title T (--body MD | --file path) [--type article]
                               创建内容
  contents delete <id>         删除内容
  publish --content id --target plugin:account [--target ...]
                               发布（消费 SSE，输出聚合结果）
  records list [--limit N] [--plugin id] [--failed]
                               发布记录

环境:
  SEEDCAST_DATA_DIR            数据目录（默认读 ~/.seedcast-config.json 或 ~/.seedcast）
  SEEDCAST_PORT / SEEDCAST_TOKEN [/ SEEDCAST_HOST]
                               可选，覆盖 engine.json

说明:
  需先启动引擎（桌面端或 pnpm --filter @seedcast/engine start）。
  MCP 入口见: seedcast-mcp（stdio）。
`;
}

/**
 * CLI 主流程
 *
 * @author Seedcast
 * @date 2026-11-22
 */
async function main(): Promise<void> {
  // pnpm/npm 常用 `pnpm seedcast -- ping`，会把单独的 `--` 传进 argv，需剥掉
  const argv = process.argv.slice(2).filter((token) => {
    return token !== '--';
  });
  if (argv.length === 0 || argv[0] === '-h' || argv[0] === '--help') {
    process.stdout.write(helpText());
    return;
  }

  const command = argv[0];
  const rest = argv.slice(1);
  const { positionals, options } = parseArgs(rest);

  if (command === 'help') {
    process.stdout.write(helpText());
    return;
  }

  const client = LocalApiClient.connect();

  // ping
  if (command === 'ping') {
    const meta = client.getMeta();
    const ping = await client.ping();
    printJson({ meta: { host: meta.host, port: meta.port, pid: meta.pid }, ping });
    return;
  }

  // plugins list
  if (command === 'plugins') {
    const sub = positionals[0] ?? 'list';
    if (sub !== 'list') {
      throw new Error(`未知子命令: plugins ${sub}`);
    }
    printJson(await client.listPlugins());
    return;
  }

  // accounts
  if (command === 'accounts') {
    const sub = positionals[0] ?? 'list';
    if (sub === 'list') {
      printJson(await client.listAccounts(optStr(options, 'plugin')));
      return;
    }
    if (sub === 'check') {
      const plugin = optStr(options, 'plugin');
      const account = optStr(options, 'account');
      if (!plugin || !account) {
        throw new Error('accounts check 需要 --plugin 与 --account');
      }
      printJson(await client.checkSession(plugin, account));
      return;
    }
    throw new Error(`未知子命令: accounts ${sub}`);
  }

  // contents
  if (command === 'contents') {
    const sub = positionals[0];
    if (!sub || sub === 'list') {
      printJson(await client.listContents());
      return;
    }
    if (sub === 'get') {
      const id = positionals[1];
      if (!id) {
        throw new Error('contents get 需要 <id>');
      }
      printJson(await client.getContent(id));
      return;
    }
    if (sub === 'create') {
      const title = optStr(options, 'title');
      if (!title) {
        throw new Error('contents create 需要 --title');
      }
      let markdown = optStr(options, 'body');
      const file = optStr(options, 'file');
      if (file) {
        markdown = readFileSync(file, 'utf8');
      }
      if (typeof markdown !== 'string') {
        throw new Error('contents create 需要 --body 或 --file');
      }
      printJson(
        await client.createContent({
          title,
          markdown,
          contentType: optStr(options, 'type') ?? 'article',
        }),
      );
      return;
    }
    if (sub === 'delete') {
      const id = positionals[1];
      if (!id) {
        throw new Error('contents delete 需要 <id>');
      }
      printJson(await client.deleteContent(id));
      return;
    }
    throw new Error(`未知子命令: contents ${sub}`);
  }

  // publish
  if (command === 'publish') {
    const contentId = optStr(options, 'content');
    if (!contentId) {
      throw new Error('publish 需要 --content <id>');
    }
    const targets = parseTargets(argv.slice(1));
    if (targets.length === 0) {
      throw new Error('publish 至少需要一个 --target pluginId:accountId');
    }
    const verbose = options.verbose === true;
    const result = await client.publish(
      { contentId, targets },
      verbose
        ? (event) => {
            process.stderr.write(
              `[${event.type}] ${event.message ?? ''}${event.data ? ` ${JSON.stringify(event.data)}` : ''}\n`,
            );
          }
        : undefined,
    );
    printJson({
      ok: result.finished && result.errors.length === 0,
      finished: result.finished,
      successCount: result.successes.length,
      errorCount: result.errors.length,
      successes: result.successes,
      errors: result.errors,
      events: result.events,
    });
    if (result.errors.length > 0) {
      process.exitCode = 1;
    }
    return;
  }

  // records
  if (command === 'records') {
    const sub = positionals[0] ?? 'list';
    if (sub !== 'list') {
      throw new Error(`未知子命令: records ${sub}`);
    }
    const limitRaw = optStr(options, 'limit');
    printJson(
      await client.listRecords({
        limit: limitRaw ? Number(limitRaw) : undefined,
        plugin: optStr(options, 'plugin'),
        failedOnly: options.failed === true ? true : undefined,
      }),
    );
    return;
  }

  throw new Error(`未知命令: ${command}\n\n${helpText()}`);
}

main().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  process.stderr.write(`${msg}\n`);
  process.exitCode = 1;
});
