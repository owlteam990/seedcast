# 知乎插件

- 状态：写文章支持导入 + 导入后补标题/发布设置。
- 实测日期：2026-11-21。

## 发布类型

| id | 标签 | 入口 |
|---|---|---|
| question | 提问题 | `/question/ask` |
| pin | 发想法 | 首页「+」→ 发想法 |
| article | 写文章 | `zhuanlan.zhihu.com/write` |
| video | 发视频 | `/zvideo/upload` |

## 写文章 · 导入

| articleImport | 说明 | 额外设置 |
|---|---|---|
| editor | 标题 + Markdown 写入编辑器 | topics / coverFile 可选 |
| wechatLink | 导入公众号链接 | `importUrl` 必填；导入后写标题、来源、发布设置 |
| document | 导入 MD/Doc | `importFile` 可选（缺省用正文生成 .md） |

## 导入后补全（关键）

知乎导入通常**只带正文**，标题与发布设置不会自动齐：

1. 用 Seedcast 内容标题写入标题框  
2. 点「发布」打开发布设置  
3. 封面：`coverFile` 上传，否则尝试从正文配图选一张  
4. 话题：`topics` 取第一个搜索选择  
5. 公众号导入：内容来源填 `importUrl`  
6. 点确认发布  

失败时有头模式保留 Chrome，勿关窗以便对照改 `articlePublish*` / `articleCover*` 选择器。

## 已知坑

- 封面、话题选择器随改版变化大。  
- 无图正文且无 `coverFile` 时，从正文选封面会失败。  
- 标题最长 100 字，请在 GUI 侧控制。  
