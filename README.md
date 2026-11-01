# 同频：独立部署版

比较两个公开歌单的歌名和歌手重合度。React 前端与 Node.js 后端同源部署；没有 ChatGPT/Sites 登录或运行时依赖，也不需要模型 API 密钥。

## 使用交接包中的预编译版本

安装 Node.js >=22.13.0，进入本目录后执行：

```sh
node server.mjs
```

打开 http://localhost:3000 。后端默认绑定 `0.0.0.0`，部署平台可通过 `PORT` 设置监听端口；本地若只需回环访问可设置 `HOST=127.0.0.1`。

## 从源码构建

```sh
npm install --include=dev --no-audit --no-fund
npm run build
npm start
```

GitHub 部署源码不一定包含 `public/assets/`。该目录由构建生成；完整交接包附带生成好的文件。

## 结构

- `client/Page.tsx`：已有页面、状态和导入/比较交互。
- `client/style.css`：网页样式，不依赖外部字体或 CSS CDN。
- `client/main.tsx`：浏览器入口。
- `lib/compare.mjs`：歌名归一化、合唱歌手、集合比较、CSV。
- `lib/importers.mjs`：QQ、网易云、Apple Music、Spotify 的公开元数据读取。
- `server.mjs`：Node 内置 HTTP 服务、静态资源和歌单 API。
- `public/`：HTML、favicon 和构建产物。
- `tests/`：核心计算及导入回归测试。

## 计算规则（2026-11-01 更新）

- 歌名重合率使用 Dice：`2 × 共同歌名数 / (A 去重歌名数 + B 去重歌名数)`。歌名仍忽略版本等标记。
- 歌手口味相似度使用歌曲占比分布：每首有效曲目总权重 1，由去重后的合唱歌手平分。各歌手权重除以该歌单总权重得到占比，最后将共同歌手在两边占比的较小值相加。范围 0–100%；两边均无有效数据时显示空值。一边为空时为 0。
- 歌手列表按相似度贡献排序；A/B 下方为共同歌手的歌曲占比。列表与 CSV 提供两边占比及贡献，便于核对。
- 别名表在 `lib/compare.mjs` 中，目前仅覆盖明确列出的八位歌手（周杰伦、陈奕迅、蔡依林、田馥甄、林俊杰、孙燕姿、蔡健雅、梁静茹）的已列别名，不做模糊匹配或组合成员展开。新增映射应先核对艺人身份。
- 歌手分布按已导入曲目记录计算，重复导入的行和不同版本均会影响占比；它反映收藏结构，不代表播放次数。完整性未确认时保留部分数据提示。

## HTTP API

```http
POST /api/playlist
Content-Type: application/json

{"url":"https://music.163.com/m/playlist?id=18550934080&creatorId=1484202069"}
```

成功返回 `title`、`platform`、`tracks`、`total`、`complete`、`warnings`。每个 track 含 title、artists 数组和平台 id。无效输入或上游读取失败返回非200及 error。`GET /healthz` 为健康检查。

## Render

创建 Node Web Service，推荐测试参数：

- Plan：Free。
- Region：Singapore，实际可用地域以账号控制台为准。
- Build：`npm install --include=dev --no-audit --no-fund && npm run build`。
- Start：`node server.mjs`。
- Health Check：`/healthz`。
- Node：22.13.0以上。可设 `NODE_VERSION=22.16.0`。

免费服务可能因闲置休眠，首次访问需要等待启动。不要未经用户同意升级付费计划。部署完成应再测试国内直连和手机微信访问。

## Docker

交接包包含预编译产物，可直接：

```sh
docker build -t playlist-match .
docker run --rm -p 3000:3000 playlist-match
```

Dockerfile 只复制运行所需的内置 Node 服务、lib 和已编译 public，不在容器内安装前端构建工具。从仅有源码的仓库构建 Docker 镜像前，应先生成 public/assets。

## 当前限制

网页只比较歌单元数据，不提供歌曲音频下载。仅公开歌单不保证都能读取，特别是 Spotify；完整性不确定时应保留提示。未列入映射表的歌手别名、歌曲译名和简繁体暂不自动合并。

## 私人访问统计（2026-11-01）

入口 `/stats`，需要后端验证查看密码。普通访客无法读取 `/api/analytics/summary`。登录使用 12 小时的签名会话、HttpOnly/Secure/SameSite=Strict Cookie、来源校验和登录限流。统计页不加载公共主页的上报脚本。

指标：页面访问次数 PV（每次打开或刷新），近似访客数 UV（同一浏览器 localStorage 标识去重），成功生成真实对比结果次数（同一页面内同一组已导入数据只计一次，示例不计入）。登录统计后的该浏览器访问与对比会被排除。支持累计、今天、近 7 天与近 30 天每日明细、CSV 导出，统一使用北京时间。

数据库保存事件 ID、类型、访客标识的 HMAC、页面随机 ID、服务端时间。不保存歌单、链接、原始 IP、User-Agent 或浏览记录。上报采用异步请求，数据库失效时不阻挡歌单页面；失败上报可能丢失。访客数是近似值，不能用来识别具体个人，也不是广告点击率。

运行统计需要 `npm ci --include=dev`（构建）或 `npm ci --omit=dev`（使用预编译产物），数据库驱动为 `pg`。将以下四项放进 Render 环境变量，保留现有其他变量：

- `ANALYTICS_DATABASE_URL`：Neon 生产分支的 pooled PostgreSQL URI，代码强制 TLS 证书验证；只在服务端使用。
- `ANALYTICS_ADMIN_HASH`：高强度随机查看密码的 SHA-256 十六进制摘要，不是明文密码。
- `ANALYTICS_SECRET`：独立随机密钥，至少 32 字符，用于会话签名及访客标识 HMAC。
- `ANALYTICS_ORIGIN`：网站完整 origin，例如 `https://tongpin-playlist-match.onrender.com`，末尾不加 `/`。

缺少配置时仅禁用统计，主页与歌单读取仍可运行。统计表和索引由 `lib/analytics-store.mjs` 中版本化 SQL 幂等初始化；新建库应先在独立测试分支验证，再配置生产分支。重启、休眠和重新部署 Render 不会清除 Neon 中的数据。

查看密码文件只在用户的本地交付目录中，不能提交到仓库、打进公开交接包或写到前端。更换密码时更新摘要，并同时轮换签名密钥以使旧会话失效。Neon 免费方案受配额与提供商政策约束，不自动升级付费计划；可通过统计页面导出汇总数据。
