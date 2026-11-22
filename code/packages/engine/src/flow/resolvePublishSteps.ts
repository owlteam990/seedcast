/**
 * 按 settings.publishType 解析实际执行的 flow 步骤
 *
 * @author Seedcast
 * @date 2026-11-21
 */

import type { FlowFile, FlowStep } from './types.js';

/** 默认发布类型（文章） */
export const DEFAULT_PUBLISH_TYPE = 'article';

/** 文章默认正文来源：编辑器填写 */
export const DEFAULT_ARTICLE_IMPORT = 'editor';

/**
 * 解析 flow.publishByType 的实际 key（文章可再按导入方式分流）
 *
 * @param settings 平台设置
 * @returns flow 键名
 * @author Seedcast
 * @date 2026-11-21
 */
export function resolveFlowKey(
  settings: Record<string, unknown>,
): string {
  const raw = settings.publishType;
  const publishType =
    typeof raw === 'string' && raw.trim().length > 0
      ? raw.trim()
      : DEFAULT_PUBLISH_TYPE;

  if (publishType !== 'article') {
    return publishType;
  }

  const importMode =
    typeof settings.articleImport === 'string' &&
    settings.articleImport.trim().length > 0
      ? settings.articleImport.trim()
      : DEFAULT_ARTICLE_IMPORT;

  if (importMode === 'wechatLink') {
    return 'article_wechatLink';
  }
  if (importMode === 'document') {
    return 'article_document';
  }
  return 'article';
}

/**
 * 解析发布步骤列表
 *
 * @param flow flow.json
 * @param settings 平台设置
 * @returns 步骤与选用的类型
 * @author Seedcast
 * @date 2026-11-21
 */
export function resolvePublishSteps(
  flow: FlowFile,
  settings: Record<string, unknown>,
): { publishType: string; steps: FlowStep[] } {
  const flowKey = resolveFlowKey(settings);

  // 1. 有分流表时按类型取
  if (flow.publishByType) {
    const typed = flow.publishByType[flowKey];
    if (!typed || typed.length === 0) {
      const supported = Object.keys(flow.publishByType).join(', ');
      throw new Error(
        `不支持的发布类型「${flowKey}」。可选: ${supported || '(无)'}`,
      );
    }
    return { publishType: flowKey, steps: typed };
  }

  // 2. 旧插件：仅 publish
  if (!flow.publish || flow.publish.length === 0) {
    throw new Error('flow.json 缺少 publish 步骤');
  }
  return { publishType: flowKey, steps: flow.publish };
}

/**
 * 收集步骤中引用的选择器键
 *
 * @param steps 步骤
 * @returns 键集合
 * @author Seedcast
 * @date 2026-11-21
 */
export function collectSelectorKeys(steps: FlowStep[]): Set<string> {
  const keys = new Set<string>();
  for (const step of steps) {
    if (step.selector) {
      keys.add(step.selector);
    }
  }
  return keys;
}
