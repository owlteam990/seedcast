/**
 * 博客园 MetaWeblog API 客户端
 *
 * @author Seedcast
 * @date 2026-11-23
 */

import type { CnblogsCredentials } from './credentials.js';
import { xmlRpcCall, type XmlRpcValue } from './xmlrpc.js';

export const CNBLOGS_RPC_ORIGIN = 'https://rpc.cnblogs.com';

/**
 * MetaWeblog 端点
 *
 * @param blogName 博客名
 * @returns URL
 */
export function cnblogsMetaWeblogEndpoint(blogName: string): string {
  return `${CNBLOGS_RPC_ORIGIN}/metaweblog/${encodeURIComponent(blogName.trim())}`;
}

/**
 * 草稿编辑页
 *
 * @param postId 文章 id
 * @returns URL
 */
export function cnblogsDraftEditUrl(postId: string): string {
  return `https://i.cnblogs.com/articles/edit;postid=${encodeURIComponent(postId)}`;
}

/**
 * 公开文章页（随笔）
 *
 * @param blogName 博客名
 * @param postId 文章 id
 * @returns URL
 */
export function cnblogsPostUrl(blogName: string, postId: string): string {
  return `https://www.cnblogs.com/${encodeURIComponent(blogName)}/p/${encodeURIComponent(postId)}.html`;
}

export interface CnblogsBlogInfo {
  blogid: string;
  url: string;
  blogName: string;
}

/**
 * blogger.getUsersBlogs — 校验令牌并取博客信息
 *
 * @param credentials 凭证
 * @returns 博客列表
 */
export async function getCnblogsUsersBlogs(
  credentials: CnblogsCredentials,
): Promise<CnblogsBlogInfo[]> {
  const endpoint = cnblogsMetaWeblogEndpoint(credentials.blogName);
  const raw = await xmlRpcCall(endpoint, 'blogger.getUsersBlogs', [
    '',
    credentials.username,
    credentials.token,
  ]);
  if (!Array.isArray(raw)) {
    throw new Error('getUsersBlogs 返回异常');
  }
  return raw.map((item) => {
    const row = item as Record<string, XmlRpcValue>;
    return {
      blogid: String(row.blogid ?? ''),
      url: String(row.url ?? ''),
      blogName: String(row.blogName ?? credentials.blogName),
    };
  });
}

/**
 * metaWeblog.newPost — 新建文章/草稿
 *
 * @param credentials 凭证
 * @param input 标题正文等
 * @returns postId
 */
export async function createCnblogsPost(
  credentials: CnblogsCredentials,
  input: {
    title: string;
    description: string;
    categories?: string[];
    keywords?: string;
    /** true=公开，false=草稿 */
    publish: boolean;
    blogid?: string;
  },
): Promise<string> {
  const endpoint = cnblogsMetaWeblogEndpoint(credentials.blogName);
  const categories = [...(input.categories || [])];
  // 博客园用分类标志位区分 Markdown
  if (!categories.some((c) => c === '[Markdown]')) {
    categories.unshift('[Markdown]');
  }
  const post: Record<string, XmlRpcValue> = {
    title: input.title,
    description: input.description,
    dateCreated: new Date(),
    categories,
  };
  if (input.keywords) {
    post.mt_keywords = input.keywords;
  }
  const blogid = input.blogid || 'blog';
  const raw = await xmlRpcCall(endpoint, 'metaWeblog.newPost', [
    blogid,
    credentials.username,
    credentials.token,
    post,
    input.publish,
  ]);
  return String(raw);
}
