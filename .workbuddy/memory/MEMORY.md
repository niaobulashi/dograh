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
- **rebase 上游后必查两件事**（2026-10-19 教训）：① 上一轮的 i18n 提交可能只补了 `zh-CN.json`、漏了 `en.json`，en 环境会直接渲染出 `Workflow.xxx` 原始键名；② 上游新增的 .tsx 全是硬编码英文，`i18n_run.mjs ... --preview` 一把扫出来。快速自检脚本思路：遍历 `src/**/*.ts(x)` 提取 `useTranslations("NS")` + `t("key")`，逐个查 `messages/{en,zh-CN}.json`，两边都要有。
- **后端透传文案用 `src/i18n/schemaText.ts` 的 `SCHEMA_TEXT`（英文原文→中文）**。原来 `translateSchemaText(text)` 不分语种一律翻中文（英文界面出现「提示词」），现已改为 `translateSchemaText(text, locale)`：locale 非 zh 直接返回原文；组件侧用 **`useSchemaText()` hook**（内部 `useLocale` + `useCallback`），纯函数里（如 GenericNode 的 `getBadgeForSpec`）把 `sch` 当参数传进去，不要在里面调 hook。
- **`next build` 会跑 tsc + eslint，`npm run dev` 不会**。合并上游后本地自查：`./node_modules/.bin/tsc --noEmit`、`./node_modules/.bin/eslint .`、`./node_modules/.bin/vitest run` 三个都过了再构建镜像。
- **`ui/vitest.setup.ts`（已提交，注册在 `vitest.config.mts` 的 setupFiles）**：mock `next-intl`，`useTranslations`/`useLocale` 在无 `NextIntlClientProvider` 时回退到 `messages/en.json`，有 provider 时走真实实现。上游新加的组件测试大多裸 render，没有这个 setup 会 231 个用例集体失败。`testTimeout: 15000` 是为了 ConfigurationFields 这类大组件在全量并发下超 5s。
- **en.json 的英文必须是上游原文**（不是把中文再翻回英文）：上游测试按原文断言，措辞/大小写（`Save changes` vs `Save Changes`、`split tracks` 小写、`Edit details for v{number}`）差一点就会红。

## 认证与「数据丢失」误报（2026-10-19）
- 本项目是 OSS 模式（`NEXT_PUBLIC_NODE_ENV=oss`），**没有 Stack Auth**，走自签 JWT：`api/utils/auth.py` 用 `OSS_JWT_SECRET`（`api/constants.py` 读 `os.getenv`，默认 `change-me-in-production`）+ HS256，payload `sub`=user_id、`email`，有效期 `OSS_JWT_EXPIRY_HOURS` 默认 720h（30 天）。
- **改 `.env` 里的 `OSS_JWT_SECRET` 会让所有已签发 token 立即失效**，前端拿到满屏 401，UI 列表渲染成空 —— 用户会以为「数据全丢了」。
- 判断数据是否真丢的正确姿势：`docker exec dograh-postgres-1 psql -U postgres -d postgres -c "select id,name,status from workflows"`，并看 `pg_sequences.last_value`（序列值没被重置就说明没 truncate/没删库）。
- 快速自证「API + 数据都正常」：容器内签个 token 再打接口
  `TOKEN=$(docker exec dograh-api-1 python -c "from api.utils.auth import create_jwt_token; print(create_jwt_token(1,'<email>'))")`
  `curl -H "Authorization: Bearer $TOKEN" http://localhost:8000/api/v1/workflow/fetch?status=active,archived`
- 关键接口是 `/api/v1/workflow/fetch|count|summary`（单数），`/api/v1/workflows` 是 404，别用它判断。
- 全量备份：`docker exec dograh-postgres-1 pg_dump -U postgres -Fc postgres > .backup/dograh-pg-$(date +%Y%m%d).dump`。

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
