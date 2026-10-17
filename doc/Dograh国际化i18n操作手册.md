# Dograh 国际化（i18n）操作手册

> 适用对象：`ui/` 前端多语种维护（新增中文条目同步、新增语种）
> 配套文档：`doc/Dograh代码改动后重建镜像与启动指南.md`

---

## 0. 原理与现状（先读这一段）

| 项 | 说明 |
|---|---|
| 框架 | `next-intl`，**cookie 驱动**，**无 URL 路由**（`/overview` 不变，语言靠 `DOGRAH_LOCALE` cookie） |
| 唯一源语言 | **`zh-CN`（中文）**——你只维护中文，其他语种由中文机翻/人工补 |
| 消息文件 | `ui/messages/{zh-CN,en}.json`，嵌套 JSON（24 个命名空间 / 1939 逻辑 key / 约 2555 条 leaf） |
| 启用语种登记 | `ui/src/i18n/config.ts` 的 `locales` 数组 + `localeLabels` 映射（**红线，见第 3 节**） |
| 语言切换 UI | `ui/src/components/LocaleSwitcher.tsx`，**完全由 `config.ts` 驱动**，改 config 即自动出现新选项 |
| 后端透传文案 | 节点 spec、模型配置、电话 metadata 等英文来自后端运行时，`ui/src/i18n/schemaText.ts` 做「英文→中文」映射，未命中回退英文 |

---

## 1. 场景一：新增中文条目后，同步到其他语种

### 1.1 先判断是哪种文案

- **A 类：普通页面文案**（按钮、标题、提示语等本来就在 `messages/*.json` 里）
  → 直接在 `ui/messages/zh-CN.json` 加 key，再走 1.2 同步。
- **B 类：后端返回的英文描述**（节点名/描述、模型「采样温度」说明、电话中继/Cloudonix 文案等）
  → 除了在 `zh-CN.json` 加 key，还**必须**在 `ui/src/i18n/schemaText.ts` 的 `SCHEMA_TEXT` 增加「英文原文 → 中文」映射（见 1.3）。

### 1.2 A 类同步步骤（3 步）

**① 加中文 key**（保持与 `en.json` 同命名空间、同嵌套结构）

**② 选一种翻译方式**

- **CLI（推荐批量 / 可进 CI）**——只补「缺失」key，已存在的人工译文永不被覆盖：
  ```bash
  cd ui
  # 不指定语种 → 默认翻译 config.ts 注册的所有语种（除 zh-CN）。先看会翻多少：
  npm run trans-from-zh -- --dry-run
  # 正式：一次性同步所有已注册语种（zh-CN 里新增、其他语种缺失的才翻）
  npm run trans-from-zh
  # 只想翻某一个（覆盖默认）：
  npm run trans-from-zh -- en
  ```
  等价长命令：`node scripts/translate-locales.mjs`（不传语种即全量）。

- **编辑器插件 i18n Ally（推荐单人微调）**——已在 `ui/.vscode/settings.json` 配好（`sourceLanguage=zh-CN`，引擎 `google-cn` 免 key）：
  1. VS Code / Cursor 装「i18n Ally」扩展；
  2. 侧边栏打开 i18n Ally，缺译的 key 会标红；
  3. 右键目标语种（如 `en`）→ **Translate All**（或单独翻译某个 key）。

**③ 验证 → 提交 → 重建镜像**
```bash
cd ui
node -e "JSON.parse(require('fs').readFileSync('messages/en.json','utf8'));console.log('JSON OK')"
# 提交
git add ui/messages/ && git commit -m "i18n: 同步新增中文条目到 en"
```
> Docker 部署需重建 ui 镜像才能看到（见配套启动指南）。

### 1.3 B 类（后端透传文案）同步

编辑 `ui/src/i18n/schemaText.ts`，在 `SCHEMA_TEXT` 里按「英文原文 : 中文」加一行：
```ts
"Your new backend string from API.": "对应的中文翻译",
```
- `translateSchemaText(text)` 在 6 个渲染点（AddNodePanel / GenericNode / PropertyInput / SchemaFields / ConfigFormDialog / SetupChecklistCard）调用，未命中回退英文。
- **注意**：该映射目前只有「英文→中文」。其他语种（`en`/`ja`）下这部分文案会**回退显示英文**，除非后续把 `translateSchemaText` 改成按 locale 取多语种映射。纯中文环境无影响。

### 1.4 翻译引擎与命令参考

脚本 `ui/scripts/translate-locales.mjs` 默认走 `openai`，凭据全部走 env（**不硬编码**）：

| 引擎 | 环境变量 | 示例 |
|---|---|---|
| `openai`（默认） | `OPENAI_API_KEY`（可选 `OPENAI_BASE_URL` / `OPENAI_MODEL`） | `OPENAI_API_KEY=sk-xxx npm run trans-from-zh -- ja` |
| `deepl` | `DEEPL_API_KEY`（`xxx:fx` 走免费端点） | `TRANSLATE_ENGINE=deepl DEEPL_API_KEY=xxx npm run trans-from-zh -- en` |
| `aliyun` | `ALIYUN_ACCESS_KEY_ID` + `ALIYUN_ACCESS_KEY_SECRET`（需 `npm i -D @alicloud/pop-core`） | `TRANSLATE_ENGINE=aliyun ALIYUN_ACCESS_KEY_ID=... ALIYUN_ACCESS_KEY_SECRET=... npm run trans-from-zh -- ja` |

> 脚本特性：**只翻译缺失 key、保留人工译本、ICU 占位符 `{count}` 保护、plural/select 语法自动跳过并标记人工**（避免机翻毁掉 ICU 语法）。
> 若目标文件里 key 已存在（即使是空串），脚本会判定「已存在」而跳过——确认是真缺失再跑。

---

## 2. 场景二：新增一个语种（以日语 `ja` 为例）

### 步骤清单（6 步）

**① 登记语种（红线，必做两处）** —— `ui/src/i18n/config.ts`
```ts
// 第 9 行：加入 "ja"
export const locales = ["zh-CN", "en", "ja"] as const;

// 第 20-23 行：加入标签（用母语写法，永不翻译）
export const localeLabels: Record<Locale, string> = {
  "zh-CN": "简体中文",
  en: "English",
  ja: "日本語",
};
```
> `LocaleSwitcher` 会自动出现「日本語」选项，无需改 UI。

**② 新建消息文件** —— `ui/messages/ja.json`
- **要整语种全量翻译**：建一个空文件 `{}`。（已在 ① 登记到 `config.ts`，所以跑脚本不指定语种时 `ja` 会被自动覆盖，从 `zh-CN` 翻全部 key）：
  ```bash
  echo "{}" > ui/messages/ja.json
  cd ui && npm run trans-from-zh        # 不指定语种 → 含 ja 在内的所有已注册语种一起翻
  ```
- **想以英文为底盘再改**：`cp ui/messages/en.json ui/messages/ja.json`，但这样脚本会判定「已存在」而 0 翻译，需改用 i18n Ally 或手动覆盖。

**③ Dockerfile 无需改** —— `ui/Dockerfile` 第 42 行 `COPY ui/messages ./messages` 是整目录拷贝，`ja.json` 自动进镜像。
> 仅当你新增的是**顶层目录**（如新的 `public/xxx`）才需同步加 COPY 行；新增语种文件不算。

**④ 翻译** —— 同 1.2 / 1.4。因 ① 已在 `config.ts` 登记 `ja`，不指定语种即可一起翻：
```bash
cd ui
npm run trans-from-zh -- --dry-run   # 先看所有语种缺失量（含 ja）
npm run trans-from-zh                # 正式翻译（配引擎 env；ja 自动包含）
# 只想单独翻 ja 也可：npm run trans-from-zh -- ja
```

**⑤ 人工补 8 条 ICU / plural** —— 脚本会把含 `plural`/`select` 的 key 留空（或留中文占位）并列出，需手动在 `ja.json` 里补成日语的 `one`/`other` 分支，否则那几处会显示原文。

**⑥ 重建镜像 + 切换验证**
```bash
# 仓库根（api/ui 务必同源自建，别只 override 一个）
docker compose --profile tunnel up -d --build
```
浏览器点右上角语言切换，选「日本語」核对。

### 关键说明
- **只改 config 不建 `ja.json`** → `request.ts` 的 `import('../../messages/ja.json')` 运行时失败，**必须先建文件**。
- **后端透传文案（B 类）在 `ja` 下仍是英文 fallback**（除非扩展 `schemaText.ts` 做多语种映射），属已知限制。
- 新增语种后，`zh-CN.json` 若再增 key，直接 `npm run trans-from-zh`（无需列 ja）——脚本默认翻译 `config.ts` 注册的所有语种，新增语种自动被覆盖。

---

## 3. 红线 / 注意事项

1. **新增语种必改 `config.ts` 两处**（`locales` + `localeLabels`），否则不被识别、回退中文。
2. **翻译 key 不要硬编码进仓库**——全部走 `messages/*.json` + `schemaText.ts`。
3. **`next build` 会跑全量 `tsc` + ESLint**（`next.config.ts` 没设 `ignoreDuringBuilds`），而 `npm run dev` 不跑这两项。改完前端，**提交前本地先自查**：
   ```bash
   cd ui && ./node_modules/.bin/tsc --noEmit && ./node_modules/.bin/eslint .
   ```
   否则要等 docker 构建才暴露（前车之鉴：缺失 `</>`、漏 import 类型、`useTranslations` 误插回调）。
4. **api / ui 必须同源（同 commit）自建镜像**，只 override 一个服务会大面积 404。
5. 改完按你「改完即提交」的偏好及时 commit，防改动丢失。

---

## 4. 常用命令速查

| 目的 | 命令（均在 `ui/` 下） |
|---|---|
| 同步新增中文到所有语种（先看） | `npm run trans-from-zh -- --dry-run` |
| 同步新增中文到所有语种（执行） | `npm run trans-from-zh` |
| 仅同步到指定语种（覆盖默认） | `npm run trans-from-zh -- en` |
| 新增语种全量翻译（先建空文件+登记 config） | `echo "{}" > messages/ja.json && npm run trans-from-zh` |
| 换引擎翻译 | `TRANSLATE_ENGINE=deepl DEEPL_API_KEY=xxx npm run trans-from-zh -- en` |
| 校验 JSON 合法 | `node -e "JSON.parse(require('fs').readFileSync('messages/en.json','utf8'));console.log('OK')"` |
| 本地构建自查 | `./node_modules/.bin/tsc --noEmit && ./node_modules/.bin/eslint .` |
| 重建镜像 | 仓库根 `docker compose --profile tunnel up -d --build` |
