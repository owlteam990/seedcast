# @seedcast/app

React + Vite GUI + Tauri 2 壳（账号 / 发布 / 插件）。

## 浏览器开发（手动起引擎）

```bash
# 终端 1
cd code
pnpm --filter @seedcast/engine start

# 终端 2
pnpm --filter @seedcast/app dev
```

打开 http://127.0.0.1:5173 。Vite 中间件读取 `~/.seedcast/engine.json`。

## Tauri 开发（壳可自动拉起引擎）

```bash
cd code
pnpm --filter @seedcast/engine build   # 需先有 dist/cli.js
pnpm --filter @seedcast/app tauri:dev
# 或：pnpm dev:tauri
```

壳命令：
- `ensure_engine`：探测 `/ping`，失败则 `node packages/engine/dist/cli.js`
- `get_engine_meta`：读 `engine.json`
