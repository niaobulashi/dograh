# dograh 项目长期记忆

## 技术栈
- 后端 `api/`：Python + FastAPI + SQLAlchemy(async) + PostgreSQL + Redis/ARQ + MinIO
- 前端 `ui/`：Next.js 15 (App Router) + React 19 + TypeScript + Tailwind v4 + shadcn/Radix + zustand
- 文档 `docs/`：Mintlify（130 个 mdx），当前未配置多语言
- `pipecat/` 是 git submodule
- 已有 `README.zh-CN.md` / `README.ja-JP.md`，项目本身有多语言意图

## 前端国际化（i18n）约定 —— 阶段一方案
- 使用 **next-intl**，消息文件在 `ui/messages/{locale}.json`。
- **不使用 `app/[locale]/` URL 路由**（风险太高：40 个页面目录 + 417 个文件里的 link 引用 + 鉴权 middleware 冲突）。
- 语言通过 cookie `DOGRAH_LOCALE` 驱动，`ui/src/i18n/request.ts` 解析，`defaultLocale = "zh-CN"`。
- 翻译调用点一律用 `useTranslations(ns)`（Server / Client 组件均可）；async Server Component 用 `getTranslations(ns)`。
- 命名空间约定：`Common`（跨页面通用词）、`Nav`（侧边栏）、`Sidebar`、`Auth`，后续按页面加命名空间（如 `Overview`、`Campaigns`）。
- 组件里已有 `notranslate` / `translate="no"` 属性用于阻止浏览器自动翻译，保留不动。
- 新增文案必须同时补 `zh-CN.json` 和 `en.json`，键位保持一致。
- **i18n 覆盖已基本完成**（2026-10-14）：`messages/{zh-CN,en}.json` 各 24 命名空间 / 1939 key；346 个 tsx/ts 全量扫描后仅剩 `BigQuery`（专有名词，有意不译）。
- **`getTranslations` 仅限真正的 server 文件**（需 `import { getTranslations } from "next-intl/server"`）：目前只有 `app/layout.tsx`（generateMetadata）、`app/workflow/page.tsx`、`app/handler/[...stack]/page.tsx`。**"use client" 文件里一律用 `useTranslations`**，且必须声明在**组件/hook 顶层**，不能塞进事件回调或 `useEffect` 内部。
- **`ui/i18n-fragments/` 是死代码**（`src/i18n/request.ts` 只加载 `messages/${locale}.json`，全仓无引用），只维护 `messages/`。
- i18n 工具脚本（ui/ 根目录，未提交）：`i18n_run.mjs <file> [ns|auto] [--apply] [--nothrow]`（AST 提取替换）、`check_syntax2.mjs`（语法，`*.ts` 必须按 `ScriptKind.TS` 解析否则泛型被误判 JSX）、`check_t_defined.mjs`（`t` 是否在作用域内）、`check_t_dup.mjs`（同 block 重复 `const t`）。

## Docker 部署（用户本地就是走 Docker，不是 npm run dev）
- 启动：`docker-compose.yaml`（仓库根为构建上下文）。`ui` 服务**只有 image、没有 build 段**，默认拉 `dograhai/dograh-ui:latest`。
- 改代码要生效必须自建镜像：生成 `docker-compose.override.yaml`（`context: .` + `dockerfile: ui/Dockerfile`），再 `docker compose --profile tunnel up -d --build`。用户自己的 `doc/Dograh本地部署指南.md` 第七节记录了这套流程；`scripts/setup_remote.sh` 也生成同样配置。
- **`ui/Dockerfile` 的 builder 阶段是白名单 COPY**：新增任何前端顶层目录（如 `messages/`、`public/`）**必须同步加 COPY 行**，否则 `next build` 在 Docker 里会失败。runner 阶段只拷 `.next/standalone` + `.next/static` + `public`。
- CI `.github/workflows/docker-image.yml` 用同一份 `ui/Dockerfile`，context 也是仓库根。
- 前端容器基础镜像是 `node:22-alpine`（musl），lock 里必须包含 `-musl` 变体的原生可选依赖。
- **ui / api 必须同源构建**：只 override 一个服务、另一个搭官方 `:latest`，只要本地码领先于已发布镜像就会大面积 404（且 OPTIONS 返回 200、极具迷惑性）。官方 `dograhai/dograh-api:latest` 与 `ghcr.io/dograh-hq/dograh-api:latest` 都停留在 1.48.0（2026-10-02 构建），不含 2026-10-07 才入库的 model-connections 路由。
- 本地单人环境**不要并发构建 ui 和 api**（compose v5 用 Bake 并行），两个重构建同时跑会把 Docker VM 内存打满，apt 步骤被 OOM kill。
- **改 `.env` 里的环境变量后，`docker compose restart` 无效**（只重启旧容器、沿用旧 env）。必须 `docker compose --profile tunnel up -d <svc>` 触发 recreate；只有改源码才需要 `--build`。典型症状：报「api key invalid」但 .env 里明明是新 key —— 先 `docker inspect <容器> --format '{{range .Config.Env}}{{println .}}{{end}}'` 对比容器 env 与 `docker compose config` 解析结果。
- 模板生成（`WORKFLOW_TEMPLATE_GENERATOR=local`）走 `api/services/workflow/local_template_generator.py`，`DEEPSEEK_API_KEY/BASE_URL/MODEL` 在 `api/constants.py` import 时读一次 `os.getenv`，改值必须重启进程。
- **国内网络构建必须换源**，否则必然失败。已对 `api/Dockerfile` 打了 4 处 LOCAL PATCH（已实测）：
  1. builder 阶段 apt → `mirrors.tuna.tsinghua.edu.cn`（实测 1.0 MB/s vs 官方 20 kB/s，约 50x；换源后该层 44 秒跑通）
  2. `ENV UV_DEFAULT_INDEX` + `UV_INDEX_URL` → 清华 PyPI（实测 uv 0.13.0 命中 tuna，无弃用警告）
  3. ts-deps 阶段 `npm config set registry` → `registry.npmmirror.com`
  4. ffmpeg-static 阶段：apt 同上，且下载改为**镜像轮询**——`gh-proxy.com` → `ghfast.top` → GitHub 直连，每个源下完都过一遍 sha256 校验（sha256 是钉死的，走第三方源不影响供应链安全），`--max-time` 提到 900。原因：GitHub 直连只有 55 kB/s，35MB 的包在原来的 `--max-time 600` 内拉不完，重试 3 次也是死。
  回退方式：`git checkout api/Dockerfile`。

## 前端 next build 会因 lint / 类型错误阻断（不只是语法）
- `ui/next.config.ts` 未设 `eslint.ignoreDuringBuilds`，所以 `next build`（docker 构建跑的就是它）依次过：编译 → **tsc 类型检查** → **ESLint**。任何一环 error 都让构建失败，且 `npm run dev` 不会提前暴露（dev 不跑 tsc/lint）。
- i18n 改造引入的三类会阻断 build 的问题（已修复于 `68fab924` + `ef13f690`，但后人手动加 i18n 仍会复现）：
  1. import 排序：`simple-import-sort/imports` 设为 error，i18n 工具/手改把 `import { useTranslations } from 'next-intl'` 插在不合规位置就会报。修法：`eslint . --fix`（自动重排），或提交前跑 `npm run fix-lint`。
  2. **rules-of-hooks**：`useTranslations` 只能声明在组件/hook 顶层；插进普通函数、事件回调、`rows.map` 回调里会报 `react-hooks/rules-of-hooks` 且**运行时必崩**。修法：删内层重复 `t`，复用组件顶层 `t`（闭包可见）。
  3. 手写 SDK：`src/client/{sdk,types}.gen.ts` 手写追加端点时，必须在 `sdk.gen.ts` 顶部 import 对应的 `*Data`/`*Errors`/`*Responses` 类型（types.gen.ts 里已生成），否则 tsc 报 `Cannot find name`。
- 本地自查 build 就绪：`cd ui && ./node_modules/.bin/tsc --noEmit` 与 `./node_modules/.bin/eslint .` 都要 0 error（warning 如 `exhaustive-deps` 不阻断）。
- `eslint.config.mjs` 已忽略 `src/client/*`（生成文件）与 `i18n_run.mjs` 等 i18n 工具脚本（dev 工具，非 app 源码）。

## 本地 PG 连接（Navicat）
- 本机装了**原生 Windows PostgreSQL 18**：`E:\server\PostgreSQL\18`，服务名 `postgresql-x64-18`，占用 5432。
- Dograh 的 `dograh-postgres-1`（pgvector/pg17）**宿主端口已改为 5433**（`docker-compose.override.yaml` 用 `ports: !override` 覆盖；Compose 对 ports 默认是列表合并，必须用 `!override`）。
- Navicat 连接参数：主机 `127.0.0.1`、端口 **5433**、用户 `postgres`、库 `postgres`（只有这一个库，无独立 dograh 库）、SSL 关闭；密码 = 仓库根 `.env` 的 `POSTGRES_PASSWORD`（明文，非默认 postgres）。容器内仍是 5432，api 走 app-network 不受影响。

## 本机环境坑
- 在 `ui/` 下用 npm 新增依赖时，**必须加 `--ignore-scripts`**：esbuild 的 postinstall 会因沙箱拒绝 spawn 子进程而 code 1，导致 npm 整体回滚、`package.json` 写不进去。`npm warn cleanup [safe-delete][SAFE_DELETE_BULK_CONFIRM_REQUIRED]` 也是同一沙箱导致的清理告警（无害）。
- `ui/package-lock.json` 与 `ui/package.json` 版本号长期不同步（lock 1.47.0 vs package.json 1.48.0），任何 npm install 都会顺手把这个字段同步掉。判断"依赖是否漂移"要逐个包比对版本，不能只看 diff 行数。

## 用户偏好
- 不要替用户跑编译/构建，编译验证由用户自己完成。
- 倾向先给结论 + 分层对比表，再给改动清单（带文件路径）与可验证命令。
- 中文交流；i18n/locale 改动只动中文，其他语种先不动。
