# Seedcast（飞播）

开源、免费、纯本地的多平台内容发布桌面工具：一份内容，像种子一样播撒到多个创作平台。

- **许可证**：[Apache License 2.0](./LICENSE)（允许商用，需保留版权与变更声明）
- **仓库**：https://github.com/owlteam990/seedcast  
  > 第一版完成前仅本地开发，**暂不推送到 GitHub**。
- **数据目录**：`~/.seedcast/`（账号会话、SQLite、素材、插件；永不提交到仓库）

## 目录结构

```
code/
├── apps/desktop          # Tauri 2 + React GUI（后续）
├── packages/
│   ├── shared            # 共享类型与常量
│   ├── engine            # Node sidecar 引擎
│   └── plugin-sdk        # 插件 Adapter 契约
└── plugins/              # 官方平台插件
```

规划文档见工作区上级 `docs/`（需求文档、开发计划）。

## 开发

```bash
cd code
pnpm install
pnpm --filter @seedcast/shared build
pnpm --filter @seedcast/engine typecheck
```

依赖：Node 20+、pnpm 9+、本机已安装 Chrome。

## CLI / MCP（AI 编排）

引擎暴露本地 HTTP 后，可用同一 API 做脚本与 AI 代理：

```bash
# 先启动引擎
pnpm --filter @seedcast/engine start

# CLI（pnpm 传参用 --，脚本会忽略该分隔符）
pnpm seedcast -- ping
pnpm seedcast -- contents create --title "Demo" --body "hello"

# MCP stdio（Claude Desktop / Cursor 等）
pnpm mcp
```

说明见 [`packages/engine/MCP.md`](./packages/engine/MCP.md)。

## 不会提交到仓库的内容

日志、`~/.seedcast` 本地数据、SQLite 文件、临时测试脚本（`scripts/local/`、`*.local.*`）、测试报告与截图产物等——详见 `.gitignore`。
