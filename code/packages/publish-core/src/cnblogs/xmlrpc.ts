/**
 * 精简 XML-RPC 客户端（博客园 MetaWeblog）
 *
 * @author Seedcast
 * @date 2026-11-23
 */

export type XmlRpcValue =
  | string
  | number
  | boolean
  | Date
  | XmlRpcValue[]
  | { [key: string]: XmlRpcValue };

/**
 * XML 特殊字符转义
 *
 * @param s 原文
 * @returns 转义后
 */
function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * 序列化单个 XML-RPC 值
 *
 * @param value 值
 * @returns XML 片段
 */
function serializeValue(value: XmlRpcValue): string {
  if (typeof value === 'string') {
    return `<value><string>${escapeXml(value)}</string></value>`;
  }
  if (typeof value === 'boolean') {
    return `<value><boolean>${value ? 1 : 0}</boolean></value>`;
  }
  if (typeof value === 'number') {
    if (Number.isInteger(value)) {
      return `<value><int>${value}</int></value>`;
    }
    return `<value><double>${value}</double></value>`;
  }
  if (value instanceof Date) {
    const iso = value.toISOString().replace(/\.\d{3}Z$/, '');
    return `<value><dateTime.iso8601>${iso}</dateTime.iso8601></value>`;
  }
  if (Array.isArray(value)) {
    const data = value.map((v) => serializeValue(v)).join('');
    return `<value><array><data>${data}</data></array></value>`;
  }
  const members = Object.entries(value)
    .map(([k, v]) => {
      return `<member><name>${escapeXml(k)}</name>${serializeValue(v)}</member>`;
    })
    .join('');
  return `<value><struct>${members}</struct></value>`;
}

/**
 * 构建 methodCall 请求体
 *
 * @param method 方法名
 * @param params 参数列表
 * @returns XML
 */
export function buildXmlRpcRequest(
  method: string,
  params: XmlRpcValue[],
): string {
  const paramXml = params
    .map((p) => `<param>${serializeValue(p)}</param>`)
    .join('');
  return `<?xml version="1.0"?>\n<methodCall><methodName>${escapeXml(
    method,
  )}</methodName><params>${paramXml}</params></methodCall>`;
}

/**
 * 取第一个子标签文本
 *
 * @param xml 片段
 * @param tag 标签
 * @returns 文本或 null
 */
function firstTagText(xml: string, tag: string): string | null {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i');
  const m = xml.match(re);
  return m ? m[1].trim() : null;
}

/**
 * 解析 fault
 *
 * @param xml 响应
 * @returns 错误或 null
 */
function parseFault(xml: string): Error | null {
  if (!/<fault>/i.test(xml)) {
    return null;
  }
  const faultString =
    firstTagText(xml, 'string') ||
    firstTagText(xml, 'faultString') ||
    'XML-RPC fault';
  const faultCode = firstTagText(xml, 'int') || firstTagText(xml, 'i4');
  const msg = faultCode
    ? `XML-RPC fault ${faultCode}: ${faultString}`
    : `XML-RPC fault: ${faultString}`;
  return new Error(msg);
}

/**
 * 提取第一个成对的 &lt;value&gt;…&lt;/value&gt; 内层（支持嵌套）
 *
 * @param xml 片段
 * @returns 内层或 null
 */
function extractBalancedValueInner(xml: string): string | null {
  const openRe = /<value(?:\s[^>]*)?>/i;
  const m = openRe.exec(xml);
  if (!m || m.index === undefined) {
    return null;
  }
  let i = m.index + m[0].length;
  let depth = 1;
  while (i < xml.length && depth > 0) {
    const nextOpen = xml.slice(i).search(/<value(?:\s[^>]*)?>/i);
    const nextClose = xml.slice(i).search(/<\/value>/i);
    if (nextClose < 0) {
      return null;
    }
    if (nextOpen >= 0 && nextOpen < nextClose) {
      const openMatch = xml.slice(i).match(/<value(?:\s[^>]*)?>/i);
      i += (openMatch?.index || 0) + (openMatch?.[0].length || 0);
      depth += 1;
    } else {
      if (depth === 1) {
        return xml.slice(m.index + m[0].length, i + nextClose).trim();
      }
      i += nextClose + '</value>'.length;
      depth -= 1;
    }
  }
  return null;
}

/**
 * 解析简单 methodResponse（string / boolean / array of struct）
 *
 * @param xml 响应 XML
 * @returns 解析值
 */
export function parseXmlRpcResponse(xml: string): XmlRpcValue {
  const fault = parseFault(xml);
  if (fault) {
    throw fault;
  }

  const paramsBlock = xml.match(/<params>([\s\S]*?)<\/params>/i)?.[1];
  if (!paramsBlock) {
    throw new Error('无法解析 XML-RPC 响应');
  }
  const inner = extractBalancedValueInner(paramsBlock);
  if (inner === null) {
    throw new Error('无法解析 XML-RPC value');
  }
  return parseValueInner(inner);
}

/**
 * 解析 value 内部节点
 *
 * @param inner value 标签内 HTML/XML
 * @returns 值
 */
function parseValueInner(inner: string): XmlRpcValue {
  if (/^<string>/i.test(inner) || (!inner.startsWith('<') && inner.length > 0)) {
    const s = firstTagText(`<x>${inner}</x>`, 'string');
    if (s !== null) {
      return decodeXml(s);
    }
    if (!inner.startsWith('<')) {
      return decodeXml(inner);
    }
  }
  if (/^<boolean>/i.test(inner)) {
    const b = firstTagText(inner, 'boolean');
    return b === '1' || b === 'true';
  }
  if (/^<(int|i4)>/i.test(inner)) {
    const n = firstTagText(inner, 'int') || firstTagText(inner, 'i4');
    return Number(n);
  }
  if (/^<array>/i.test(inner)) {
    const dataMatch = inner.match(/<data>([\s\S]*)<\/data>/i);
    const data = dataMatch?.[1] || '';
    const values: XmlRpcValue[] = [];
    let rest = data;
    while (true) {
      const one = extractBalancedValueInner(rest);
      if (one === null) {
        break;
      }
      values.push(parseValueInner(one));
      const open = rest.search(/<value(?:\s[^>]*)?>/i);
      if (open < 0) {
        break;
      }
      // 跳过已消费的成对 value
      const openMatch = rest.slice(open).match(/<value(?:\s[^>]*)?>/i);
      let i = open + (openMatch?.[0].length || 0);
      let depth = 1;
      while (i < rest.length && depth > 0) {
        const nextOpen = rest.slice(i).search(/<value(?:\s[^>]*)?>/i);
        const nextClose = rest.slice(i).search(/<\/value>/i);
        if (nextClose < 0) {
          break;
        }
        if (nextOpen >= 0 && nextOpen < nextClose) {
          const om = rest.slice(i).match(/<value(?:\s[^>]*)?>/i);
          i += (om?.index || 0) + (om?.[0].length || 0);
          depth += 1;
        } else {
          i += nextClose + '</value>'.length;
          depth -= 1;
        }
      }
      rest = rest.slice(i);
    }
    return values;
  }
  if (/^<struct>/i.test(inner)) {
    const obj: Record<string, XmlRpcValue> = {};
    const memberRe = /<member>([\s\S]*?)<\/member>/gi;
    let m: RegExpExecArray | null;
    while ((m = memberRe.exec(inner)) !== null) {
      const block = m[1];
      const name = firstTagText(block, 'name');
      const valueInner = extractBalancedValueInner(block);
      if (name && valueInner !== null) {
        obj[name] = parseValueInner(valueInner);
      }
    }
    return obj;
  }
  // 无类型包装的裸字符串
  return decodeXml(inner.replace(/<[^>]+>/g, '').trim());
}

/**
 * 解码 XML 实体
 *
 * @param s 文本
 * @returns 解码后
 */
function decodeXml(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

/**
 * 调用 XML-RPC
 *
 * @param endpoint URL
 * @param method 方法
 * @param params 参数
 * @returns 解析结果
 */
export async function xmlRpcCall(
  endpoint: string,
  method: string,
  params: XmlRpcValue[],
): Promise<XmlRpcValue> {
  const body = buildXmlRpcRequest(method, params);
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/xml; charset=utf-8',
      Accept: 'text/xml',
    },
    body,
  });
  const text = await res.text();
  if (!res.ok) {
    if (res.status === 500 && !text.trim()) {
      throw new Error(
        `HTTP 500（空响应）。请核对 MetaWeblog 访问地址中的博客名是否正确，且已开通博客：${endpoint}`,
      );
    }
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
  return parseXmlRpcResponse(text);
}
