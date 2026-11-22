/**
 * flow 模板变量替换
 *
 * @author Seedcast
 * @date 2026-11-21
 */

/**
 * 用 vars 替换 `{{key}}` / `{{a.b}}` 形式占位符
 *
 * @param input 模板字符串
 * @param vars 变量表（支持点路径）
 * @returns 替换后字符串
 * @author Seedcast
 * @date 2026-11-21
 */
export function renderTemplate(
  input: string,
  vars: Record<string, unknown>,
): string {
  return input.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_all, path: string) => {
    const value = lookup(vars, path);
    if (value === undefined || value === null) {
      return '';
    }
    return String(value);
  });
}

/**
 * 按点路径取值
 *
 * @param vars 根对象
 * @param path 如 settings.foo
 * @returns 值或 undefined
 */
function lookup(vars: Record<string, unknown>, path: string): unknown {
  const parts = path.split('.');
  let cur: unknown = vars;
  for (const part of parts) {
    if (cur === null || cur === undefined || typeof cur !== 'object') {
      return undefined;
    }
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}
