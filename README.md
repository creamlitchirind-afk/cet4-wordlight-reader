# 四级点词阅读器 · Wordlight Reader

一个面向碎片时间的英语阅读练习网站：导入文章和题目，点击影响理解的单词即可高亮；直接选择答案或标记“暂时不会”，再由连接的 AI 读取生词、原句和答题记录，继续讲解。

## 主要功能

- **阅读不中断**：正文、题干、选项中的英文单词均可点击，高亮状态跨材料同步；再次点击取消。
- **原句留存**：保存词形、上下文、材料 ID、点击次数与时间。
- **可交互题目**：识别题号与 A–D 选项，支持选择答案和“暂时不会”；点选项里的词不会触发鼠标选答。
- **持久化记录**：文章、生词和答案保存在 Cloudflare D1，页面刷新后可恢复。
- **AI 双向协作**：AI 可以导入阅读材料，读取生词和答案；本项目不内置大模型推理，也不要求填写模型 API Key。
- **材料导入**：TXT、Markdown、JSON 和手动粘贴；Markdown 当前按纯文本展示。
- **阅读界面**：暖白纸张、墨绿交互、琥珀高亮，适配桌面和手机。
- **同篇归组**：同一文章的碎片设置相同 `passageId`，每份碎片保留独立 `id`；新片段与新题按创建时间排在上方，旧题及答案仍可查看。
- **持续同步**：可见页面每15秒获取最新材料，切回页面或恢复联网时也会同步；“刷新材料”跳过缓存重新读取，不删除生词和答案。导入编辑期间暂停同步。

## 技术组成

React 19 / TypeScript / Vinext（Vite 上的 Next.js App Router 兼容实现）/ Tailwind CSS 4 / Cloudflare Workers 与 D1 / Drizzle ORM。

## 本地运行

需要 Node.js 22.13 或更高版本、npm 和 Git。Windows、macOS、Linux 均可。

```sh
npm ci
npm run build
npm run db:local
npm run dev
```

打开终端显示的本地地址，默认 `http://127.0.0.1:5173`。首次运行先构建，是为了生成 Wrangler 配置；`db:local` 将项目 SQL 迁移应用到本地 D1。后续通常只需 `npm run dev`。

```sh
npm run lint
npm run build
```

本地数据库位于被 Git 忽略的 `.wrangler/`。克隆仓库不会取得任何真实学习记录。修改表结构后运行 `npm run db:generate`，再构建并应用新增迁移。

## 导入格式

```json
{
  "title": "A very busy potato",
  "passageId": "potato-reading",
  "body": "A potato opened a library. Unfortunately, it could not read.",
  "questions": "1. What did the potato open?\nA) A library\nB) A school\nC) A shop\nD) A bank"
}
```

题号和每个选项分别占一行，推荐格式 `1. ...`、`A) ...`。仓库仅包含原创示例，不包含用户的真题库和答题数据。

## AI 接入

站点提供 `/mcp` JSON-RPC 路由，已用于 Sites 个人插件接入，暴露以下工具：

| 工具 | 用途 |
|---|---|
| `list_reading_documents` | 列出材料 |
| `get_reading_document` | 读取指定材料正文与题目 |
| `upsert_reading_document` | 导入或更新材料 |
| `list_unknown_words` | 读取生词和上下文 |
| `get_word_contexts` | 查询一个词的上下文 |
| `list_reading_answers` | 读取选择；`?` 表示暂时不会 |

连接后可对 AI 说：“导入这篇文章”“读取我刚才点亮的词”“检查第47题的选择”。AI 需要主动调用工具才能看到最新状态；网页不会持续向聊天推送数据。

当前协议包含 `server/discover`、`tools/list`、`tools/call`，不是已经验证兼容所有通用 MCP 客户端的实现。接入其他客户端时需要核对初始化与传输协议。

## 部署边界

当前版本面向**单用户、受访问控制的私密站点**。三个数据表通过固定 `site-owner` 使用同一份数据，应用 API 本身没有独立登录校验。生产部署依赖 Sites 的外层访问控制；不要将当前 API 无保护地公开，或直接用于多用户服务。公开源码不等于公开学习数据或线上应用。

`.openai/hosting.json` 保留 D1 与 MCP 能力声明，已移除原站点 ID。使用 Sites 部署时创建自己的项目和 D1；其他 Workers 部署需自行配置绑定、数据库迁移和访问控制。本仓库不包含原站点访问凭据。

## 目录

```text
app/reading-studio.tsx  阅读、点词、导入和答题界面
app/api/               材料、生词与答案接口
app/mcp/route.ts       AI 工具入口
db/                    数据模型与 D1 连接
drizzle/               数据库迁移
scripts/               构建、运行与本地数据库工具
docs/STARTER.md        基础模板的运行说明
```

## 当前限制

- 答案表保存最新选择，不保存完整修改历史；评估独立作答能力时，应另行保留首次答案与讲解后修改记录。
- 生词按词形匹配，没有自动词形还原；取消高亮会移除该词的当前记录。
- 题目解析采用约定的行格式，复杂题型和排版需要先整理。
- 模型讲解、评分与复习短文由外部 AI 完成，页面暂不自动批改。

## 来源与许可

项目基于 Vinext / Sites starter，随附第三方许可保留在 `vendor/` 和 `scripts/vite/`。基础模板文档保存在 `docs/STARTER.md`。此发布版未额外声明整个项目的开源许可证；公开查看源码不自动授予第三方重新许可权。
