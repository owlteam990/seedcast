# 微信公众号草稿发布 · 对接文档

> 版本：1.0（2026-11-21）
> 适用对象：需要把文章自动写进公众号草稿箱的其他程序 / 服务 / Agent
> 实现参考：`/Volumes/PRODSSD/project/multipublisher/docs/微信公众号发布/wechat_article_skills/wechat-draft-publisher/publisher.py`

---

## 0. 先说清楚能力边界

| 能做什么 | 不能做什么 |
|---|---|
| 上传封面拿到 `thumb_media_id` | 直接群发（需 `freepublish/submit`，且要认证服务号 + 审核） |
| 创建草稿（标题/作者/摘要/正文/封面） | 设置原创声明（草稿接口无此字段） |
| 回查草稿内容做校验 | 修改已发布文章 |
| 上传正文内图片并替换为微信 URL | 保证样式在所有微信版本一致（见 §5） |

**结论**：本文档描述的是"把内容高质量地送进草稿箱"，最后一步（发布/群发）仍由人在后台点。这是设计选择，不是能力缺失——自动群发风险太高，且需额外资质。

---

## 1. 系统组成

```
┌──────────────┐   Markdown    ┌─────────────────┐   HTML    ┌──────────────┐
│ 内容生成侧    │ ────────────► │ formatter       │ ────────► │ publisher    │
│ (人/Agent)   │               │ md → 微信HTML   │           │ 草稿 API     │
└──────────────┘               └─────────────────┘           └──────┬───────┘
                                                                     │
┌──────────────┐   900×383 JPG  ┌─────────────────┐                 │
│ 封面生成      │ ────────────► │ add_material    │ ──media_id──────┤
│ (Pillow)     │                └─────────────────┘                 │
└──────────────┘                                                     ▼
                                                          ┌──────────────────┐
                                                          │ draft/add        │
                                                          └────────┬─────────┘
                                                                   ▼
                                                          ┌──────────────────┐
                                                          │ draft/get 回查    │
                                                          └──────────────────┘
```

四个可独立复用的部件：

1. **formatter**：`markdown_to_html.py -i a.md -o a.html -t tech|minimal|business`
2. **cover**：Pillow 生成 900×383，另存一份 JPEG（体积小）
3. **publisher**：上传封面 + 创建草稿
4. **verifier**：`draft/get` 回查（强烈建议，见 §8）

---

## 2. 凭证与账号

### 2.1 配置文件

路径：`~/.wechat-publisher/config.json`

```json
{
  "appid": "wx****************",
  "appsecret": "****************"
}
```

- 权限必须是 `600`（`chmod 600`），因为 `appsecret` 等于该号的全部写入权限。
- `appid` 以 `wx` 开头、长度 18。
- **不要**把这份文件放进 git、日志、截图。

### 2.2 多账号（矩阵）

多个公众号 = 多组 AppID/AppSecret。切换时有两件事必须同时做，否则会串号：

1. 覆盖 `config.json`
2. **删除 `token_cache.json`**

> 血泪坑：token 缓存文件是全局单文件，不区分 appid。只换 config 不清缓存，接口会用 A 号的 token 往 B 号写，报 `40001`，且排查方向会被误导。

推荐做法：缓存文件名带上 appid 后缀，例如 `token_cache.<appid>.json`。

### 2.3 服务器 IP 白名单

微信要求调用方出口 IP 在后台白名单内：**设置与开发 → 基本配置 → IP白名单**。
未加白名单 → `40164`。云函数/容器出口 IP 会变，要固定 NAT 出口。

---

## 3. 四个官方接口

Base：`https://api.weixin.qq.com/cgi-bin`

### 3.1 获取 access_token

```
GET /token?grant_type=client_credential&appid={appid}&secret={secret}
```

返回：

```json
{"access_token": "72_xxx", "expires_in": 7200}
```

- 有效期 7200 秒，**提前 300 秒刷新**（不要卡点，网络抖动就会 42001）。
- 微信侧对新 token 的获取有频率限制，务必缓存，不要每次请求都取。
- 缓存结构建议：`{"access_token": "...", "expires_at": 1763720000, "appid": "wx..."}`

### 3.2 上传图片（封面 / 正文图通用）

```
POST /material/add_material?access_token={token}&type=image
Content-Type: multipart/form-data
字段名：media（文件名随意）
```

返回：

```json
{"media_id": "i_4i3F...", "url": "http://mmbiz.qpic.cn/..."}
```

- 封面用 `media_id`；正文内图片用返回的 `url` 替换 `<img src>`。
- 这是**永久素材**，会占用素材库配额（默认 5000 张），批量生产时要考虑清理。

### 3.3 创建草稿

```
POST /draft/add?access_token={token}
Content-Type: application/json; charset=utf-8
```

Body：

```json
{
  "articles": [{
    "title": "文章标题",
    "author": "创业者Hani",
    "digest": "摘要，最多120字节",
    "content": "<section>...</section>",
    "content_source_url": "",
    "thumb_media_id": "i_4i3F...",
    "show_cover_pic": 1,
    "need_open_comment": 0,
    "only_fans_can_comment": 0
  }]
}
```

返回：`{"media_id": "i_4i3F..."}`（草稿 id，不是发布 id）

### 3.4 回查草稿（校验用）

```
POST /draft/get?access_token={token}
Body: {"media_id": "草稿id"}
```

返回 `news_item[]`，含 `title / author / digest / content / thumb_media_id / url`。用它对字段做断言，见 §8。

---

## 4. 字段限制（硬约束）

| 字段 | 限制 | 超限行为 |
|---|---|---|
| `title` | 64 字符 / 192 字节 | 接口报错；需自行截断 |
| `author` | 20 字节（中文约 6 字） | 报错 |
| `digest` | 120 字节 | 报错 |
| `content` | HTML，≤ 2 万字符建议 | 过大易超时 |
| `thumb_media_id` | 必填 | 缺省报错 |

> 中文 1 字 = 3 字节（UTF-8）。"20 字节"≈ 6 个汉字，写"创业者Hani"刚好 13 字节。

---

## 5. HTML 规范（微信编辑器的脾气）

微信不接受 `<style>` 块、`class` 选择器、`flex/grid` 布局、渐变背景。所有样式必须**内联**，并且要能扛住编辑器的自动改写。

### 5.1 必须遵守

1. **全部内联**：`style="..."`，不要 `<style>`、不要 `class`。
2. **不要 flex/grid**：用 `<table>` 或 `display:inline-block`。
3. **带背景色的区块用 table 实现**：`<div style="background:...">` 在编辑器里会掉背景，要转成 `<table><tr><td style="background:...">`。
4. **加 `!important`**：`font-size / line-height / text-indent / margin` 尤其需要，否则被编辑器重置。
5. **禁用缩进**：根容器加 `text-indent: 0 !important`，否则微信默认首行缩进 2em。
6. **图片先上传**：正文里 `<img src="本地路径">` 必须先 `add_material` 换成 `mmbiz.qpic.cn` 的 URL，否则草稿里是坏图。
7. **代码块行宽 ≤ 52 字符**：手机端 375px 宽，25px 等宽字体大约 52 字符就换行，超了会横向溢出。
8. **表格慎用**：手机端三列表格会挤，两列表或"标签 + 值"的竖排更好读。

### 5.2 已知会被过滤/改写的属性

- `box-shadow`、`text-shadow`：丢弃
- `background: linear-gradient(...)`：丢弃（要渐变只能切成图片）
- `position: fixed/absolute`：失效
- `<section>` 会被加空行，建议输出 `<div>` 或 `<table>`
- 连续的空白/换行会被放大成空行，**提交前要压缩**

### 5.3 参考的压缩/修复顺序

```
1. 去掉封面 <img>（封面单独上传）
2. 正文本地图片 → 上传 → 替换 URL
3. 带 background 的 div/section → table
4. 压缩标签间空白：>\s+< → ><
5. 关键属性补 !important
6. 移除 box-shadow / text-shadow / linear-gradient
7. section → div
```

---

## 6. 封面规格

| 项 | 建议值 |
|---|---|
| 尺寸 | 900 × 383（2.35:1，公众号首图比例） |
| 格式 | JPG（PNG 也可，但体积大） |
| 体积 | ≤ 64 KB（压到 40–50 KB 更稳） |
| 文字安全区 | 左右各留 48–64 px，底部留 60 px |
| 字体 | 中文用系统字体渲染成图片，不要依赖前端字体 |

生成要点：Pillow 里 `width/radius` 必须是 `int`；半透明填充要用 `alpha_composite`，直接 `fill` 会把 alpha 替换成白块。

---

## 7. 标准调用时序

```python
# 1) 取 token（带缓存）
token = get_token(appid, secret)          # 缓存 expires_at - 300

# 2) 上传封面
media_id, _ = upload_image(cover_path, token, typ="image")

# 3) 处理正文里的本地图片（可选）
html = replace_local_images(html, token)

# 4) 清洗 HTML（见 §5.3）
html = wechat_sanitize(html)

# 5) 创建草稿
draft_id = draft_add(token, title, author, digest, html, media_id)

# 6) 回查校验
verify(draft_id, expected_title, expected_author)
```

顺序不能反：`thumb_media_id` 必须先有；`content` 里的图片必须在上传后替换。

---

## 8. 幂等与校验（建议每个程序都做）

**幂等**：`draft/add` 没有幂等键。重试会产生重复草稿。
做法：调用前用自己的 `request_id` 记录"已提交"，失败重试前先 `draft/get` 查不到再提交。

**校验**（必做）：拿到 `media_id` 后调 `draft/get`，断言：

```python
assert item["title"] == expected_title
assert item["author"] == expected_author
assert item["thumb_media_id"]            # 封面没丢
assert "关键段落锚点" in item["content"]  # 正文没被截断
```

> 这一步能抓住 90% 的"看起来成功其实写坏了"：标题被截断、封面丢失、正文被编辑器吃掉。

---

## 9. 错误码与重试

| 码 | 含义 | 处理 |
|---|---|---|
| 40001 | AppSecret 错 / token 与 appid 不匹配 | 检查凭证；**多号切换时清 token 缓存** |
| 40125 | 无效 appsecret | 核对后台 |
| 40164 | IP 不在白名单 | 加出口 IP |
| 42001 | token 过期 | 强制刷新一次后重试（**最多一次**） |
| 45009 | 调用超限 | 等次日；不要循环重试 |
| 47003 | 参数错误 | 查必填字段、字节长度 |
| 48001 | 接口未授权 | 账号类型不支持（订阅号无部分权限） |
| 40007 | media_id 无效 | 重新上传素材 |
| -1 | 系统繁忙 | 指数退避，最多 3 次 |

**重试原则**：网络错误可退避重试；业务错误不重试（除 42001 刷新一次）；重试前先确认没有产生草稿。

---

## 10. 对外接口设计（给其他程序调用）

推荐把上面封装成一个 HTTP 服务，而不是让每个程序自己调微信。

### 10.1 请求

```
POST /api/wechat/draft
Content-Type: application/json
```

```json
{
  "account": "hani",
  "title": "文章标题",
  "author": "创业者Hani",
  "digest": "摘要",
  "markdown": "# 正文...",
  "theme": "tech",
  "cover": {"path": "/abs/cover_compressed.jpg"},
  "options": {"show_cover_pic": 1, "need_open_comment": 0}
}
```

### 10.2 响应

```json
{
  "ok": true,
  "account": "hani",
  "draft_media_id": "i_4i3F...",
  "title": "文章标题",
  "verified": true,
  "elapsed_ms": 2410
}
```

失败：

```json
{"ok": false, "errcode": 40164, "message": "IP 不在白名单", "hint": "后台 → 基本配置 → IP白名单"}
```

### 10.3 账号路由

`account` → 一组 `{appid, appsecret, default_author, default_theme}`。凭证只存在服务端，调用方永远不接触 `appsecret`。

---

## 11. 最小可运行实现（不依赖本仓库）

```python
import json, time, requests, pathlib

BASE = "https://api.weixin.qq.com/cgi-bin"
CFG = pathlib.Path.home() / ".wechat-publisher/config.json"
CACHE = pathlib.Path.home() / ".wechat-publisher/token_cache.json"

def token():
    cfg = json.loads(CFG.read_text())
    if CACHE.exists():
        c = json.loads(CACHE.read_text())
        if c.get("appid") == cfg["appid"] and time.time() < c["expires_at"] - 300:
            return c["access_token"]
    r = requests.get(f"{BASE}/token", params={
        "grant_type": "client_credential",
        "appid": cfg["appid"], "secret": cfg["appsecret"]}, timeout=15).json()
    if "errcode" in r:
        raise RuntimeError(f'{r["errcode"]} {r.get("errmsg")}')
    CACHE.write_text(json.dumps({
        "access_token": r["access_token"],
        "expires_at": time.time() + r["expires_in"],
        "appid": cfg["appid"]}))
    return r["access_token"]

def upload_cover(path, tk):
    with open(path, "rb") as f:
        r = requests.post(f"{BASE}/material/add_material",
                          params={"access_token": tk, "type": "image"},
                          files={"media": (path.name, f, "image/jpeg")},
                          timeout=60).json()
    if r.get("errcode"):
        raise RuntimeError(r)
    return r["media_id"]

def draft_add(tk, title, author, digest, html, thumb):
    body = {"articles": [{
        "title": title, "author": author, "digest": digest,
        "content": html, "content_source_url": "",
        "thumb_media_id": thumb, "show_cover_pic": 1,
        "need_open_comment": 0, "only_fans_can_comment": 0}]}
    r = requests.post(f"{BASE}/draft/add",
                      params={"access_token": tk},
                      data=json.dumps(body, ensure_ascii=False).encode("utf-8"),
                      headers={"Content-Type": "application/json; charset=utf-8"},
                      timeout=30).json()
    if r.get("errcode"):
        raise RuntimeError(r)
    return r["media_id"]
```

---

## 12. 常见坑清单

1. **token 全局缓存串号**：多账号必须清缓存或按 appid 分文件。
2. **摘要超长被截断**：120 字节，中文约 40 字。
3. **作者超长报错**：20 字节，中文约 6 字。
4. **标题超 64 字符**：接口报错，要在调用前截断并记录原题。
5. **封面没上传就发**：`thumb_media_id` 为空直接失败。
6. **正文本地图片没替换**：草稿里是裂图，且微信后台不会提示。
7. **HTML 带 `<style>`**：整段样式失效，看起来"掉排版"。
8. **flex 布局**：公众号不支持，卡片会堆成一列。
9. **代码块太宽**：手机端横向溢出，读者体验崩，行宽压到 52 字符内。
10. **重试导致重复草稿**：`draft/add` 无幂等，重试前先查。
11. **素材库配额**：永久素材默认 5000 张，批量生产要定期清理。
12. **IP 白名单**：换服务器/换 NAT 出口立刻 40164。

---

## 13. 接入检查清单

- [ ] `config.json` 权限 600，未入库、未进日志
- [ ] 出口 IP 已加白名单
- [ ] token 缓存按 appid 隔离
- [ ] 标题/作者/摘要按字节截断
- [ ] 封面 900×383、JPG、≤64KB
- [ ] 正文图片已上传并替换 URL
- [ ] HTML 已过 sanitize（无 style 块、无 flex、!important 已加）
- [ ] 调用 `draft/get` 回查并通过断言
- [ ] 失败重试有上限，且不会产生重复草稿
- [ ] 双号切换流程有测试用例

---

## 14. 附：本次实现的可观测输出

一次成功的调用应打印类似：

```
✓ 配置加载成功 (AppID: wxb6ed***)
→ 正在上传图片: cover_compressed.jpg
✓ 图片上传成功 (media_id: i_4i3F...)
→ 正在处理内容中的图片...
✓ 已优化HTML格式（防止编辑模式样式错位）
→ 正在创建草稿: 文章标题
✓ 草稿创建成功!
  media_id: i_4i3F...
```

把这几行映射成结构化日志字段（`stage`、`media_id`、`elapsed_ms`），排查会快很多。
