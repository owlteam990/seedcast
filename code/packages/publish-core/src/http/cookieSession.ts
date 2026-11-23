/**
 * 从账号 Chrome profile 发起带 Cookie 的 HTTP（Playwright request）
 *
 * @author Seedcast
 * @date 2026-11-23
 */

import type { Cookie } from 'playwright';
import {
  closeProfileContext,
  openAccountContext,
} from '../session/chromeProfile.js';

/**
 * Cookie 列表 → Cookie 头
 *
 * @param cookies Cookie 列表
 * @returns 头字符串
 */
export function formatCookieHeader(cookies: Cookie[]): string {
  return cookies
    .filter((c) => typeof c.name === 'string' && c.name.length > 0)
    .map((c) => `${c.name}=${c.value}`)
    .join('; ');
}

function headersToRecord(
  headers: Headers | Record<string, string> | undefined,
): Record<string, string> {
  const out: Record<string, string> = {};
  if (!headers) {
    return out;
  }
  if (headers instanceof Headers) {
    headers.forEach((value, key) => {
      if (key.toLowerCase() === 'cookie') {
        return;
      }
      out[key] = value;
    });
    return out;
  }
  for (const [k, v] of Object.entries(headers)) {
    if (k.toLowerCase() === 'cookie') {
      continue;
    }
    out[k] = v;
  }
  return out;
}

/**
 * 在 persistent profile 上跑多次带 Cookie 的请求
 *
 * @param input profile 与工作函数
 * @returns 工作函数返回值
 */
export async function withProfileCookieSession<T>(input: {
  profileDir: string;
  cookieUrl: string;
  headless?: boolean;
  run: (api: {
    cookieHeader: string;
    cookies: Cookie[];
    landingUrl: string;
    landingHtml: string;
    fetch: (
      url: string,
      init?: RequestInit,
      extraHeaders?: Record<string, string>,
    ) => Promise<Response>;
  }) => Promise<T>;
}): Promise<T> {
  const context = await openAccountContext(input.profileDir, {
    headless: input.headless ?? true,
  });
  try {
    const page = context.pages()[0] ?? (await context.newPage());
    await page.goto(input.cookieUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 45000,
    });
    await page.waitForTimeout(2000);
    const landingUrl = page.url();
    // 落地 HTML：供头条等「API 失败时用页面文案判定登录」
    let landingHtml = '';
    try {
      landingHtml = await page.content();
      if (landingHtml.length > 200_000) {
        landingHtml = landingHtml.slice(0, 200_000);
      }
    } catch {
      landingHtml = '';
    }

    const cookiesForUrl = await context.cookies(input.cookieUrl);
    const allCookies = await context.cookies();
    const cookieHeader = formatCookieHeader(
      cookiesForUrl.length > 0 ? cookiesForUrl : allCookies,
    );
    if (!cookieHeader.trim() && allCookies.length === 0) {
      throw new Error('账号 profile 无可用 Cookie，请先完成浏览器登录');
    }

    const sessionFetch = async (
      url: string,
      init?: RequestInit,
      extraHeaders?: Record<string, string>,
    ): Promise<Response> => {
      const method = (init?.method ?? 'GET').toUpperCase();
      const headerObj = {
        ...headersToRecord(
          init?.headers as Headers | Record<string, string> | undefined,
        ),
        ...headersToRecord(extraHeaders),
      };
      const requestOptions: {
        headers: Record<string, string>;
        data?: string | Buffer;
        timeout?: number;
        failOnStatusCode?: boolean;
      } = {
        headers: headerObj,
        timeout: 60000,
        failOnStatusCode: false,
      };

      if (init?.body != null && method !== 'GET' && method !== 'HEAD') {
        if (typeof init.body === 'string') {
          requestOptions.data = init.body;
        } else if (Buffer.isBuffer(init.body)) {
          requestOptions.data = init.body;
        } else if (init.body instanceof URLSearchParams) {
          requestOptions.data = init.body.toString();
          if (!headerObj['content-type'] && !headerObj['Content-Type']) {
            headerObj['content-type'] =
              'application/x-www-form-urlencoded';
          }
        } else {
          const ab = await new Response(init.body).arrayBuffer();
          requestOptions.data = Buffer.from(ab);
        }
      }

      let apiRes;
      if (method === 'GET') {
        apiRes = await context.request.get(url, requestOptions);
      } else if (method === 'POST') {
        apiRes = await context.request.post(url, requestOptions);
      } else if (method === 'PUT') {
        apiRes = await context.request.put(url, requestOptions);
      } else if (method === 'DELETE') {
        apiRes = await context.request.delete(url, requestOptions);
      } else {
        apiRes = await context.request.fetch(url, {
          ...requestOptions,
          method,
        });
      }

      const status = apiRes.status();
      let buf = await apiRes.body();
      // Fetch Response 禁止 204/205/304 带 body，否则会抛 Invalid response status code
      if (status === 204 || status === 205 || status === 304) {
        buf = Buffer.alloc(0);
      }
      const resHeaders = new Headers();
      // set-cookie 可能含换行/多值，Fetch Headers 拒收；业务只读 body/status
      for (const [k, v] of Object.entries(apiRes.headers())) {
        if (k.toLowerCase() === 'set-cookie') {
          continue;
        }
        try {
          resHeaders.set(k, String(v).replace(/[\r\n]+/g, ' '));
        } catch {
          // 跳过非法头
        }
      }
      resHeaders.set('x-seedcast-final-url', apiRes.url());
      return new Response(buf, {
        status,
        statusText: apiRes.statusText(),
        headers: resHeaders,
      });
    };

    return await input.run({
      cookieHeader,
      cookies: allCookies,
      landingUrl,
      landingHtml,
      fetch: sessionFetch,
    });
  } finally {
    await closeProfileContext(input.profileDir);
  }
}
