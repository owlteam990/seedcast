# Seedcast MCP / CLI

AI 代理与脚本通过**同一套本地 HTTP API**编排发布，对引擎零侵入（结构对齐 [turbopush-mcp](https://github.com/xueyc1f/turbopush-mcp)）。

```
Claude / Cursor / 脚本
        │
        │  MCP stdio 或 CLI
        ▼
  seedcast-mcp / seedcast
        │
        │  HTTP + Token（读 ~/.seedcast/engine.json）
        ▼
  seedcast-engine @ 127.0.0.1
```

## 前置

1. 启动引擎（桌面端，或 `pnpm --filter @seedcast/engine start`）
2. 确认存在 `~/.seedcast/engine.json`（含 port / token）

可选环境变量：

| 变量 | 说明 |
|---|---|
| `SEEDCAST_DATA_DIR` | 数据目录 |
| `SEEDCAST_PORT` + `SEEDCAST_TOKEN` | 覆盖 engine.json（调试） |
| `SEEDCAST_HOST` | 默认 `127.0.0.1` |

## CLI

```bash
cd code
# pnpm 传参建议加 --（CLI 会自动忽略单独的 --）
pnpm seedcast -- help
pnpm seedcast -- ping
pnpm seedcast -- plugins list
pnpm seedcast -- accounts list --plugin zhihu
pnpm seedcast -- contents create --title "Hello" --body "# hi"
pnpm seedcast -- publish --content <id> --target zhihu:<accountId> --verbose
pnpm seedcast -- records list --limit 10
```

构建后也可：`node packages/engine/dist/bin/seedcast.js …`

## MCP（stdio）

### Claude Desktop / Claude Code

在 MCP 配置中增加：

```json
{
  "mcpServers": {
    "seedcast": {
      "command": "node",
      "args": [
        "/绝对路径/seedcast/code/packages/engine/dist/mcp/stdio.js"
      ]
    }
  }
}
```

开发期可用：

```json
{
  "mcpServers": {
    "seedcast": {
      "command": "pnpm",
      "args": ["--filter", "@seedcast/engine", "mcp"],
      "cwd": "/绝对路径/seedcast/code"
    }
  }
}
```

### Tools

| Tool | 说明 |
|---|---|
| `ping` | 引擎健康检查 |
| `list_plugins` | 已加载插件 |
| `list_accounts` | 账号列表 |
| `check_account_session` | 登录态检测 |
| `list_contents` / `get_content` | 内容库 |
| `create_content` / `update_content` / `delete_content` | 内容 CRUD |
| `publish` | 发布并等待 SSE 聚合结果 |
| `list_records` | 发布记录 |

推荐 AI 闭环：`create_content` → `list_accounts` → `publish` → `list_records`。

登录扫码仍需用户在桌面端 / 浏览器完成；MCP **不**代替人工验证码。

---

## Agent 调用示例（Cursor / Claude）

### 1. 在 Cursor 里挂上 MCP

项目或全局 MCP 配置（示例路径按本机修改）：

```json
{
  "mcpServers": {
    "seedcast": {
      "command": "node",
      "args": [
        "/Volumes/PRODSSD/project/multipublisher/code/packages/engine/dist/mcp/stdio.js"
      ]
    }
  }
}
```

开发期也可用：

```json
{
  "mcpServers": {
    "seedcast": {
      "command": "pnpm",
      "args": ["--filter", "@seedcast/engine", "mcp"],
      "cwd": "/Volumes/PRODSSD/project/multipublisher/code"
    }
  }
}
```

先 `pnpm --filter @seedcast/engine build`（用 dist 时），并确保 Seedcast 引擎已启动。Cursor Settings → MCP 中应看到 `seedcast` 及上述 tools。

### 2. 对 Agent 说的话（用户提示）

```text
用 Seedcast MCP 帮我发一篇文章：
1. 先 ping 确认引擎在线
2. 列出账号，选一个已登录的 CSDN 账号
3. 创建内容：标题「Agent 发布实测」，正文用 Markdown 写一段 200 字简介
4. 发布到该 CSDN 账号（草稿即可）
5. 查最近发布记录，告诉我成败和链接
```

### 3. Agent 应发起的 tool 序列（示意）

```text
1) ping
   → 确认 host/port、pluginsLoaded

2) list_accounts  { "plugin": "csdn" }
   → 取 status=logged_in 的 account.id，例如 acc_xxx

3) create_content
   {
     "title": "Agent 发布实测",
     "markdown": "## 简介\n\n……",
     "contentType": "article"
   }
   → 得到 content.id，例如 c7ab…

4) publish
   {
     "contentId": "c7ab…",
     "targets": [
       {
         "pluginId": "csdn",
         "accountId": "acc_xxx",
         "settings": {}
       }
     ]
   }
   → 等待 SSE 聚合；看 successCount / errors / url

5) list_records  { "limit": 5, "plugin": "csdn" }
   → 向用户汇报回执
```

知乎文章示例（settings 带发布类型）：

```json
{
  "contentId": "c7ab…",
  "targets": [
    {
      "pluginId": "zhihu",
      "accountId": "acc_zhihu",
      "settings": {
        "publishType": "article"
      }
    }
  ]
}
```

### 4. 程序里直接当 MCP Client 调（调试用）

在 `code/packages/engine` 目录：

```js
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const transport = new StdioClientTransport({
  command: 'node',
  args: ['dist/mcp/stdio.js'],
});
const client = new Client({ name: 'demo-agent', version: '0.0.1' });
await client.connect(transport);

await client.callTool({ name: 'ping', arguments: {} });

const created = await client.callTool({
  name: 'create_content',
  arguments: {
    title: 'Agent 发布实测',
    markdown: '# hello\n\nfrom MCP client',
    contentType: 'article',
  },
});
const contentId = JSON.parse(created.content[0].text).content.id;

await client.callTool({
  name: 'publish',
  arguments: {
    contentId,
    targets: [{ pluginId: 'csdn', accountId: '你的账号ID', settings: {} }],
  },
});

await client.close();
```

Agent 侧原则：先 `list_accounts` / `check_account_session`，确认 `logged_in` 再 `publish`；不要让 MCP 去完成扫码登录。