/**
 * 按插件 schema.json 动态渲染发布设置
 *
 * @author Seedcast
 * @date 2026-11-21
 */

import type { ReactNode } from 'react';

export interface SchemaProperty {
  type?: string;
  title?: string;
  description?: string;
  enum?: Array<string | number>;
  enumLabels?: Record<string, string>;
  default?: unknown;
  /** 当其它字段等于某值时才显示 */
  'x-showWhen'?: Record<string, string | number>;
}

export interface JsonSchemaLite {
  title?: string;
  type?: string;
  properties?: Record<string, SchemaProperty>;
  required?: string[];
}

/**
 * 从 schema 生成默认 settings
 *
 * @param schema 插件 schema
 * @returns 默认值对象
 */
export function defaultsFromSchema(
  schema: JsonSchemaLite | null | undefined,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!schema?.properties) {
    return out;
  }
  for (const [key, prop] of Object.entries(schema.properties)) {
    if (prop.default !== undefined) {
      out[key] = prop.default;
    } else if (prop.enum && prop.enum.length > 0) {
      out[key] = prop.enum[0];
    } else if (prop.type === 'integer' || prop.type === 'number') {
      out[key] = 0;
    } else {
      out[key] = '';
    }
  }
  return out;
}

/**
 * 校验必填与简单约束
 *
 * @param schema schema
 * @param values 当前值
 * @returns 错误文案；通过返回 null
 */
export function validateSchemaValues(
  schema: JsonSchemaLite | null | undefined,
  values: Record<string, unknown>,
): string | null {
  if (!schema?.properties) {
    return null;
  }
  const required = new Set(schema.required ?? []);
  for (const [key, prop] of Object.entries(schema.properties)) {
    if (!isPropVisible(prop, values)) {
      continue;
    }
    const raw = values[key];
    const empty =
      raw === undefined ||
      raw === null ||
      (typeof raw === 'string' && raw.trim() === '');
    if (required.has(key) && empty) {
      return `请填写「${prop.title ?? key}」`;
    }
  }
  return null;
}

/**
 * 是否显示该字段
 *
 * @param prop 属性定义
 * @param values 当前 settings
 * @returns 是否可见
 */
function isPropVisible(
  prop: SchemaProperty,
  values: Record<string, unknown>,
): boolean {
  const when = prop['x-showWhen'];
  if (!when) {
    return true;
  }
  return Object.entries(when).every(([k, v]) => {
    return values[k] === v;
  });
}

/**
 * Schema 表单
 *
 * @param props schema 与受控值
 * @returns JSX
 */
export function SchemaForm(props: {
  schema: JsonSchemaLite | null | undefined;
  values: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
}): ReactNode {
  const { schema, values, onChange } = props;
  if (!schema?.properties || Object.keys(schema.properties).length === 0) {
    return <p className="muted">该插件无额外发布设置。</p>;
  }

  return (
    <div className="stack schema-form">
      {schema.title ? <h3 className="schema-title">{schema.title}</h3> : null}
      {Object.entries(schema.properties).map(([key, prop]) => {
        if (!isPropVisible(prop, values)) {
          return null;
        }
        const label = prop.title ?? key;
        const desc = prop.description;
        const value = values[key];

        if (prop.enum && prop.enum.length > 0) {
          return (
            <label key={key} className="field">
              {label}
              {desc ? <span className="field-hint">{desc}</span> : null}
              <select
                value={value === undefined || value === null ? '' : String(value)}
                onChange={(e) => {
                  const raw = e.target.value;
                  let next: unknown = raw;
                  if (prop.type === 'integer' || prop.type === 'number') {
                    next = Number(raw);
                  }
                  onChange({ ...values, [key]: next });
                }}
              >
                {prop.enum.map((opt) => {
                  const s = String(opt);
                  const text = prop.enumLabels?.[s] ?? s;
                  return (
                    <option key={s} value={s}>
                      {text}
                    </option>
                  );
                })}
              </select>
            </label>
          );
        }

        return (
          <label key={key} className="field">
            {label}
            {desc ? <span className="field-hint">{desc}</span> : null}
            <input
              value={value === undefined || value === null ? '' : String(value)}
              onChange={(e) => {
                onChange({ ...values, [key]: e.target.value });
              }}
            />
          </label>
        );
      })}
    </div>
  );
}
