# 020 — AI Provider 配置改为多行登记表（搜索 + 表格 + 分页 + Drawer）

> 基线：`feat/phase3-automation-ingest` 工作区（011加固–019 + skeleton 未提交改动之上），不得回滚任何未提交内容。不执行 git commit。
> 用户决策：本页是**配置登记处**，不是生效决策点。不给 AI 生成留默认配置——agent 侧配置上线前，生成入口降级为「请先配置」引导。无激活制、无 is_default。

## 0. 决策记录

- **D1 数据模型**：`aiProviderConfig` 从单例（固定主键 1 + singleton CHECK）改为普通多行表：
  - 新增 `id uuid PK default random`（替换 integer 固定主键）；删 singleton CHECK；删 `AI_PROVIDER_CONFIG_ID` 常量；`updatedBy` 保留 set null。
  - 迁移：存量那一行改写新 uuid 主键，数据无损。
  - 唯一性：不强制（允许同名重复登记）；updated_at 保留。
- **D2 后端接口**（`ai-provider-config.ts` 路由重写）：
  - `list`：`{ keyword?, page, pageSize }` → `{ rows: AiProviderConfigView[], total, page, pageSize }`；keyword 匹配 providerId/modelId/baseUrl（ilike，trim，max 64）。
  - `create` / `update`：输入 = 现 `saveInputSchema` 字段（update 加 `id`）；API Key 三态语义（keep/set/clear）照搬。
  - `delete`：按 id；仅二次确认在前端做。
  - **删除 `get` / `save`**；catalog 两个查询路由（listProviders/listModels）不动。
  - 视图 `AiProviderConfigView`：加 `id`，字段不变，绝不下发密钥。
- **D3 生成降级**（唯一行为变化，用户已拍板）：
  - `config-store.ts`：`resolveAiConfig()` 删除读库分支（单例行不复存在），只保留环境变量解析——库里有多行也不隐式挑任何一行（agent 侧未上线）。
  - `provider.ts`：`describeAiConfigProblem` 的 `unconfigured` 文案改为指向新登记页：「AI 未配置：请管理员在 AI 配置页登记 Provider，或在 agent 配置中选择可用的 Provider」。
  - 前端 `ai-generate-form.tsx`「AI 未配置」引导文案同步（链接指向 /ai-provider）。
  - `packages/db` 仓库层：`getAiProviderConfig`/`saveAiProviderConfig`（单例读写）删除，新增 `listAiProviderConfigs`（keyword+分页）、`insertAiProviderConfig`、`updateAiProviderConfig`、`deleteAiProviderConfig`；密文搬运边界注释保留。
- **D4 前端三层结构**（`/ai-provider` 页重写，参照 api-tokens 页与 017 的两层滚动结构）：
  1. 顶栏：搜索 Input（防抖 300ms，placeholder「搜索 provider / model / base URL」）+ 右侧「新建配置」按钮；两端与内容列 `px-4` gutter 对齐。
  2. 表格（复用 ui Table）：Provider · Model · Base URL · API Key（Badge：已配置/未配置）· 更新时间 · 更新人 · 操作（编辑 / 删除，删除走 AlertDialog 二次确认，样式参照 revoke-api-token-dialog）。
  3. 分页：照 `case-pagination.tsx` 现成模式（上一页/下一页 + 页码，aria-disabled 惯例），pageSize 10。
  - 空态/加载骨架对齐 case-table-states 惯例。
- **D5 Drawer**：创建**默认打开即是 drawer**（「新建配置」点击即开）；编辑共用同一个 drawer（ui 包 `sheet.tsx`，side=right）。drawer 内容 = 现 ProviderConfigForm 全套（019 的 combobox + base URL + API Key 三态 + 校验），改受控 open + 保存成功关闭 + 乐观失效 list 查询。旧 dialog/页面布局文件按需重写，ProviderConfigStatus 那块「当前生效配置」的展示随单例一起删除。
- **D6 视觉对齐硬规矩**（012/017 教训沉淀）：三层容器统一 `px-4` 水平内边距；层间距用外层 `gap-*` 不用各段自带垂直 padding；搜索框/按钮高度统一 h-8（default）；表格与分页条左右边缘与搜索行对齐。

## 1. 任务拆分（建议顺序）

### T1 db 层：schema 迁移 + repository
- `schema/ai.ts` 改表定义（uuid PK）；drizzle 生成迁移（`pnpm --filter @automationstack/db db:generate`），手工核对 SQL：改主键 + 迁移存量行 + 删 CHECK。
- repository 按本仓库既有风格写四个函数 + `toView` 等价物留在路由层。

### T2 ai 包：config-store/provider 降级改写
- 按 D3；`storeAiProviderConfig` 改造为 insert/update 语义（或拆两个函数）；测试如有涉及单例的断言同步。

### T3 api 路由重写
- 按 D2；旧 `get`/`save` 删除，检查全仓引用（orpc client 类型、web 端 queryOptions）一并清。

### T4 web 重写 `/ai-provider`
- 按 D4/D5：page/list/search/pagination/drawer 组件树；复用 019 的 CatalogPicker、api-key-field、base-url-field、provider-form-values 校验；路由文件沿用 017 的两层滚动结构。
- ai-generate-form 文案与链接按 D3。

## 2. 非目标

- agent 侧配置功能（另一个需求）。
- 不做 provider 连通性测试按钮、不做行内批量操作。
- 不动 api-tokens 页。

## 3. 验收

1. `pnpm check-types` / `pnpm test` 全绿；触碰文件 eslint 0 error、`pnpm check` 无新增；迁移 SQL 人工核对（改 PK、存量化、删 CHECK）。
2. grep：`AI_PROVIDER_CONFIG_ID`、`aiProviderConfig.get`、`aiProviderConfig.save` 全仓无引用残留。
3. db 起得来则冒烟：旧库迁移后原行还在（新 uuid）；新建两行 → list 分页/搜索生效；删除幂等。起不了如实标注。
4. dev server 3999 编译通过；页面交互留人工（重点：三层对齐、drawer 开合、空态文案、搜索防抖）。

## 4. 风险

- 迁移改 PK 属结构变更：drizzle 生成后必须逐行核对 SQL，存量库（本机）迁移前后数据一致。
- `resolveAiConfig` 只留环境变量后，凡依赖「库里有配置就能生成」的既有测试/假设会浮出来——一并修正，不留隐式回退。
