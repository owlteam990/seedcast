/**
 * Vite 配置：开发期读取本机 engine.json 供 GUI 发现引擎
 *
 * @author Seedcast
 * @date 2026-11-21
 */

import { readFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * 开发中间件：GET /__seedcast/engine-meta → 本机 engine.json
 *
 * @returns Vite 插件
 */
function engineMetaPlugin(): Plugin {
  return {
    name: 'seedcast-engine-meta',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url !== '/__seedcast/engine-meta') {
          next();
          return;
        }
        const dataDir =
          process.env.SEEDCAST_DATA_DIR?.trim() ||
          join(homedir(), '.seedcast');
        const metaPath = join(dataDir, 'engine.json');
        if (!existsSync(metaPath)) {
          res.statusCode = 404;
          res.setHeader('Content-Type', 'application/json');
          res.end(
            JSON.stringify({
              ok: false,
              error: 'engine.json 不存在，请先启动引擎',
              metaPath,
            }),
          );
          return;
        }
        try {
          const meta = JSON.parse(readFileSync(metaPath, 'utf8')) as unknown;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ ok: true, meta, metaPath }));
        } catch (err) {
          res.statusCode = 500;
          res.end(
            JSON.stringify({
              ok: false,
              error: err instanceof Error ? err.message : String(err),
            }),
          );
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), engineMetaPlugin()],
  server: {
    port: 5173,
    strictPort: true,
  },
});
