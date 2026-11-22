/**
 * 从账号 Chrome profile 发起带会话的 HTTP 请求
 * 优先使用 Playwright context.request（自动携带完整 Cookie 罐，含跨子域 SSO）
 *
 * @author Seedcast
 * @date 2026-11-22
 */

import type { Cookie } from 'playwright';
import {
  closeProfileContext,
  openAccountContext,
} from '../session/pool.js';

/**
 * 将 Playwright Cookie 列表拼成 HTTP Cookie 头
 *
 * @param cookies Cookie 列表
 * @returns Cookie 头字符串
 */
export function formatCookieHeader(cookies: Cookie[]): string {
  return cookies
    .filter((c) => {
      return typeof c.name === 'string' && c.name.length > 0;
    })
    .map((c) => {
      return `${c.name}=${c.value}`;
    })
    .join('; ');
}

/**
 * Headers → 普通对象（供 Playwright request）
 *
 * @param headers Headers 或 Record
 * @returns 对象
 */
function headersToRecord(
  headers: Headers | Record<string, string> | undefined,
): Record<string, string> {
  const out: Record<string, string> = {};
  if (!headers) {
    return out;
  }
  if (headers instanceof Headers) {
    headers.forEach((value, key) => {
      // Cookie 交给 Playwright jar，避免手工头覆盖不全
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
 * 从 persistent profile 读取指定 URL 相关 Cookie，然后关闭 context
 *
 * @param input profile 与目标 URL
 * @returns Cookie 列表与 Cookie 头
 * @author Seedcast
 * @date 2026-11-22
 */
export async function readProfileCookies(input: {
  profileDir: string;
  /** 用于过滤 Cookie 的 URL（如 https://www.csdn.net） */
  url: string;
}): Promise<{ cookies: Cookie[]; cookieHeader: string }> {
  const context = await openAccountContext(input.profileDir, {
    headless: true,
  });
  try {
    // 1. 先导航到目标域，确保 profile 内会话可被读取
    const page = context.pages()[0] ?? (await context.newPage());
    await page.goto(input.url, {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });
    const cookies = await context.cookies(input.url);
    return {
      cookies,
      cookieHeader: formatCookieHeader(cookies),
    };
  } finally {
    await closeProfileContext(input.profileDir);
  }
}

/**
 * 带 profile Cookie 发起 fetch（每次独立打开/关闭 Chrome profile）
 *
 * @param input 请求参数
 * @returns Response
 * @author Seedcast
 * @date 2026-11-22
 */
export async function fetchWithProfileCookies(input: {
  profileDir: string;
  /** 读取 Cookie 时导航的 URL（通常与 API 同站或平台首页） */
  cookieUrl: string;
  /** 实际请求 URL */
  url: string;
  init?: RequestInit;
  /** 额外请求头（会覆盖同名头；Cookie 由 Playwright jar 注入） */
  headers?: Record<string, string>;
}): Promise<Response> {
  return withProfileCookieSession({
    profileDir: input.profileDir,
    cookieUrl: input.cookieUrl,
    run: async ({ fetch: sessionFetch }) => {
      return sessionFetch(input.url, input.init, input.headers);
    },
  });
}

/**
 * 在已打开的 profile context 上发起多次请求（发布流程复用）
 * 使用 Playwright APIRequestContext，自动带上浏览器 Cookie 罐。
 *
 * @param input profile 与工作函数
 * @returns 工作函数返回值
 * @author Seedcast
 * @date 2026-11-22
 */
export async function withProfileCookieSession<T>(input: {
  profileDir: string;
  cookieUrl: string;
  run: (api: {
    cookieHeader: string;
    cookies: Cookie[];
    /** 打开 cookieUrl 后最终落地的页面 URL */
    landingUrl: string;
    /** 打开 cookieUrl 后的页面 HTML（截断） */
    landingHtml: string;
    fetch: (
      url: string,
      init?: RequestInit,
      extraHeaders?: Record<string, string>,
    ) => Promise<Response>;
  }) => Promise<T>;
}): Promise<T> {
  const context = await openAccountContext(input.profileDir, {
    headless: true,
  });
  try {
    // 1. 进入目标站加载会话
    const page = context.pages()[0] ?? (await context.newPage());
    await page.goto(input.cookieUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 45000,
    });
    // 给 SPA / SSO 跳转一点时间
    await page.waitForTimeout(2000);
    const landingUrl = page.url();
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

    // 2. 用 Playwright request（共享 Cookie 罐，含跨子域 SSO）
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
          // ArrayBuffer / Blob 等：转 Buffer
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
      } else if (method === 'PATCH') {
        apiRes = await context.request.fetch(url, {
          ...requestOptions,
          method: 'PATCH',
        });
      } else {
        apiRes = await context.request.fetch(url, {
          ...requestOptions,
          method,
        });
      }

      const buf = await apiRes.body();
      const resHeaders = new Headers();
      const rawHeaders = apiRes.headers();
      for (const [k, v] of Object.entries(rawHeaders)) {
        resHeaders.set(k, v);
      }
      // 记录最终 URL，便于调用方识别重定向到登录页
      resHeaders.set('x-seedcast-final-url', apiRes.url());
      return new Response(buf, {
        status: apiRes.status(),
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
