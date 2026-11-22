/**
 * 引擎 CLI 入口：建库、加载插件、启动本地 HTTP
 *
 * @author Seedcast
 * @date 2026-11-21
 */

import { ENGINE_API_VERSION } from '@seedcast/shared';
import { getSchemaVersion, openDatabase } from './db/database.js';
import { startHttpServer } from './http/server.js';
import { generateToken, writeEngineMeta } from './meta.js';
import { readUserConfig } from './config/userConfig.js';
import { ensureDataDirs, getDefaultDataDir } from './paths.js';
import { loadAllPlugins } from './plugins/loader.js';
import { SerialQueue } from './queue/serialQueue.js';

/**
 * 解析数据目录：SEEDCAST_DATA_DIR > ~/.seedcast-config.json > 默认
 *
 * @returns 绝对路径
 * @author Seedcast
 * @date 2026-11-21
 */
function resolveDataDir(): string {
  const fromEnv = process.env.SEEDCAST_DATA_DIR;
  if (fromEnv && fromEnv.trim().length > 0) {
    return fromEnv.trim();
  }
  const fromFile = readUserConfig().dataDir;
  if (fromFile && fromFile.trim().length > 0) {
    return fromFile.trim();
  }
  return getDefaultDataDir();
}

/**
 * 启动引擎
 *
 * @author Seedcast
 * @date 2026-11-21
 */
async function main(): Promise<void> {
  // 1. 数据目录 + SQLite
  const dataDir = ensureDataDirs(resolveDataDir());
  const db = openDatabase(dataDir);
  const startedAt = new Date().toISOString();
  const token = generateToken();

  // 2. 扫描插件
  const pluginResult = loadAllPlugins({ dataDir });

  // 3. 启动 HTTP（127.0.0.1，随机端口）+ 全局串行队列
  const queue = new SerialQueue();
  const http = await startHttpServer({
    startedAt,
    token,
    db,
    pluginResult,
    dataDir,
    queue,
  });

  // 4. 持久化 engine.json 供 GUI / CLI 发现
  const meta = writeEngineMeta(
    { port: http.port, token, startedAt },
    dataDir,
  );

  // 5. 启动摘要
  console.log(
    JSON.stringify(
      {
        name: '@seedcast/engine',
        apiVersion: ENGINE_API_VERSION,
        schemaVersion: getSchemaVersion(db),
        dataDir,
        listen: `http://127.0.0.1:${http.port}`,
        plugins: pluginResult.plugins.map((p) => {
          return p.manifest.id;
        }),
        pluginErrors: pluginResult.errors,
        meta: {
          host: meta.host,
          port: meta.port,
          pid: meta.pid,
          startedAt: meta.startedAt,
          tokenPreview: `${meta.token.slice(0, 6)}…`,
        },
        status: 'running',
      },
      null,
      2,
    ),
  );

  // 6. 优雅退出
  const shutdown = async (): Promise<void> => {
    await http.close();
    db.close();
    process.exit(0);
  };
  process.on('SIGINT', () => {
    void shutdown();
  });
  process.on('SIGTERM', () => {
    void shutdown();
  });
}

main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
