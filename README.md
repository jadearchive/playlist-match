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

访问统计尚未实现。网页只比较歌单元数据，不提供歌曲音频下载。仅公开歌单不保证都能读取，特别是 Spotify；完整性不确定时应保留提示。未列入映射表的歌手别名、歌曲译名和简繁体暂不自动合并。
