/**
 * 引擎 CLI 入口（骨架：打印数据目录与版本，后续接 HTTP 服务）
 *
 * @author Seedcast
 * @date 2026-11-21
 */

import { ENGINE_API_VERSION } from '@seedcast/shared';
import { createEngineMeta } from './meta.js';
import { ensureDataDirs, getDefaultDataDir } from './paths.js';

/**
 * 启动引擎骨架进程
 *
 * @author Seedcast
 * @date 2026-11-21
 */
async function main(): Promise<void> {
  // 1. 准备本地数据目录
  const dataDir = ensureDataDirs(getDefaultDataDir());

  // 2. 占位端口（后续改为随机可用端口 + HTTP 服务）
  const placeholderPort = 0;
  const meta = createEngineMeta(placeholderPort, dataDir);

  // 3. 输出启动摘要（开发期）
  console.log(
    JSON.stringify(
      {
        name: '@seedcast/engine',
        apiVersion: ENGINE_API_VERSION,
        dataDir,
        meta: {
          host: meta.host,
          port: meta.port,
          pid: meta.pid,
          startedAt: meta.startedAt,
          tokenPreview: `${meta.token.slice(0, 6)}…`,
        },
        status: 'skeleton',
        message: 'HTTP /ping 等将在后续里程碑接入',
      },
      null,
      2,
    ),
  );
}

main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
