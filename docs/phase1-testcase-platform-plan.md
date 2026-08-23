# 自动化测试平台 — 第一期：测试用例平台（实施计划与任务分配）

> 状态：进行中。本文件是第一期的实施基准：需求范围、技术设计、子 agent 任务分配与进度看板。
> 角色分工：主 agent 只做 计划 → 派发 → 需求/代码 review；全部编码由子 agent 完成。

## 0. 需求范围（第一期）

平台整体分五期：① 测试用例平台 ② UI 自动化（webdriverio 客户端/服务端）③ API 自动化 ④ UI 截图对比 ⑤ App + Mobile Web H5 自动化。本期只做 ①，共六个能力：

1. **用例 CRUD**：项目 → 无限层级模块树 → 用例；暂无登录，操作人为自由填写的名字
2. **版本管理**：每次保存自动快照；历史查看、字段级 diff、回滚（回滚产生新版本，历史不可变）
3. **可编辑脑图**：脑图上直接增删改/移动节点，与模块树/用例数据双向同步
4. **AI 生成用例**：Vercel AI SDK 自建极简 agent（参考 pi-agent：显式工具 + 单一 loop + 流式）；OpenAI 兼容 provider 走 env；生成结果先入待评审提案，勾选采纳后入库（draft）
5. **多人协作**：Presence + Broadcast（无 CRDT）——在线状态、实时光标、他人保存后自动刷新；并发编辑 =「正在编辑」软提示 + currentVersion 乐观锁（冲突拒绝并提示）
6. **MCP + Skill 迁移通道**：Hono 上挂 MCP server（Streamable HTTP，/mcp），配套 `.claude/skills/testcase-migration` Skill，让 AI 客户端解析存量用例（Excel/XMind/导出件）批量导入

技术栈（既有脚手架约定）：TanStack Start（apps/web:3001）+ Hono（apps/server:3000）+ oRPC ^1.14（packages/api，纯对象 router + publicProcedure + zod v4）+ Drizzle/Postgres（packages/db）+ packages/ui（shadcn base-lyra）+ packages/env（t3-env）+ pnpm/turborepo + Ultracite/Biome。内部包源码直出无构建。

## 1. 数据模型（packages/db/src/schema/）

主键统一 `uuid defaultRandom`；新文件从 `schema/index.ts` re-export；迁移走 `db:generate`/`db:migrate`。

- `projects.ts`：projects(id, name, description, createdAt, updatedAt)
- `modules.ts`：modules(id, projectId FK cascade, parentId 自引用可空=根, name, sortOrder int, 时间戳)；索引 (projectId)、(parentId, sortOrder)；排序 = 同级整数 sortOrder，move/reorder 事务内重写同级组
- `test-cases.ts`：
  - pgEnum：casePriority(P0-P3)、caseType(functional/interface/performance/security/compatibility/other)、caseStatus(draft/active/deprecated)
  - test_cases(id, projectId 冗余 FK, moduleId FK, name, priority, caseType, preconditions text, steps jsonb `CaseStep[]`={id,step,expected}, tags jsonb string[], status, maintainer text, sortOrder, **currentVersion int**（快照计数+乐观锁）, lastModifiedBy text, sourceRef text 可空, 时间戳)；索引 (moduleId,sortOrder)、(projectId,status)、部分唯一 (projectId,sourceRef) WHERE source_ref IS NOT NULL
  - case_versions(id, caseId FK, version, snapshot jsonb 全量, changeNote, savedBy, createdAt)；UNIQUE(caseId,version) + (caseId, version desc)
- `ai.ts`：ai_generation_sessions(id, projectId, moduleId 可空, requirement, model, status pending/running/completed/failed/cancelled, error, 时间戳)；ai_case_proposals(id, sessionId FK, sortOrder, proposal jsonb, status proposed/accepted/rejected, acceptedCaseId)

## 2. API（packages/api/src/）

> **架构修订（2026-08-18，依据 docs/init-code-quantity.md）**：所有 DB 操作（SQL/事务，含快照管道 writeCaseMutation）必须在 **packages/db/src/repositories/** 中实现；packages/api 禁止 import drizzle/db client（纯类型 import 除外），router 只做校验、调 repository、映射 oRPC 类型化错误。repository 层返回类型化结果（如乐观锁冲突返回 `{conflict, currentVersion, lastModifiedBy}`），HTTP 语义（CONFLICT/409）由 router 层映射。原计划中 `lib/case-versioning.ts` 的职责移入 repository；`lib/module-tree.ts` 仅保留纯函数（组树/环检测判定）。

- 共享 zod：`schemas/case.ts`（caseStepSchema/caseContentSchema/proposedCaseSchema…，router 与 AI 工具、MCP 共用）
- 业务辅助：`lib/module-tree.ts`（组树/环检测等纯函数）；数据访问见上述 repositories
- `routers/projects.ts`：list/get/create/update/remove
- `routers/modules.ts`：tree/create(index 插入)/rename/move(环检测)/reorder/remove/**ensurePath**(逐级按名匹配缺失即建，单事务，幂等)
- `routers/cases.ts`：list(筛选/分页)/get/create/update(expectedVersion 乐观锁)/move/reorder/remove/listVersions/getVersion/rollback/**importBatch**(≤50 逐条结果 created/skipped/errors，sourceRef 去重 onDuplicate: skip|overwrite|create-anyway)/**search**
- `routers/mindmap.ts`：tree（模块树+轻量用例节点）；batch（op 判别联合 8 种，≤100 单事务，tempId→realId 映射返回）
- `routers/ai.ts`：generate（async-generator 事件流）/listSessions/getSession/acceptProposals/rejectProposals
- **自动快照**：单事务 ① `UPDATE … current_version+1 … RETURNING *` ② 用返回行插 case_versions 全量快照；UNIQUE 兜底。用户编辑带 expectedVersion：`WHERE id=? AND current_version=expected`，0 行 → `errors.CONFLICT({data:{currentVersion,lastModifiedBy}})`（oRPC `.errors()`，自动 409）；系统路径（rollback/AI 采纳/脑图改名）原子自增即可
- `context.ts` 读 `x-client-id`/`x-client-name` → `{ actor }`
- `realtime/protocol.ts`（全部消息 zod + PresenceEntry）、`realtime/bus.ts`（EventEmitter 单例 publish/subscribe，mutation 提交后 publish InvalidateEvent 带 actor；不依赖 ws）

## 3. AI agent（新包 packages/ai）

deps：`ai`（**npm 当前最新稳定版**，2026-08-18 用户指定为 v7，固定版本号；API 形态以实际安装的类型声明/最新文档为准，不沿用旧版记忆）、`@ai-sdk/openai-compatible`（与所装 ai 版本 peer 兼容的 latest，固定版本）、zod、env、db（仅类型）。
> **架构修订（2026-08-18）**：因 DB 操作仅限 packages/db repository，packages/ai 不直接落库——`tools.ts` 改为 `createAgentTools(deps: AgentDeps)` 依赖注入工厂（listModulesOutline/readExistingCases/saveProposals 接口），真实实现由 W4 的 `routers/ai.ts` 用 db repository 注入。

`provider.ts`（createOpenAICompatible + env 三变量 + isAiConfigured）、`tools.ts`（tool({description,inputSchema,execute}) 三工具：list_modules / read_existing_cases / propose_cases——execute 经注入的 saveProposals 增量持久化）、`prompts.ts`（中文系统提示词）、`agent.ts`（`async function* runGenerationAgent` 包 streamText({stopWhen: stepCountIs(8), abortSignal})，fullStream → 领域事件 status/text-delta/tool-call/proposal/done/error）。
流式传输 = **oRPC event iterator**（走现有 /rpc SSE，不加 Hono 路由/useChat）。
env 新增（optional）：`AI_BASE_URL`/`AI_API_KEY`/`AI_MODEL`；未配置时 ai.generate 抛 SERVICE_UNAVAILABLE。

## 4. 前端（apps/web）

依赖：`mind-elixir@^5`、`diff`(jsdiff)、后期 `@dnd-kit/*`。shadcn 补：dialog/select/badge/table/tabs/popover/alert-dialog/scroll-area/separator/collapsible/sheet（CLI 从 apps/web 跑，落 packages/ui）。`utils/orpc.ts` 加 MutationCache onError 默认 toast + RPCLink headers(x-client-id/x-client-name，SSR 守卫)。

路由：`index.tsx`→重定向 /projects；`projects/index.tsx` 项目列表；`projects/$projectId/route.tsx` 工作区布局（左模块树+列表|脑图 Tab（Link search={(prev)=>prev}）+Outlet，预取 projects.get/modules.tree，挂 RealtimeProvider）；`projects/$projectId/index.tsx` 列表视图（validateSearch zod：moduleId/caseId/kw/priority[]/status/tags[]/history，URL 即选中状态单一事实源）；`projects/$projectId/mindmap.tsx`（ssr:false + ClientOnly + lazy）。

组件：projects/（project-list、project-form-dialog）；workspace/（workspace-tabs、module-tree 递归 Collapsible+DropdownMenu+行内改名、module-dialogs）；cases/（case-table、case-filters 关键字 300ms 防抖入 URL、case-detail-sheet、case-form、steps-editor 行 key=crypto.randomUUID 上下移不拖拽）；versions/（version-history-panel 默认当前 vs 上一版、version-snapshot-view、version-diff、field-diff.ts 纯函数带单测）；mindmap/（mindmap-view、mindmap-canvas StrictMode 守卫、mindmap-adapter、use-mindmap-sync）；ai/（ai-generate-dialog 三阶段、ai-stream-view 复用 ui 的 Message/Bubble、ai-proposal-list）。

版本 diff 纯客户端：标量旧/新对照 + diffWords ins/del；tags 集合差 Badge；steps 按 step.id 配对 → 新增/删除/修改/移动表格。回滚 AlertDialog 提示「回滚将创建新版本」。

脑图同步原则：**画布即乐观 UI**，operation 事件镜像到服务端；addChild/insertSibling→modules.create（tempId 回填）、右键「新建用例」→cases.create、finishEdit→rename、removeNodes→确认后 delete（取消 invalidate 重建）、move→modules.move/cases.move（非法落点 toast+重建）、双击用例→列表视图详情。每节点 in-flight Promise 链保序；isApplyingRemote 防回声；成功 setQueryData 手术更新（挂载中不整体 invalidate），失败 invalidate+refresh 服务端赢。v1 禁用 undo/redo/图标/超链接/多选拖拽。

AI 面板：for-await `client.ai.generate()` 事件，提案按 id upsert；停止=AbortController；刷新经 getSession 恢复；采纳走 acceptProposals。

## 5. 实时协作（apps/server + apps/web）

- server：`realtime/rooms.ts`（Map<projectId, Map<clientId, ClientRecord>>，join 同 clientId 重连替换、broadcast 序列化一次失败驱逐、全局 10s 心跳扫 lastSeen>60s 清理）、`realtime/ws.ts`（upgradeWebSocket handler + 订阅 bus fan-out）；`index.ts`：**/ws 注册在 cors 之前**；`serve({fetch, port:3000, websocket:{server: new WebSocketServer({noServer:true})}})`（@hono/node-server v2 内建，非废弃 @hono/node-ws）；deps `ws`+`@types/ws`
- 协议：连接 `GET /ws?projectId&clientId&name&color&view`；C→S presence:update/cursor/ping(25s)；S→C presence:sync|join|update|leave / cursor(排除发送者) / data:invalidate / pong。光标 = `data-cursor-root` 容器百分比坐标，50ms 尾沿节流，仅渲染同 page 对端，3s 无更新隐藏，CSS transition .08s 平滑
- web：`realtime/`（identity.ts localStorage 昵称+颜色、sessionStorage 每 Tab clientId；realtime-provider 指数退避 1s→15s±30% 重连后全量 invalidate 补漏；use-presence/use-cursors 用 useSyncExternalStore 光标独立 store；live-cursors；identity-dialog；presence-avatars）
- data:invalidate → mapInvalidateToKeys → orpc.cases.key()/orpc.modules.key() invalidate；actor 是自己则跳过
- 冲突 UI：`isDefinedError` 识别 CONFLICT → toast「已被 XX 修改」+ 刷新 action；编辑器挂/卸载 updatePresence({editingCaseId}) →「正在编辑」琥珀条/小圆点
- v1 不做：弹簧插值、脑图画布锚定光标、follow 模式、Redis 多实例、WS 鉴权

## 6. MCP + Skill（apps/server/src/mcp + .claude/skills/）

deps：`@hono/mcp@^0.3.2` + `@modelcontextprotocol/sdk@^1.30`（已验证兼容 hono ^4.12/zod ^4；@orpc/mcp 不存在）。无状态：`app.all("/mcp", …)` 每请求 new McpServer+transport。工具经 `createRouterClient(appRouter,{context})` 薄包 oRPC——快照/锁/广播自动生效。
五工具（英文描述=AI 侧文档）：list_projects / create_project / get_module_tree（扁平+缩进文本双输出）/ ensure_module_path / import_test_cases（≤50，onDuplicate，逐条结果）/ search_cases。
Skill `.claude/skills/testcase-migration/`：SKILL.md（工作流：解析源文件汇报映射→list_projects→get_module_tree→ensure_module_path→分批 import→search 抽查→汇总表；优先级映射/模块列拆分/XMind 启发式/步骤拆分/必设 sourceRef；部分失败收集重跑安全）+ references/{case-schema,mapping-examples,source-formats}.md + 仓库根 `.mcp.json`。

## 7. 任务分配与进度看板

派发规则：每个子 agent 严格限定文件范围；波次内并行的 agent 文件集不相交；只有标注「可装依赖」的 agent 允许改 package.json/跑 pnpm install（避免 lockfile 竞争）；每个任务完成须通过 `pnpm check-types` 且改动文件过 ultracite，输出变更文件清单+自测结果，由主 agent review 后进入下一波。

| 波次 | 任务 | 范围 | 依赖 | 状态 |
|---|---|---|---|---|
| W1 | **T1 数据层**（§1 全部 schema + 迁移生成/执行） | packages/db | — | ✅ |
| W1 | **T2 UI 基座**（shadcn 11 组件入 packages/ui；apps/web 装 mind-elixir/diff；orpc.ts 加 MutationCache）可装依赖 | packages/ui、apps/web(orpc.ts/package.json) | — | ✅ |
| W0' | **T0/T0b 代码规则基建**（按 docs/init-code-quantity.md：版本固定/ESLint/Lefthook/自定义脚本/Biome 升级）——插入任务 | 全仓配置 + scripts/ | — | ✅ |
| W2 | **T3 后端 API + repository 层**（§2 修订版：packages/db/src/repositories/ 全部数据访问 + schemas/lib/projects/modules/cases/mindmap 路由 + context actor + 本机 Homebrew PG 落库迁移；不含 ai router、realtime、invalidate 发布） | packages/db(repositories)、packages/api、apps/server/.env | T1 | ✅ |
| W2 | **T4 AI agent 包**（§3 修订版：packages/ai 依赖注入版 + env 三变量；ai-sdk 用 npm latest=v7）可装依赖 | packages/ai、packages/env、apps/server/.env(示例) | T1 | ✅ |
| W2 | **T7a 实时协作基础层**（§5 的 protocol/bus + apps/web/src/realtime 客户端基座；不含 WS 服务端/路由挂载/orpc headers）——自 T7 拆出提前并行 | packages/api/src/realtime、apps/web/src/realtime | — | ✅ |
| W2 | **T5a 版本 diff + 脑图适配纯函数**（field-diff.ts、mindmap-adapter.ts）——自 T5/T9 拆出提前并行 | apps/web/src/components/{versions,mindmap} 纯函数文件 | T1,T2 | ✅ |
| W2 | **T6a 迁移 Skill 文档 + .mcp.json**（§6 文档部分）——自 T6 拆出提前并行 | .claude/skills/testcase-migration、.mcp.json | — | ✅ |
| W3 | **T5 前端核心**（§4 路由/项目列表/工作区/模块树/用例表格与表单/版本历史 diff UI；消费 T5a 纯函数；不含脑图/AI/实时；顺带给 apps/web 加 @automationstack/db 依赖并转正 T5a 的类型导入）——2026-08-19 因额度中断后拆为 T5-cont（路由+用例 UI+门禁清零）与 T5v（版本历史/diff UI，对外入口 `VersionHistoryPanel({caseId, currentVersion})`）并行续跑 | apps/web(routes+components/projects,workspace,cases) / apps/web(components/versions UI) | T2,T3,T5a | ✅ |
| W3 | **T6 MCP 服务端**（§6 代码部分：/mcp 挂载 + 5 工具 + ensurePath/importBatch/search procedure；与 T6a 文档对账；顺带补 createTestCaseInTx 的 moduleId↔projectId 归属校验）——代码已落盘，2026-08-19 额度中断后由 T6-cont 续做门禁+MCP inspector 冒烟，已通过 | apps/server(mcp/+index.ts /mcp 路由+package.json)、packages/api(补 procedure)、packages/db(补 repository 方法) | T3,T6a | ✅ |
| W3' | **T6-fix 导入逐条降级**（修复 §6「绝不整批失败」违例：cases[] 项放宽为逐条 safeParse，脏行进 errors[]）| packages/api(case-import.ts,schemas/case.ts)、packages/db(case-import-repository.ts)、apps/server(mcp/tools/cases.ts)、.claude/skills | T6 | ✅ |
| W4 | **T7 实时协作**——T7s（服务端 rooms/ws、/ws 先于 cors、@hono/node-server v2 websocket 选项、16 个 mutation 发布失效事件、装 ws）+ T7w（前端：身份/Presence/光标/失效映射/正在编辑提示）。review 打回三处后已全修：① 昵称改为非模态 Popover + 临时访客身份（不写 localStorage），首次进入不再阻塞主功能；② invalidate 映射补 `mindmap` 缓存根；③ 工作区栅格 3 子元素却用 2 行模板导致内容区塌到约 160px，新增 `grid-rows-workspace-shell`（`auto auto 1fr`）修复，实测 812px/900 视口（`grid-rows-app-shell` 仍被 __root.tsx 正确使用，未动） | apps/server(realtime/+index.ts /ws)、packages/api(发布点) / apps/web(realtime/+route.tsx+orpc.ts+index.css) | T3,T5,T7a | ✅ |
| W4 | **T8 AI 生成端到端**——拆为 T8b（后端：ai-{sessions,proposals,acceptance}-repository、routers/ai.ts 的 generate/listSessions/getSession/accept/rejectProposals、oRPC event-iterator、mock 模型冒烟）与 T8w（前端：ai-generate-dialog 流式 + 提案评审 + 采纳） | packages/api(routers/ai.ts+index.ts 注册)、packages/db(ai repositories) / apps/web(components/ai) | T3,T4,T5 | ✅（T8w 以 playwright 无头浏览器验到 UI 全链路：发起→事件→评审→采纳→列表→刷新恢复） |
| W4' | **T8b-fix 采纳并发加固**（review 发现 TOCTOU：提案 SELECT 无行锁 + markAccepted 的 WHERE 缺 status 条件，并发采纳会建重复用例；加 `.for("update")` + 条件 UPDATE 0 行即回滚） | packages/db(ai-acceptance-repository.ts, ai-proposals-repository.ts) | T8b | ✅ |
| W5 | **T9 可编辑脑图**（§4 脑图余量：画布组件 + operation 同步，消费 T5a adapter；容器留 data-cursor-root 供 T7w 挂光标） | apps/web(routes/mindmap.tsx+components/mindmap UI) | T3,T5,T5a | ✅（画布只初始化一次；外部数据变化经 `syncExternal` 按快照引用判定来源后重绘，自身 `setQueryData` patch 会认领新引用故不重建；`isBusy()`+`deferred`+500ms 重试保证不在用户输入途中打断。11/11 交互冒烟 + 7/7 外部重绘冒烟通过；review 打回的 8 条 Biome error 已修复复验） |
| W5 | **T10a 服务端打磨**——importBatch/acceptProposals 补实时广播；`cases.list` 增 `tags` 过滤（any-of 语义，jsonb）；`ai_case_proposals.session_id` 补索引+迁移；`scripts/seed.ts`（支持 `--reset`）并清理冒烟残留项目（AI 冒烟 1787123122370 / T7s smoke）。**明确不做** projects.create 跨端广播（需全局房间，v1 已接受缺口，仅补注释） | packages/api、packages/db、apps/server、scripts | T3,T5,T6,T7s,T8b | ✅（补齐 importBatch/acceptProposals 广播、`tags` any-of 过滤、`cases.listTags`、`(session_id,sort_order)` 复合索引+迁移、`scripts/seed.ts`(+`--reset`/`--purge-smoke`/生产守卫)、AI 提案 drain 加固。种子：8 模块三层树 / 54 条用例(订单管理模块 48 条→pageSize=20 正好 3 页末页 8 条) / 12 种优先级×状态组合全覆盖 / 13 个标签。**遗留：`pnpm db:seed --reset` 被权限分类器拦截，需用户放行以清理 16 个历史冒烟项目**） |
| W5 | **T10b 前端打磨**——分页器（服务端 page/pageSize/total 已就绪，前端写死 `CASE_PAGE_SIZE=100` 且无 UI）；tags 筛选接线；dnd-kit 侧栏树拖拽；空态/加载态；a11y；AI 提案列表长列表表现 | apps/web（不含 components/mindmap/**、realtime/**） | T10a, T9 | ✅（分页器 page 入 URL + `CASE_PAGE_SIZE` 100→20 对齐服务端；tags 筛选接 `cases.listTags`；dnd-kit 拖拽自建落点模型 before/inside/root-end + 键盘吸附 + 中文播报；空态区分「还没有用例」与「没有匹配的用例」；骨架屏；`lang` en→zh-CN。实测 AI 提案 100 条单行勾选 40–110ms→13–20ms（memo + Set）。review 打回 2 项已修复复验：`resolveBefore` 环检测缺口 + 移除未用的 `@dnd-kit/sortable`） |
| W5 | **T10c 单测基座**——仓库当前无任何测试运行器与已提交单测（各轮均用 scratchpad 冒烟脚本，为刻意约束）。补 vitest + `pnpm test`，为纯函数补单测：`field-diff.ts`（plan M7 已承诺）、`map-invalidate.ts`、`lib/module-tree.ts`。不做覆盖率门槛、不接 CI | vitest 配置、`*.test.ts` | T10b（依赖安装串行，避免 lockfile 竞争） | ✅（根级单 vitest.config.ts + projects[web,api]，`pnpm test`=`vitest run`，失败返回非 0 已实测；仅装 vitest 4.1.11 定死，未引入 jsdom/coverage/testing-library。67 条单测覆盖 module-drop-plan / module-tree / field-diff / map-invalidate，用变异测试证明回归锁有效。review 授权修复 2 处真实源码缺陷：`resolveInside` 拖到自身父节点的静默重排、`collectSubtreeIds` 环形数据死循环） |
| W6 | **T11 UI 优化**——用户指定跑 `/better-ui` skill 做界面优化。必须排在 T10b 之后（同改 `apps/web`）。**优化后必须重跑全量门禁**：该类改动极易引入 Tailwind 任意值 `[...]`、超 300 行/50 行限制、或 `noJsxPropsBind` 内联箭头 | apps/web、packages/ui | T10b | ✅（15 处小修零重做：`transition-all`×3→具名 `transition-control`；按钮按压 `translate-y-px`→`press-scale`(0.96)；Dialog/AlertDialog 由不可打断的 keyframes 改为 `data-starting-style`/`data-ending-style` transition 并补 `shadow-lg`；6 处图标描边 2→1.5；空态图标改双图标叠放交叉淡入；全站补 `prefers-reduced-motion`（用 0.01ms 而非 none，放过 spinner）。修真 bug 1 处：选中行被 `hover:bg-muted/50` 盖掉。新增 4 条具名 @utility 均按仓库先例写明等价任意值。**未做浏览器目视验证**（无 playwright，禁装依赖），Dialog 进出场与空态淡入待人工过眼） |
| W7 | **T12 脑图展示步骤与预期**——用户要求「脑图把 step 和对应的 expected 也展示出来」。结构定为 `用例 → 步骤 → 预期`（XMind 系画法），用例节点默认折叠（54 条种子用例全展开是一堵文字墙）。步骤/预期节点 **v1 只读**（`mindmap.batch` 无对应 op，硬做需读-改-写整个 steps 数组 + 乐观锁，超范围），守卫层需全挡并给准确提示 | packages/db(mindmap-repository)、packages/api(routers/mindmap.ts)、apps/web(components/mindmap/**) | T9 | ✅（结构 `用例→步骤→预期`，用例节点 `expanded:false`；空 steps 不写 `children` 键而非写 `[]`——核过 mind-elixir 源码 `!t && e.children && e.children.length>0` 才建展开器，所以无步骤用例仍是干净叶子。`MindmapNodeRef` 改判别联合（entity 有 `id`／step 有 `caseId+stepId`），逼 tsc 在每个消费点报错，实际抓出 `mindmap-operation-map.ts` 4 处会在步骤节点上取到不存在的 `parent.id`。**我事先警告的漏洞已堵**：`canHaveChildren` 由 `?.kind !== "case"`（null→true→放行）改白名单 `kind` 属于 module 或 project 的白名单，未知前缀一律 false。守卫 5 类全挡（含混选里藏步骤节点、拖拽双向），且步骤检查置于 `canHaveChildren` 之前以免给出错话；另补第 6 个口子——右键重命名走 `mind.editTopic()` 按设计绕过 `before`。实测载荷 12.8KB→26.5KB（2.07×）、画布 63→281 节点。变异测试证明回归锁有效（删 `s:` 注册挂 11 条）。**复核**：逐行核实 `PREFIX_TO_KIND` 显式注册、`canHaveChildren` 白名单、守卫顺序；门禁 ultracite 225 文件 0 error／eslint 0 error／check-types 7/7／测试 67→121／file-rules 与 tailwind rc=0。**未做浏览器目视** |
| W7 | **T13 清理脚手架残留**——删 Better-T-Stack 初始化带的 `header.tsx`（"Home" 链接指向 `/`，而 `/` 又 redirect 到 `/projects`，是个自环）+ 连带简化 `__root.tsx` 外壳与 `grid-rows-app-shell`；删 `packages/ui` 5 个零引用 vendored 组件（attachment / input-group / marker / message-scroller / tabs） | apps/web(header/__root/index.css)、packages/ui(components/**) | — | ✅（删 6 文件：`header.tsx` + `packages/ui` 5 个零引用 vendored 组件 attachment/input-group/marker/message-scroller/tabs；`__root.tsx` 外壳 `grid-rows-app-shell`→`grid-rows-1` 并删除死掉的 utility。**关键：外壳必须保持 grid**——工作区根元素无高度类，靠栅格行 stretch 拿满高，退化成 block 会重现 160px 塌陷；实测 1440×900 与 1280×600 两档，内容区 849/549px 正确、无页面级滚动条。ultracite warning 45→44（`noBarrelFile` 消失）。复核：6 文件确已删除、全仓零残留引用、其余 6 个 utility 完好） |
| W8 | **T14 三轮界面优化**——用户指定跑 `/better-ui` + `/better-colors` + `/better-accessibility`。三者文件范围重叠，故拆为「3 个只读评审 agent 并行出 findings → 我合并裁决 → 按 packages/ui / apps/web 两个不相交范围并行落地」，避免互相覆盖。评审轮先行开跑并排除 `apps/web/src/components/mindmap/**`（T12 在改，评了也是白评），待 T12 落地后对脑图目录补一小轮 | apps/web、packages/ui | T12, T13 | 🔄（评审轮 T14a/T14b/T14c 三份报告已交付并裁决完毕，详见下方「T14 裁决」；落地轮 T16/T17/T18 三个不相交范围并行进行中） |
| W9 | **T15 脑图规模压测**——用户提出「脑图太大会卡死」。先核实的事实：mind-elixir `MindElixir.js:381-385` 里 `e.expanded !== !1` 才递归渲染子树，**折叠子树不进 DOM**，故用例节点 `expanded:false` 使步骤/预期在未展开时零 DOM 成本（现种子 281 节点对象仅 63 个进 DOM）。真正的规模因子是**单项目用例数**（模块 `expanded:true`，用例节点恒在 DOM）；最锋利的坎是远端 `data:invalidate` 触发的 `mind.refresh()` 全量重建。平移缩放走容器 CSS transform 由合成器承担，不随节点数劣化。本任务只做实测取数不改代码，输出拐点数字与阈值建议 | 只读（数据经 oRPC 接口造，测完删项目） | T12 | ✅（8 个档位实测，拐点被夹住而非外推；结论见下方「T15 实测结论」。派生的优化项另开 W10/T19，不并入 T14） |
| W10 | **T19 脑图与列表规模优化**（T15 实测派生，按性价比排序）：① 给 `mindmap.tree` 这类普通 JSON 响应加压缩，**必须按路由排除 SSE / event-iterator 流式端点**（与 T12 驳回的「全局 compress」不是一回事）；② 模块树侧边栏虚拟化或默认只展开到二级（实测最先撞墙处，约 1.5ms + 24 DOM 元素/模块，列表页同样受害）；③ 远端 invalidate 做 300ms 尾沿合并，并把 `refresh(data)` 改为就地更新 `nodeData` + 不传参 `refresh()`（跳过库内深拷贝，省 16%）；④ `mindmap.tree` 增可选 `moduleId` + `includeSteps`；⑤ 节点预算护栏（1200 渲染节点，含二级护栏与展开用例数上限） | packages/api、apps/server、apps/web(components/mindmap+workspace) | T14 落地完成 | 🚧 已拆为 T29/T30/T31/T32 并行（④⑤ 的前端接线另留后续） |
| W10 | **T20 零散修复**：① dnd-kit 键盘拖拽「空走一步」→ **已拆出为 T24**；② packages/ui 残留任意值 → **已拆出为 T25**（并入 `bubble.tsx`，见下方全仓扫描结论）；③ `router.tsx:61` 全局 `defaultPendingComponent` 无地标（T21 发现，需设计后再修）；③ `refresh()` 首行 `clearSelection()` 导致队友每次保存都清掉当前用户选中态（体验 bug，可与 T19③ 合并修） | apps/web(components/workspace)、packages/ui | — | ⬜ 待排 |
| W10 | **T21 脑图路由主地标**——`__root.tsx` 的「跳到主要内容」指向 `#main`，但 `/projects/$projectId/mindmap` 既无锚点也无 `main` 地标（T17 分到跳转链接+`projects/index.tsx`，T18 分到 `case-list-view.tsx`，**脑图路由不在任何人域内，是我拆任务时漏的**）。要求覆盖 ClientOnly fallback / Suspense fallback / loading / error / 正常五种分支，并实测画布高度不塌、`#main` 全页唯一 | apps/web(routes/mindmap.tsx) | T18 | ✅（只改 1 个文件、加 8 行：`<main className="h-full" id="main" tabIndex={-1}>` 包在 `<ClientOnly>` **外层**，五个分支全覆盖。我已自行实机复核，见下方「T21 复核」） |
| W10 | **T22 状态徽章一致性收尾**——`--success` 令牌落地后把 `STATUS_DOT_CLASSES.active` 从暂借的 `--primary` 切过去（借用是语义错误：「用例已生效」不是「主操作色」）；并把状态点补进另外三个消费者（现在那三处是无状态点的裸 outline 徽章，去撞色已达成、但形态线索不如表格一致） | apps/web(components/{cases,versions}) | T16 追加项 | ✅ 并入 T23 交付。`CaseStatusBadge` 提成共享组件 `case-status-badge.tsx`（**不下沉 packages/ui**——那会让通用 badge 认识 `CaseStatus` 业务枚举，是分层错误），三处消费者统一。我已 grep 复核：全仓只有 1 处定义、3 处消费，无残留局部组件 |
| W10 | **T23 优先级徽章强调倒置**（我在 T16/T18 交叉验收的实机截图里发现，此前无人报过）：深色下 `--primary` 是 `oklch(0.87 0 0)` near-white 实心，P1 用 `default` 变体后成了整行最亮的元素，而 P0 是 15% 透明度的淡红片。修法：packages/ui 补 `--destructive-foreground` 与 `destructive-solid` 实心变体，apps/web 把 P0 切实心、P1 降为淡红填充，P2/P3 不动，脑图 `PRIORITY_TAG_STYLES` 同步 | packages/ui(globals.css、badge)、apps/web(components/{cases,versions,ai,mindmap}) | T16 | ✅（实测相对亮度：修前 P1 0.658 ≫ P2 0.0194 ≥ P0 0.0186 > P3；修后 P0 0.528 ≫ P2 0.0194 ≈ P1 0.0186 > P3 0.0030。P0 标签 APCA Lc 70.0。**代理纠正了我一处错误，它是对的**，见下方「T23 复核」）|
| W10 | **T24 键盘拖拽空走一步**（从 T20① 拆出）——T17 实测：连按方向键时相邻两次高亮同一落点。我给的三个可疑点（`endsWith` 子串排除 / `epsilon=1` / 自身落点仍在碰撞集合）**全部被实测证伪**，真因是另一回事 | apps/web(components/workspace) | — | ✅（真因：坐标推进器只对齐 y，而 `closestCenter` 按**二维**中心距排名；模块树每层缩进 12px、inside 落点让开行首两个 24px 按钮，横向中心差最大 20px > 相邻落点纵向间距 17px，于是系统性判错。改为键盘自持落点游标 + 按序列下标 ±1 推进。修前 12 次按键只到 8 个落点（4 次空走 + 2 次越过），修后 12 次按键 = 12 个不同落点、0 重复。见下方「T24 复核」）|
| W10 | **T25 packages/ui 残留任意值清理**——我用自写脚本全仓扫过（不依赖有缺陷的门禁脚本）后给出的清单是「3 文件 5 处」。**代理独立复扫得到 13 处出现 / 9 个不同任意值，全在同这 3 个文件里——我漏报了 8 处**（文件集对了，逐文件计数错了）。任意**变体**（`data-[side=*]:` / `group-data-[size=sm]/x:` / `[&>svg]:`）是 Base UI 必需品，不在范围内 | packages/ui(globals.css、scroll-area、alert-dialog、bubble) | T16 | ✅（`ring-[3px]`→内建 `ring-3`、`max-w-[80%]`→内建 `max-w-4/5`（优先内建刻度而非新造类）；secondary 的 color-mix→复用已有 `--secondary-hover` token，实测明暗两套 sRGB 逐字节相同；其余转 9 个具名 `@utility`。**未改任何 token 值**。globals.css 299 行（`check-file-rules` 按 `split("\n").length` 算，300 行文件记 301，故 299 是贴着上限的安全值）。见下方「T25 复核」）|
| W10 | **T26 键盘拖拽跳过非法落点**（T24 交付时主动上报、超其范围）——拖父模块时它自己的子孙落点仍在步进序列里，放下必 CYCLE。**鼠标用户永远看不到这些落点**（直接把鼠标放到目标处），只有键盘用户被迫空翻，属键盘专属可达性缺陷 | apps/web(components/workspace) | T24 | ✅（谓词复用纯函数 `resolveModuleDrop(...).kind !== "invalid"`，不重新推导树结构；`noop` 落点保留（合法可选项），只滤 `invalid` + 自身两个落点。tree 每次刷新都是新引用，故工厂收 **getter** 而非 tree，配 `useRef`+`useEffect` 镜像，拖到一半不会因为刷新丢游标。实测拖根模块 15→1 个落点、拖中间父模块 15→11（滤掉的正好是两个子模块的 4 个落点）、拖叶子前后序列**逐项相同**。测试 9→12 全过。**代理纠正了 T24 一处我已签字的事实错误**，见下方「T26 复核」）|
| W10 | **T27 清理 next-themes 死依赖**——`__root.tsx:47` 把 `className="dark"` 写死在 `<html>` 上，全仓没有 ThemeProvider、没有切换入口、没有 `prefers-color-scheme`、没有 `data-theme`，`next-themes` 是装了但永远不会被调用的依赖 | apps/web, packages/ui(sonner) | T25 | ✅（移除依赖；`sonner.tsx` 只改注释——保留「为什么不跟随系统主题」这个决策及其失效方式，删掉已不存在的依赖名。刻意排在所有跑测试的 agent 之后，并给了「宁可回滚也不许让 dev server 挂掉」的指令，因为用户下一步就是预览。实测 dev server 全程未重启（PID 未变）：3000→200、3001→307、3001/projects→200。**该 agent 顺手指出我分发了一整轮的守门脚本调用方式是假绿**，见下方「更正：守门脚本此前一直是假绿」）|
| W10 | **T28 修 check-tailwind.js 双向缺陷**——门禁脚本既误报又漏报：`/\[[^\]]+\]/` 分不清 arbitrary **variant**（`[&_tr]:border-b`，合法）与 arbitrary **value**（`w-[96px]`，要禁）；又因逐行匹配而看不见多行 `cva({...})` 里的任意值。用正确的 `xargs -0` 调用后门禁实际是 **rc=1**，红在 `table.tsx` 两处合法写法上 | scripts/ | T27 | ✅（换算法：扫字符串字面量→按空白切 token→**方括号深度计数**找最后一个顶层 `:`，之前是变体、之后是工具类；并新增 `scripts/check-tailwind.test.mjs`（node:test，零依赖）双向覆盖。明令**不许改 `table.tsx` 去迎合脚本**——那是拿正确代码将就错误的门禁）|
| W10 | **T29 服务端开压缩**（T19①）——T15 实测：带 `Accept-Encoding: gzip` 请求当前服务，响应**无** `content-encoding`，压缩根本没开；压缩比稳定 9%（1000 条 646 KB → 39.8 KB，10000 条 6.31 MB → 375 KB） | apps/server | T15 | ✅（关键约束：**不能全局套** —— T12 驳回过全局 compress。`/rpc` 是混合的，多数 procedure 是普通 JSON 要压，只有 event-iterator 是 SSE 不能压，因此要求**按响应 content-type 判断而非按路径一刀切**；`/ws` 绝不能套（它刻意注册在 cors 之前，改 header 的中间件会与 upgradeWebSocket 冲突）；`/mcp` 先排除）|
| W10 | **T30 侧边栏规模开销**（T19②）——T15 最反直觉的发现：最先撞墙的不是画布是侧边栏，约 1.5ms + 24 DOM 元素/模块，**无画布的列表页同样付这个钱**（整页 24777 元素，23473 个在 `<aside>` 内，long task 合计 861ms），模块数超约 400 即超过画布本身 | apps/web(components/workspace) | T15 | ✅（默认只展开到二级；410 模块 A/B 实测 `aside` 后代 10025→1225，**-87.8%**；键盘拖拽 0 空走；深链祖先链自动展开且兄弟分支保持折叠）|
| W10 | **T31 脑图 refresh 开销 + 选中态 bug**（T19③⑤ + T20③）——refresh 拐点 660 条（>50ms 可感）/2650（>200ms）/6300（>500ms），且是**高频**路径（队友每次保存都来一次）；现有 `isBusy()` 是「延后」不是「合并」，连续 5 个 invalidate 仍各触发一次 apply | apps/web(components/mindmap) | T15 | ✅（合并 433ms/5 次重绘→76.5ms/1 次；无参 `refresh()` 实测省 **35%** 而非预估的 16%；选中态与展开态跨队友保存保住；预算护栏 + 展开用例预留额度，另修出 2 个实测暴露的真 bug）|
| W10 | **T32 `mindmap.tree` 作用域参数**（T19④）——现在只接 `projectId`；实测限定到单模块可把拐点从「全项目 6300 条」推到「单模块 6300 条」，135 条的一级模块 refresh 仅 9.4ms（91× 提速）。另一笔浪费：每条用例白送永不渲染的 steps，1000 条时载荷 6099 个对象 vs 实际 1099 个 DOM 节点，深拷贝要遍历 5.5 倍于渲染量 | packages/api | T15 | ✅（**只做服务端，两个参数都可选且缺省行为与现状逐字节一致**，前端接线另留后续任务，避免与 T31 抢 components/mindmap）|
| W10 | **T33 修 eslint `max-lines-per-function`**（T31 复核派生）——仓库有 biome 与 eslint 两套 lint，此前派单模板只要求 `pnpm check`，导致 T31 新增的 3 个测试文件带着 4 个 eslint error 落地（含 T32 早先标记的 `mindmap-adapter.test.ts` 那条） | apps/web(components/mindmap 的 4 个 .test.ts) | T31 | ✅（4 个测试文件拆分完成；`pnpm lint` 0 error，`pnpm test` 仍为 13 文件 189 测试）|
| W11 | **T34 主题令牌重做 + 亮/暗切换**（用户反馈「主题不要用默认的」）——`globals.css` 是 shadcn 出厂纯灰（chroma 全 0，一行没改过），且 `__root.tsx:47` 写死 `<html className="dark">`，`:root` 那套亮色令牌**从未被渲染过**，是未经验证的死代码；`sonner.tsx:18` 同样写死 `APP_THEME = "dark"`。用户已选定「冷蓝科技感」hue≈265，且要求补齐亮色并加切换开关 | packages/ui(globals.css, sonner), apps/web(__root, components/theme) | — | ✅（冷蓝 hue≈265 双套令牌；`globals.css` 299 行已顶格，故把令牌与实测理由拆出 `theme.css`(136)，`globals.css` 降到 191；SSR 首帧防闪烁脚本已在浏览器实测。**自报三项未解决，见复核小节**：暗色 `text-primary` −36.6、destructive 焦点环不达标（已升级为 T38）、全程无浏览器视觉验证）|
| W11 | **T35 版本历史移入 Sheet 内 Tabs**（用户反馈「版本管理不能直接出现在 case 的下面」）——`case-detail-sheet.tsx:190` 把 `VersionHistoryPanel` 追加在用例正文/编辑表单**下面的同一个滚动容器**里：看历史要先滚过整个正文，编辑态下历史压在表单底下，两块内容抢同一条滚动条 | packages/ui(tabs 新建), apps/web(components/cases 的 detail 三件, components/versions) | — | ✅（CLI 产出确是 Base UI 版，但含 5 处被禁任意值，逐个换成刻度值；`case-detail-sheet.tsx` 287→165 行，拆出 `case-detail-tabs.tsx`(74) 与 `case-detail-body.tsx`(99)；未动任何依赖。**顺带上报了一条真缺陷见 T37**）|
| W11 | **T36 视觉对齐审计与修复**（用户反馈「视觉对齐部分」）——外壳三区各用各的 gutter：header `px-4`（16px）、侧栏 `p-2` 再套 `px-1`（实际 12px）、内容区 `p-4`，而 `index.tsx:41` 又在 `p-4` 容器之上多叠一层 `px-4 pt-4` | apps/web(components/{workspace,cases,projects,ai,mindmap}, routes/projects), packages/ui(components) | — | ✅（24 处修改；确立两条明写进注释的约定：**工作区 gutter = 16px**（侧栏拆成「面板 8 + 行 8」以便行底色内缩）、**控件高度 = 32px 档**（`size="sm"` 只留给弹层内/表格内次级按钮）。同心圆角一条**查完是零实例**，如实报告未编造修改）|
| W11 | **T37 `setHistory` 该推历史项而不是替换**（T35 复核派生）——`use-workspace-navigation.ts:83` 的函数注释写的是「翻页和开关详情要能被浏览器后退撤销，所以推新历史项」，同一函数里 `closeCase`/`selectCase`/`setPage` 都传 `false`（推），**唯独 `setHistory` 传 `true`（替换）**，代码与自身注释自相矛盾 | apps/web(components/workspace) | T36 | ✅（确认 `ApplyPatch` 第二参数确为 `replace`，改一行；浏览器实测 `history.length` 从 3→4 证明是 push，后退依次回「详情」tab 再回列表，前进可逆，深链仍落版本历史；点击已选中 tab 与方向键均不产生多余历史项。抽屉关闭按钮落点交叉复核**逐像素成立，未做改动**）（改 tab 后危害放大：点 tab 不产生历史项，按后退会直接飞出整个页面。T35 已单独证明「只要历史项存在，后退/前进就能正确还原 tab」，所以这是最后一块拼图。该文件属 T36 范围故串行等待）|
| W11 | **T38 destructive 按钮焦点环不达标**（T34 复核升级）——`button.tsx:9` 的基类焦点指示（`focus-visible:border-ring` + `ring-1 ring-ring/50`）实测 17.28:1（暗）/16.89:1（亮），完全合格；但 `button.tsx:30` 的 `destructive` 变体把**边框和环两个都覆盖**成 `border-destructive/40` + `ring-destructive/20`，实测边框仅 2.82:1（暗）/2.15:1（亮），低于非文本 3:1 门槛，环比边框更透明只会更低。该变体用在 `case-delete-button`/`project-form-dialog`/`module-dialogs`/`mindmap-delete-dialog` —— **全应用破坏性最强的一批操作，焦点指示最弱**。顺带处理同根因的 `empty.tsx:71` 链接 hover（暗色 −36.6，比基础态 −76.3 更看不清，hover 反而倒退）与两个当前无人使用的 `link` 变体 | packages/ui(button, empty, badge) | — | ✅（实际比派单时判断的还差一层：暗色下环与边框**同色**，互比 1.00:1，整套指示塌成一条 2.82:1 窄带。删掉变体的三条 `focus-visible:` 覆盖后回落基类，边框对底面 16.95/17.29、对淡红填充 14.25/11.12。链接类三处统一改 `text-foreground`。未动令牌文件）（T34 只自评为「焦点边框略低」，我读 `button.tsx` 全文后发现它覆盖的是**两个**属性而非一个，故升级独立成任务；令牌层已论证 `--primary` 当不了文字/填充两头，故只许在组件层解，`theme.css`/`globals.css` 划为只读）|
| W11 | **T39 主题开关移进页面 chrome + devtools 让位**（T37 复核派生）——T34 为给浮动主题开关腾出左下角，把 router devtools 挪到了 `top-right`，而 `top-right` 正是 `sheet.tsx`/`dialog.tsx` 统一的关闭按钮位置（`absolute top-3 right-2.5`）：T37 浏览器实测确认用例详情抽屉的 X **被徽标完全遮住**。同时 `fixed bottom-3 left-3` 的浮动开关在工作区会压住模块树滚到底的最后一行 | apps/web(routes/__root, routes/projects, components/projects, components/theme) | T37 | ✅（浮动开关移入两处 chrome，devtools 回 `bottom-left`；实测 `elementFromPoint` 命中关闭按钮本身、点击真能关；两处开关切换与刷新持久化各验一遍；骨架屏与就绪态标题行实测同为 `height 32, y 24`，37 次采样零抖动。**亮色首次真机渲染发现脑图画布不跟随主题 → T40**）（T34 的前提「项目列表页没有 header」只对了一半：它没有 `<header>` 元素，但 `project-list.tsx:181` 有「项目／新建项目」标题行，`route.tsx:126` 有工作区 header —— 两处都能自然容纳，浮动层本就不必要。顺带要求做**亮色模式首次真机渲染**）|
| W12 | **T40 脑图画布不跟随亮/暗主题**（T39 亮色首次真机渲染发现）——`/projects/$projectId/mindmap` 在亮色下外壳（header、模块树）正确变亮，但整个 mind-elixir 画布（背景、节点色块、浮动工具栏）保持近黑，**整屏从中间劈成一半亮一半暗**。根因：`mindmap-canvas.tsx:20` 的 `import "mind-elixir/style.css"` 自带一套主题，代码里没有任何地方把它接到 `.dark` / 令牌上 | apps/web(components/mindmap) | — | ✅（根因不是样式表而是构造函数按 **OS** `prefers-color-scheme` 选主题；改为显式传一套值全是 `var(--token)` 的 theme，切换时零 JS、零 layout、零重建，两个坑结构性不成立）（三个必须避开的坑已写进派单：不许走销毁重建或无条件 `refresh()`（会击穿 `mindmap-budget` 的节点预算并收起用户手动展开的节点）、不许与 `TrailingMerge` 的挂起状态打架、该路由 `ssr:false` 只能浏览器验证）|
| W12 | **T41 跨亮/暗两种外观的视觉验收巡查**（纯只读，不许改代码）——本轮几乎所有结论都来自数值计算与 SSR 文本，浏览器里真正被看过的部分很少，亮色令牌只被粗看过一遍 | （只读，不写文件） | — | ❌ 已终止（跑了 56 分钟未产出任何交付物：它自行扩到 Slow 3G 限速下的骨架屏轮询——那是 T39 已结案的范围，且限速本身就是故意拖慢加载。两次要求收尾无效后由用户叫停，磁盘上零截图零报告）（原派单：覆盖 4 类界面 × 2 种外观：项目列表/工作区/详情 Sheet 两个 tab/各类弹窗，加焦点态、320px 无横向滚动、200% 缩放、骨架屏等高；脑图页避开因 T40 正在改。要求「没问题的地方也要明说看过」，不许用推断填充未看到的项）|
| W12 | **T42 收拾并发会话留下的两条门禁红 + 守卫脚本自身的差一错误**（用户授权「你去修复吧」）——① `case-import-repository.ts` 301 行超限；② `case-snapshot-core.test.ts` 触发 `max-lines-per-function`；③ 我复核时发现 `scripts/check-file-rules.js` 把结尾换行多算一行，文档写「≤300」实际卡在 299 | packages/db(repositories), scripts | — | ✅（拆出 `case-import-lookup.ts` 43 行、主文件 301→268；一个 describe 拆成四个顶层 describe，11 个用例前后一致；守卫改为与 `wc -l` 对齐。放宽一行**赦免了零个文件**——全仓 290–320 行区间只有 298/297/290 三个文件）|
| W13 | **T43 脑图改为按模块作用域**（用户：「脑图不要按照全部的来做，按照点击的模块」）——模块树每行加脑图按钮，点击后画布只画该模块子树。后端 `mindmap.tree` 的 `moduleId`/`includeSteps` 早已建好并有单测，但**零前端调用方**（积压的 T19④⑤） | apps/web(components/mindmap, workspace/module-tree-node, routes/mindmap) | — | ✅（作用域收成 `MindmapScope` 单一事实源；查询项唯一构造点；四处 guard 接入；实测改名时 52 个节点 stamp 全在=未重建）|
| W13 | **T44 用例编辑改为宽抽屉 + markdown 编辑器**（用户：「只有一个个小小的 modal 框…做成 drawer…尽量使用富文本编辑器」）：新建 384px Dialog 与编辑 768px Sheet 合并为同一个抽屉外壳（1440 视口下 1280px / 89%），抽屉内字号 12→14px；前置条件 / 步骤 / 预期结果三个字段接 CodeMirror 6 markdown 编辑器（未聚焦是原生 textarea，聚焦才挂实例）；补未保存关闭的二次确认 | apps/web(components/cases), packages/ui(textarea), apps/web/package.json | — | ✅（原文即缓冲区、无 markdown 往返，存量纯文本零改写；修掉一个 Chrome 上就会触发的 focusout 交接竞态）|

#### T10c 复核：两处真实缺陷（已授权修复并锁回归）

**① `resolveInside` 拖到自己当前父节点 → 静默重排（不是「浪费一次请求」）**

`resolveInside` 原本只早退 `target.id === active.id`。把子节点拖到**它自己的父节点**那一行上时：

```
resolveInside 返回 { kind:"move", moduleId:"a1", parentId:"a" }   ← 没有 index
moveModuleInTx: closeSlot(旧组) → countSiblings(新组,排除自身)=total
clampIndex(index, total) = Math.min(Math.max(index ?? total, 0), total)
  index 为 undefined → undefined ?? total → total
→ sortOrder 写成 total = 同级组最后一位
```

用户预期「什么都不发生」，实际节点跳到同级末尾——一次没被请求过的可见顺序变更。
修复：早退条件加 `active.parentId === target.id`。下游 `use-module-drag.ts` 的 `apply`
只处理 `invalid`/`move`/`reorder`，`noop` 自然落空，无需配套改动。

**② `collectSubtreeIds` 环形数据死循环——落点在浏览器而非服务端**

原实现无 visited 集合，环形 rows 会让 BFS 永不终止。调用点核查结果：

```
apps/web/src/components/mindmap/mindmap-cache.ts:80   ← 唯一生产调用点，浏览器内
packages/api/src/lib/module-tree.ts:83                ← wouldCreateModuleCycle 内部
```

`wouldCreateModuleCycle` **无任何生产调用方**（服务端环检测走 `modules-repository.ts` 的
独立实现 `getModuleSubtreeIds`），所以死循环卡死的是用户标签页，不是服务端。
触发需服务端下发环形数据（每条写路径都验环，概率极低），但用户无法自救而防护只要一个
visited 集合，故修复。

#### 已核实为「理论成立但当前不可达」（保留锁定当前行为的测试，不改）

`field-diff.ts` 不 diff `moduleId` / `sourceRef`。写路径核查：`cases.move` 只调
`moveTestCase` + 广播、**不进快照管道**；`updateCaseSchema.patch` 是 `caseContentPatchSchema`
不含 `moduleId`；importBatch 的 overwrite **按 sourceRef 匹配**故该字段恒定。
相邻两个版本快照的这两个字段不可能不同。测试名保留「（当前行为）」字样，作为
「若将来 move 进入快照管道则需重新评估」的书面记号。


#### T10b 复核：落点解析漏掉「拖到自己直接子节点之前」（已返工）

`module-drop-plan.ts` 的 `resolveBefore` 用 `descendantIds(active).has(parentId)` 判环，而
`descendantIds` 按设计**只含子孙、不含自身**。当落点是 active 的**直接子节点**上方的插入条时，
`parentId === active.id`，恰好落在这个集合之外：

```
拖「模块A」→ 松手在「子模块A1」上方插入条
  target = A1, parentId = A1.parentId = A.id
  descendantIds(A).has(A.id) === false   → 不触发 CYCLE
  active.parentId !== parentId           → 走 move 分支
  → { kind:"move", moduleId: A, parentId: A }    把 A 挂到 A 自己下面
```

可达性：T10b 刻意**不**禁用被拖子树内部的 droppable（为的是让非法落点也能给出明确 toast，
而不是「拖了没反应」），所以这条插入条在拖拽期间是活的。

**数据是安全的**——`packages/db/src/repositories/modules-repository.ts:163` 的
`validateMoveTarget` 显式拦 `parentId === current.id` 返回 `{kind:"cycle"}`，
router 转 BAD_REQUEST。后果是 UX 降级：用户看到的是一次服务端往返 + 全局 MutationCache 的
通用错误 toast，而不是客户端的 `CYCLE_DROP_MESSAGE`。这违反该文件头注释自立的规矩
（「服务端也有环检测，但不应让用户看到 500/400 才知道」）。

`resolveInside` 无此问题（有 `target.id === active.id` 早退）；更深层子孙的 before 落点也正常
（那时 parentId 确实在 descendantIds 内）。**只有直接子节点这一层漏**。

附带整洁问题：`reorderBefore` 硬编码返回 `parentId: null`，靠唯一调用方
`{...action, parentId}` 覆盖才正确——多一个调用方就会静默把重排挂到根层级。

#### 已批准移除：`@dnd-kit/sortable`

已核实在 `apps/web/src` 与 `packages/` 内**零 import**，只有 `@dnd-kit/core` 被真正使用。
树结构下 sortable 的扁平列表投影会把「改挂」和「同级重排」混成一个语义，落点只能自己建模，
这个判断成立。留着未使用依赖会误导后来者，已让 T10b 一并 remove（它是本轮唯一依赖安装方）。

### mind-elixir 5.15.1 实测要点（与设计期推测不符，勿按旧认知改回）

- **`overflowHidden: true` 不是样式开关**：源码里它决定是否绑定整个指针交互层（`pointerdown/move/up/click/contextmenu/wheel`），开启后节点选中、拖拽、双击进编辑全部失效，画布退化为只读预览。`.map-container` 自身 CSS 已有 `overflow:hidden`，该选项对本项目零收益，**必须不传**。
- **没有 `dblclick` 事件**：双击是 `pointerup` 内自实现的检测（`E < 300 && E > 0 && lastTapTarget === target`）。注意 `E > 0`——两次点击落在同一毫秒会被判为单击，无头浏览器的 `page.dblclick()` 正好触发此边界，测试需手动隔开两次 click。
- **`operation` 载荷**：单节点事件是 `{name, obj}`，移动/删除是 `{name, objs, toObj}`（复数）；`insertSibling` 额外带 `type: 'before'|'after'`；`finishEdit` 的 `origin` 是**旧文案字符串**而非 NodeObj。用 `"objs" in operation` 收窄。
- **`before` 钩子收到的是 `Topic`（DOM 元素）不是 `NodeObj`**，需取 `.nodeObj`；可为 async（删除二次确认即靠此）。`moveNodeAfter/Before` 的 `to` 是**兄弟节点**（父级要取 `to.nodeObj.parent`），只有 `moveNodeIn` 的 `to.nodeObj` 才是父级。
- **`editTopic()` 绕过 `before`**：故「双击用例→跳转详情」用 `before.beginEdit` 否决即可，右键菜单的「重命名」仍可用。
- **库自带后代检测**：拖到自己子孙上时库层面就不出 `insert-preview`，根本不调 `before`——自写的环检测是第二道防线（键盘/API 路径）。测试非法拖拽时**必须挑非后代目标**，否则是假通过。
- **内置右键项无开关**：`contextMenu.extend` 只能追加，add_parent/summary 需 init 后按 `#cm-*` id 从 DOM 移除。

### 已接受的实现偏差（review 判定合理，勿"修正"回去）

- **AI 面板判别 SERVICE_UNAVAILABLE 用 `error instanceof ORPCError && error.code === "..."`，而非 plan 写的 `isDefinedError`**：`isDefinedError<T>(e: T)` 对 `catch` 里的 `unknown` 求交得 `never`，随后访问 `.code` 触发 TS2339；`ORPCError` 定义了 `static [Symbol.hasInstance]`（已核 `@orpc/client@1.15.0` 类型声明 :130），跨依赖图 instanceof 成立。`isDefinedError` 仍适用于 mutation `onError`（那里 error 已是 typed），用例保存冲突处即用此法。
- **`overwrite` 不移动 `moduleId`、`create-anyway` 把 `sourceRef` 置 null**：v1 明确行为，已写入 MCP 工具描述与 Skill 文档。
- **服务端 `presence:sync` 只回发「其他人」，本端条目由前端 `PresenceStore.setSelf()` 注入**：服务端一旦回发本端 `presence:update` 即以服务端版本为准，最终一致；改服务端也可行但需动 apps/server，v1 采纳前端方案。

#### `createAgentDeps` 的 projectId 传递方式（已核，非问题）
`packages/api/src/lib/ai-deps.ts` 中 `readExistingCases` 用**闭包** `projectId` 限定查询，因此即使模型编造别的项目的 `moduleId`，`listTestCases` 也查不出数据——越权读取路径是闭合的。
`listModulesOutline` 用的是**入参** `targetProjectId` 而非闭包，看似与上方注释「projectId 作为闭包」不符；但该工具 `inputSchema` 为空对象 `z.object({})`，`createAgentTools` 内部固定以 `context.projectId` 调用，模型没有任何通道影响该值，**不存在可达越权**。保留现状，勿为此改 `AgentDeps` 接口签名。

#### 脑图外部重绘丢失选中态与画布位置（v1 已知限制，非缺陷）
他人改动到达时，`MindmapSyncRunner.apply()` 走的是 mind-elixir 全量 `refresh()`，会重建整棵 DOM，因而丢失当前选中节点与画布的平移/缩放位置。
做成节点级增量 patch 的前提是实时通道下发**变更明细**，而当前 `data:invalidate` 只有 entity 粒度的失效信号（见 §5 协议），改造面涉及协议与所有发布点，不在第一期范围。
已通过 `isBusy()` + `deferred` 把重绘推迟到「无在途请求且无 `#input-box`」的时刻，因此不会在用户输入途中打断——可接受。

#### 门禁命令：`biome check` 与 `ultracite check` 在本仓库等价（勿传错误认知）
曾有 agent 断言「`npx biome check` 读仓库 `biome.json`，而 ultracite 预设规则（`noParameterProperties` / `useDestructuring` / `useSingleJsDocAsterisk`）不在其生效集合里，因此会漏报」——**该结论错误**：
- `biome.json` 的 `extends` 为 `["ultracite/biome/core", "ultracite/biome/react", "ultracite/biome/tanstack"]`，预设已生效；
- 两条命令解析到的是同一个 `@biomejs/biome@2.5.9`；
- 用同时含参数属性与 `const x = this.x` 的探针文件实测，两条命令报出**完全相同**的诊断。

真实原因是该 agent 在最后一次编辑**之前**自检，属时序问题。结论：前几轮以 `biome check --diagnostic-level=error` 得出的门禁结论依然有效；正式门禁仍以 `pnpm check`（即 `ultracite check`）为准，且**自检必须在最后一次写文件之后执行**。

#### 门禁命令：`biome check` 与 `ultracite check` 在本仓库等价（勿传错误认知）
曾有 agent 断言「`npx biome check` 读仓库 `biome.json`，而 ultracite 预设规则（`noParameterProperties` / `useDestructuring` / `useSingleJsDocAsterisk`）不在其生效集合里，因此会漏报」——**该结论错误**：
- `biome.json` 的 `extends` 为 `["ultracite/biome/core", "ultracite/biome/react", "ultracite/biome/tanstack"]`，预设已生效；
- 两条命令解析到的是同一个 `@biomejs/biome@2.5.9`；
- 用同时含参数属性与 `const x = this.x` 的探针文件实测，两条命令报出**完全相同**的诊断。

真实原因是该 agent 在最后一次编辑**之前**自检，属时序问题。结论：前几轮以 `biome check --diagnostic-level=error` 得出的门禁结论依然有效；正式门禁仍以 `pnpm check`（即 `ultracite check`）为准，且**自检必须在最后一次写文件之后执行**。

#### 已决策的延后项（本期刻意不做，非遗漏）
- **`test_cases.tags` 的 GIN 索引**：标签筛选 SQL 为 `tags ?| $1::text[]`，无 GIN 索引时走顺序扫描。实现方提示用例上千后应加 `USING gin (tags jsonb_ops)`（注意 `?|` 走默认 `jsonb_ops`，`jsonb_path_ops` 只配 `@>`）。当前数据量下属过早优化，且 §1 索引清单已评审通过，故记为扩容项。
- **`db:seed` 的运行方式**：根目录无 tsx 且当轮禁止装依赖，脚本经 `pnpm --filter server exec tsx` 借用 apps/server 的 tsx，并以相对路径导入 `packages/db` 的 repository。DB 操作本身仍全部收在 `packages/db/src/repositories/seed-repository.ts` 内，未违反「禁止其他包直连 drizzle」的硬规则。日后可把 tsx 提到根 devDependencies 并给根加 `@automationstack/db` workspace 依赖以简化。
- **AI 提案列表虚拟化**：单批上限 10 条，多批累积才可能变长；已要求实测后再决定，不预先引入虚拟化库。

#### T12 交出的三项待裁决（已裁决）

| 项 | 事实 | 我的裁决 |
| --- | --- | --- |
| 缓存漏 `mindmap` key | `use-case-mutations.ts:20` 的 `useInvalidateCases` 只 invalidate `orpc.cases.key()`；实时链路对**自己触发**的事件跳过，QueryClient 默认 `staleTime: 60_000`，故自己改完步骤切到脑图 60 秒内看旧数据。已逐行确认属实，且是**既有缺陷**（改用例名同样不同步），加步骤只是把可见度放大一个量级 | **修**，一行，并入 T14 的 apps/web 落地范围 |
| 外部重绘折回展开态 | `apply()` 走 `mind.refresh()` 全量重建，用例节点每次回到 `expanded:false`；以前用例是叶子无展开态可丢，现在有了 | **v1 接受**，记为已知限制。保留需在 `apply()` 前采集展开态快照再回填，收益不抵改动面与回归风险 |
| 载荷未压缩（26.5KB 裸 JSON，加 compress 可 -85%） | 服务端确无压缩中间件 | **不做**。compress 中间件会缓冲 SSE，而 AI 生成走的正是 oRPC event-iterator 流式响应，破坏流式的风险远大于 26KB 的收益。规模真正变大时应先做按需懒加载而非压缩 |

#### T13 交出的三项脚手架残留（已核实，转入 T14 处理）

T13 按「宁可漏删不可误删」的要求保留并上报，我独立核实后确认三项都属于用户要清的「初始化原来带的代码」：

| 项 | 位置 | 核实结果 |
|---|---|---|
| `--sidebar-*`(9) / `--chart-1..5`(5) 色板 token | `packages/ui/src/styles/globals.css`，约 39 行 | 全仓 TS/TSX 零引用，shadcn 脚手架产物。归入 T14 的 better-colors 轮次（该轮本就要动 token） |
| 英文兜底 404 | `apps/web/src/router.tsx:13` `defaultNotFoundComponent: () => <div>Not Found</div>` | 非死代码但是脚手架遗留：全站简中里的英文裸 div，无样式无导航出口。归入 T14 的 better-ui/a11y 轮次 |
| `@shadcn/react` 孤儿依赖 | `packages/ui/package.json:18` | 删除 `message-scroller.tsx` 后全仓 0 处 import。需动 lockfile，故必须**串行**执行（同一时刻只允许一个装/卸依赖的 agent） |

#### T11 复核：门禁与语义完整性（通过）

两次断线（ECONNRESET / 529）曾把 `case-table.tsx` 改坏到无法编译，已重建。复核动作与结论：

- **四项基线逐位复核，与 T11 前完全一致**：`ultracite check` 228 文件 / 0 error / 45 warning / 1 info；`eslint . --no-cache` 0 error / 3 warning（均为 `apps/server/src/index.ts` 既有 `no-console`）；`check-types` 7/7；`pnpm test` 67/67。`pnpm --filter web build` 通过。
- **仓库硬规则**：`check-file-rules.js` / `check-tailwind.js` 对全部 14 个改动文件 exit=0；全仓 grep 确认 `transition-all`、`scale-[`、`stroke-[` 只余注释中的「等价写法」说明，无实际任意值。
- **语义完整性抽查**（tsc 抓不到的一类）：`case-table.tsx` 七列语义完整（优先级/状态 Badge 的 `variant={...}`、`CASE_TYPE_LABELS`、`maintainer ?? —`、`formatDateTime` 均在）；`ai-proposal-item.tsx` 的 `memo(ProposalRow)` 与 `useCallback` 未被拆，新增的只有静态字符串 className，未引入每次渲染换引用的内联对象；`module-drag-parts.tsx` 的 `aria-label` 与 `module-drop-plan.ts` 未被触碰。
- **改动合理性**：Dialog/AlertDialog 的 `data-starting-style`/`data-ending-style` 写法与仓库既有的 `sheet.tsx`（未被本轮改动）完全一致，非臆造；`press-scale` 排除 `[aria-haspopup]` 保留了原 `translate-y-px` 的语义；reduced-motion 用 `0.01ms` 而非 `none` 是对的——Base UI 弹层靠 `transitionend` 卸载，`none` 会让它卡在挂载态。
- **刻意不改**：popover / dropdown-menu / select 仍是 `animate-in`（改造需重排一组 side 变体，属重做非打磨）；列表项边框判定为结构而非伪高度，不加投影；设计系统为直角变体（`rounded-none` 贯穿），同心圆角命题不适用。

**遗留（需人工验收）**：Dialog/AlertDialog 进出场观感与快速连点是否残留、空态图标淡入手感、`prefers-reduced-motion` 真机表现——三者均无头环境不可验。

## 8. 验证方式（验收基准）

- 基础：`pnpm db:start` → `pnpm db:migrate` → `pnpm dev`；healthCheck 通过
- CRUD/版本：项目→模块树→多步骤用例→改两次出 v1..v3→对比高亮→回滚生成 v4
- 冲突：两 Tab 同时编辑同一用例，后保存者收到「已被 XX 修改」
- 实时：两 Tab 同项目互见头像/光标；A 保存 B 自动刷新；A 编辑 B 见「正在编辑」
- 脑图：画布增删改/拖动，切列表视图数据一致；非法拖拽被拒还原
- AI：配置 env 后流式生成→勾选采纳→draft 入库带「AI 生成」版本记录；未配置报 SERVICE_UNAVAILABLE
- MCP：inspector 连 /mcp 调通五工具；Claude Code 用 skill 迁移样例 Excel，重跑全 skipped（幂等）
- 质量门：`pnpm check` + `pnpm check-types` 全绿

## 9. 实现期待验证项（子 agent 落地时确认）

oRPC 1.14.12 event-iterator 导出名；openai-compatible provider(model) 形态；fullStream chunk 类型名；@hono/node-server@2.0.12 websocket serve 选项形态；RPCLink headers 签名；mind-elixir 5.x move 事件名与右键菜单扩展 API；ClientOnly 在 @tanstack/react-router ^1.170 的导出。


---

## T14 裁决（三轮界面评审 → 落地分派）

三份只读评审报告（T14a better-ui / T14b better-colors / T14c better-accessibility）均带 Chrome CDP 实测证据。合并去重后按下表裁决，再按**互不相交的文件域**分派三个实现者并行落地。

### 采纳（HIGH）

| # | 问题 | 证据 | 落地 |
| --- | --- | --- | --- |
| 1 | Popover/DropdownMenu 用 keyframes 做进出场，退场播到一半重开会跳回位移起点并重播 | CDP `Animation.setPlaybackRate` 10% 速度实测 | T16 |
| 2 | 320px 视口下工作区内容列坍缩到 63px，且被 `overflow-hidden` 截断，26 个交互控件不可达 | 实测 `grid-template-columns` 解析为 `256px 1px 63px`；表格容器 clientWidth 31 / scrollWidth 600 | T17 |
| 3 | 协作头像是不可聚焦、无可访问名的 span；Base UI 默认就渲染 button，是 `render` 覆盖把它降级了 | 读 `TooltipTrigger.mjs:203` 确认 `useRenderElement('button', ...)` | T17 |
| 4 | 键盘拖拽播报从不说出目标模块名：5 次方向键得到 4 句相同播报 | CDP `Input.dispatchKeyEvent` 逐步对照视觉落点与 live region 文本 | T17 |
| 5 | 翻到末页时「下一页」变原生 disabled，焦点掉到 body，键盘用户被甩回 tab 序起点 | 实测 `document.activeElement` 变为 BODY | T18 |
| 6 | 优先级与状态徽章撞色：P1 与「生效」、P2 与「草稿」、P3 与「废弃」在相邻两列像素级相同 | 我本人核实 `case-meta.ts:20-37` | T18 |
| 7 | P0 徽章 APCA 仅 44.5（门槛 60）——全站唯一带真信号的徽章最难读 | APCA-W3 0.1.9 实测 | T16 |
| 8 | `--muted-foreground` APCA 47.6~51.2，68 处使用含表格时间戳列 | 同上 | T16 |
| 9 | 协作色板首色 `#e11d48` 距 `--destructive` 仅 4.6° 色相，哈希到此的用户光标像报错 | 实测 `identity.ts:13-22` | T17 |
| 10 | 脑图优先级标签是硬编码亮色 hex，糊在暗色画布上 | `mindmap-adapter.ts:78-86` | T18 |
| 11 | `useInvalidateCases` 漏了 `orpc.mindmap.key()`，列表改完切脑图看到旧数据 | 我本人核实 `use-case-mutations.ts:17-22` | T18 |
| 12 | 404 是英文裸 `<div>Not Found</div>`，无标题无 landmark 无出口 | 实测 `/no-such-page` 的 headings/landmarks/links 全为空 | T17 |

### 采纳（MEDIUM）

`transition: all`（`duration-100` 无配套 transition-property）、模块树行缺过渡、未接 `data-instant`、Select 的 12 个死动画类（`alignItemWithTrigger` 恒为 true 使 `animate-none` 永远命中）、Tooltip 的 `data-[state=delayed-open]` Radix 残留、Collapsible 高度过渡、`--input` 1.47:1 与 `--border` 1.26:1（低于 WCAG 1.4.11 的 3:1）、协作头像白字在 3 个色上不达标、Sheet/Dialog 的英文 "Close"、缺跳过导航链接（顶部到分页条需 63 次 Tab）、三个路由 document.title 相同、结果数变化对读屏静默、表格选中行只靠颜色、用例名该是 Link 不是 button、用例表单没有 `<form>`（同仓库 `project-form-dialog.tsx:127` 已写对，属内部不一致）、409 冲突说明放在 5.4s 后消失且无关闭按钮的 toast 里、editing-notice 的 live region 随内容一起挂载。

### Sonner 主题是个真 bug

`sonner.tsx` 调了 `useTheme()`，但全仓 grep 确认**没有任何 ThemeProvider**，`next-themes` 唯一引用就是这一行。于是 `theme` 恒为 `"system"`，Sonner 跟随**操作系统**主题——在亮色模式的机器上，每个 toast 都是亮色卡片糊在硬暗色应用里。改为 `theme="dark"` 显式表达。

### 驳回

| 建议 | 驳回理由 |
| --- | --- |
| 删掉亮色半边调色板 | `--radius` 只定义在 `:root`，且 `packages/ui` 有三十多处 `dark:` 变体依赖亮色基线才有语义；删了更糟。「只发暗色」这个决定改由 `theme="dark"` 单点表达 |
| 暗色模式去掉投影 | 评审方自己也不主张，且会回退 T11 轮的既有结论 |
| 图标 swap 补 scale/blur | 现有交叉淡入是刻意实现且工作正常，收益存疑、回归风险大于收益 |
| 合并 Skeleton 与 spinner | 两者并存是刻意的（骨架用于首屏、spinner 用于操作中） |
| 给 oRPC 加 compress 中间件（T12 遗留） | 会缓冲 SSE 与 AI 生成流（event-iterator），26KB 的节省不值得破坏流式。**注意与 T15 的 gzip 建议不同**：T15 指的是给 `mindmap.tree` 这类普通 JSON 响应开压缩，需按路由排除流式端点 |

### 落地分派（文件域互不相交）

| 实现者 | 文件域 | 独占权限 |
| --- | --- | --- |
| T16 | `packages/ui/src/components/` 12 个组件 + `styles/globals.css` + `package.json` | **本轮唯一可动 lockfile 者**（删孤儿依赖 `@shadcn/react` 0.2.1、可能的 `next-themes`） |
| T17 | `router.tsx`、`__root.tsx`、`routes/projects/**` 两个路由、`apps/web/src/index.css`、`realtime/` 四个文件、`components/workspace/` 三个文件、`components/projects/project-list.tsx` | **本轮唯一可动 `apps/web/src/index.css` 者**（即唯一可新增 `@utility` 者） |
| T18 | `components/cases/` 九个文件 + `components/mindmap/mindmap-adapter.ts` 的 `PRIORITY_TAG_STYLES` 一个常量 | — |

跨域协作点已在派单中显式约定：T17 在 `__root.tsx` 加 `href="#main"` 跳过链接，`projects/index.tsx` 的 `<main>` 由 T17 加锚点、`case-list-view.tsx` 的 `<main>` 由 T18 加；T16 给 `button.tsx` 加 `aria-disabled` 视觉态，T18 消费它把分页按钮从原生 disabled 改过来。

### 门禁脚本的正确调用方式（本轮更正）

`scripts/check-tailwind.js:83` 与 `scripts/check-file-rules.js` 都是 `process.argv.slice(2)` 取文件列表，由 `lefthook.yml` 的 `{staged_files}` 喂入——**不带参数直接跑会打印「没有文件需要检查」并 rc=0，是空操作**。此前多轮验收里裸跑这两个脚本得到的 rc=0 不构成任何证据。

全仓验证的正确写法（必须包含未跟踪文件——本仓库只有一个提交，本期绝大多数新文件尚未 `git add`）：

```
FILES=$( { git ls-files; git ls-files --others --exclude-standard; } \
  | grep -E '\.(ts|tsx|js|jsx|cjs|mjs)$' | grep -v routeTree.gen )
node scripts/check-tailwind.js $FILES
node scripts/check-file-rules.js $FILES
```

按此方式对全部 202 个文件实测：两项均通过。即**结论未变，变的是验证方法**。注意 tailwind 这一项的「通过」仍受下述逐行扫描缺陷限制。

### 检查器缺陷（记录，暂不修）

`scripts/check-tailwind.js:30` 的 `cn\(([^)]*)\)` 要求左右括号同行，而多行组件里 `cn(` 与 `)` 必然跨行，因此该正则**从不命中**。我用整文件扫描器复量后确认：真·任意值约 **20 处，全部在 `packages/ui` 的 vendored shadcn 组件里**（bubble/button/card/sheet/dialog/scroll-area/badge/dropdown-menu/alert-dialog），`apps/web` 干净。本轮由 T16 顺手消除其中在它文件域内的部分；`scroll-area.tsx` 与 `alert-dialog.tsx` 不在任何人域内，留待下一轮。检查器本身是否改为跨行扫描，待任意值清零后再决定——先改检查器会立刻炸出一堆红，反而阻塞本轮落地。

---

## T15 实测结论（脑图规模）

8 个档位（100/300/600/1000/2000/4000/6000/10000 条用例）全部实测，拐点用相邻档**夹逼**而非外推。数据经 oRPC 正常路径灌入，两个临时项目测完已删除，种子项目未受影响。

### 用户的原始担心可以排除

**平移帧率不是瓶颈。** 10000 条用例 / 10966 个渲染节点 / 111336 个 DOM 元素下，平移仍是 59~60 fps，p95 帧 18.2ms。原因是 mind-elixir 平移只改 `map` 元素的 `translate3d`（`MindElixir.js:755`），是合成层位移，与节点数几乎无关。已用 `Page.startScreencast` 的真实帧时间戳交叉验证（6000 档 rAF 60.0 vs 投射 60.0；10000 档 59.0 vs 59.2），排除「主线程 rAF 掩盖合成器丢帧」的可能。

### 三堵墙的位置

| 指标 | 拐点 | 性质 |
| --- | --- | --- |
| `refresh()` 全量重建 > 50ms（肉眼可感） | ≈ 660 条用例 | **高频**：每次队友保存都来一次 |
| `refresh()` > 200ms（明显卡顿） | ≈ 2650 条 | 同上 |
| `refresh()` > 500ms | ≈ 6300 条 | 同上 |
| 首屏（画布可归因段）> 1s | ≈ 5700 条 | 一次性 |
| 平移 < 50 fps | 实测范围内不存在 | — |

单位成本：载荷 662 B/用例（裸）、gzip 后 38 B/用例；refresh 0.077 ms/用例；DOM 10.2 元素/渲染节点。渲染节点数恰好等于 `1 + 模块数 + 用例数`，**验证了折叠子树零 DOM 成本这一前提**。

### 压测撞出的、原方案没覆盖的两件事

**① 最先撞墙的不是画布，是模块树侧边栏。** 约 1.5 ms + 24 个 DOM 元素 / 模块，且**列表页同样付这个钱**（对照实验：无画布的列表页 long task 合计 861ms，整页 24777 个 DOM 元素，其中 23473 在 `<aside>` 内）。模块数超过约 400 时，侧边栏主线程开销就超过画布本身。原先的五个候选方案没有一个能治它。

**② 服务端没开压缩。** 带 `Accept-Encoding: gzip` 请求，响应无 `content-encoding`。压缩比稳定 9%：1000 条 646 KB → 39.8 KB，10000 条 6.31 MB → 375 KB。这是性价比最高的一条。

### refresh 的成本拆解（6000 条实测）

| 分项 | 耗时 | 占比 |
| --- | --- | --- |
| 全量 `refresh(data)` | 434.7 ms | 100% |
| ↳ 库内 `JSON.parse(JSON.stringify())` 深拷贝 | ≈70 ms | 16% |
| ↳ `layout()` 清空重建整棵 DOM + 回流 | 228.7 ms | 53% |
| ↳ `linkDiv()` 重建全部 SVG 连线 | 145.6 ms | 33% |

两个可白拿的点：`MindElixir.js:817` 是 `e && (e = JSON.parse(JSON.stringify(e)), ...)`，**不传参调 `refresh()` 就完全跳过克隆**，立省 16%；`MindElixir.js:1348` 的 `linkDiv(wrapperEl)` 支持只重画指定 wrapper 的子连线。
另有一个体验 bug：`refresh()` 第一行是 `clearSelection()`，**每次队友保存都会清掉当前用户的选中态**。

### 展开步骤的代价远超节点数比例（对护栏阈值有直接影响）

1000 条项目下展开 15 条用例：节点数只涨 6.7%（1099 → 1173），**refresh 涨 33%**（76.5 → 101.5ms）。换算：展开的用例 ≈ 1.7 ms/条，折叠的 ≈ 0.077 ms/条，**贵 22 倍**（步骤文本长、layout 测量贵、多一层 sub-branch SVG）。所以节点预算不能只数用例数。

### 派生优化项（另开 W10/T19，不并入 T14）

按性价比排序：

1. **服务端开 gzip**（排除 SSE / event-iterator 流式端点）——载荷降 91%，风险为零
2. **模块树侧边栏虚拟化或默认只展开到二级**——实测最先撞墙处，且列表页同样受益
3. **远端 invalidate 做 300ms 尾沿合并**——现有 `mindmap-sync-runner.ts` 的 `isBusy()` 是「延后重绘」不是「合并」，连续 5 个 invalidate 仍各触发一次 `apply()`。合并后 1000 条场景 385ms → 77ms。顺手把 `refresh()` 改成不传参 + 就地更新 `nodeData`，再白拿 16%
4. **`mindmap.tree` 接受可选 `moduleId`**（`packages/api/src/routers/mindmap.ts:93` 现在只接 `projectId`）——实测把拐点从「全项目 6300 条」推到「单模块 6300 条」，135 条的一级模块作用域 refresh 仅 9.4ms（91× 提速）。配合 `includeSteps: false` 一起做（现在每条用例白送永不渲染的 steps，1000 条时 6099 个对象 vs 1099 个 DOM 节点，深拷贝要遍历 5.5 倍于实际渲染量）
5. **节点预算护栏，阈值 1200 个渲染节点**，且需二级护栏（模块节点本身超 1200 时只展开到二级模块层），并对「同时展开的用例数」单独限制
6. （可选，治本）用 `nodeOperation` 增量路径替代 `refresh()`——只在 1~5 做完仍不够时才值得

一句话：平移不用管；画布的墙在 5700~6300 条，比预想的远；真正近在眼前的是没开的 gzip 和按模块数膨胀的侧边栏。


## T18 复核结论（apps/web 用例视图层）

逐文件读源码 + 交叉验证 CDP 数据，**11 项全部落地，全部接受**。以下只记录我复核时的判断，不复述报告。

### 接受并认可的三处偏离原分派

| 项 | 原分派 | 实际做法 | 我的判断 |
| --- | --- | --- | --- |
| A 徽章撞色 | 在 `case-table.tsx` 内叠 className | 改 `case-meta.ts` 的**变体映射** | **更优**。`PRIORITY_BADGE_VARIANTS` / `STATUS_BADGE_VARIANTS` 还被 `case-detail-view.tsx`、`versions/version-snapshot-view.tsx`、`ai/ai-proposal-item.tsx` 三个域外文件消费；只改表格等于只修一处症状。变体级修复让三处自动受益，且一行都没碰它们。 |
| 越权改文件 | 未授权 `mindmap-adapter.test.ts` | 改了一条断言 | **必要且最小**。该测试硬断言 P1 旧十六进制 `#ffedd5`/`#c2410c`，任务 G 一改 `PRIORITY_TAG_STYLES` 必然让 `pnpm test` 变红。我读了改后断言（第 106-114 行 `var(--primary)` / `var(--primary-foreground)`），与实现一致。 |
| 门禁调用 | 我给的命令里两个脚本不传参 | 主动补传 35 个文件重跑 | **它是对的，我给错了**。这条我已在《门禁脚本的正确调用方式》一节记过；T18 是第二个独立发现的 agent。 |

### 我另行核实的点

- `packages/ui/src/components/table.tsx` 无 `border-collapse` 声明 → 走 Tailwind preflight 的 `collapse`，`<tr>` 上的 `border-l-2` 在折叠模型里会真正绘制（2px 胜过单元格默认无左边框），选中竖条不是只存在于 `getComputedStyle` 里的假象。
- `badge.tsx` 已含 `ghost` 变体（T16 本轮正在改的同一文件），P3 → `ghost` 的映射类型与运行时都成立。
- `case-detail-sheet.tsx` 的「保存」按钮在 `SheetHeader` 内、`<form>` 在 `CaseDetailBody` 内，靠 `form="case-editor-form"` 跨 DOM 关联；与 CDP 读到的 `saveOwnerForm` 一致。
- `use-case-mutations.ts:21-27` 现在同时失效 `cases.key()` 与 `mindmap.key()`，脑图缓存缺陷已闭合。

### 已知残留（不阻断）

1. **种子数据版本号不可逆**：「普通商品下单成功」内容已完全还原，但 `currentVersion` 由 v1 变为 **v3**，`case_versions` 多两条历史。内容正确，版本号无法经 UI 回滚。**任何后续 agent 不得对该用例的版本号做硬断言**；确需干净基线时重跑 seed。
2. **状态点只在 `case-table.tsx` 渲染**：另外三个消费者拿到的是无状态点的 outline 徽章。「不能只靠颜色」在那三处靠文字标签满足（文字是合法的非颜色线索，不违规），但与表格不一致。→ T22。
3. **`case-conflict-alert.tsx` 的 `role="alert"` 是动态插入的**：与它自己在结果数那里坚持的「常驻 live region」原则相反。`alert` 的动态插入播报支持面比 `status` 好，且同时有 toast 兜底，本轮不改。

---

## 我的分派漏洞：脑图路由没有 `<main>`

`__root.tsx:56-61` 的「跳到主要内容」指向 `#main`。四条路由里：`projects/index.tsx`（含 pending 分支）、`router.tsx` 的 404 页、`case-list-view.tsx` 都有 `<main id="main" tabIndex={-1}>`；**`/projects/$projectId/mindmap` 一个都没有**——既无锚点也无 `main` 地标。

这不是 T17 或 T18 的疏漏：T17 分到「加跳转链接 + `projects/index.tsx` 锚点」，T18 分到「`case-list-view.tsx` 锚点」，**脑图路由不在任何人的域内，是我拆任务时漏的**。脑图页恰恰最需要它（左侧模块树 + 顶部 Tab 要按几十次 Tab）。已开 T21 单独修，要求覆盖 `ClientOnly` fallback / `Suspense` fallback / loading / error / 正常五种分支，并实测画布高度不塌。

---

## 实机截图裁决：`--border` 36% 维持，并牵出一个交叉缺陷

T16 对我在 T14 裁决里下的 ⑤.2（把深色 `--border` 从 10% 提到 36%）提出反对，理由是 `--border` 同时喂给「控件边界」和 `<tr>` 装饰分隔线，而 WCAG 1.4.11 只管前者，一刀提上去会把表格变成明显的网格。这个提法在原则上成立，所以我没有让它改，改为自己出实机证据再裁。

**先记一次我自己的方法错误**：第一轮对比无效。上一轮为了模拟旧值注入的 `<style>` 一直留在 DOM 里，导致「36% 版」和「10% 版」两张截图其实都是 10%——两张图看起来一样，我差点据此下结论。清掉 override、`Page.reload({ignoreCache:true})` 之后才拿到真实对照。**结论：CDP 注入式对比必须在每次取样前显式移除上一次的注入节点，并把当时的 `getComputedStyle` 实测值和截图一起留档，不能只看图。**

真实对照（1440×900@2x，同一模块 48 条用例）：

- **10% 下丢的不是分隔线，是控件边界**。状态列与标签列的 outline 徽章边框几乎不可见，读作「浮在行里的一串文字」，徽章的边界感整体消失——这正好是 1.4.11 要保护的那一类。
- **36% 下 `<tr>` 分隔线并没有变成明显框线**，是克制的发丝线，表格仍读作干净列表。T16 担心的失败模式在这个渲染里没有兑现。

**裁决：维持 36% / 38%。** T16 的原则保留备用——将来若某个高密度视图真的显得重，正确做法是拆一个 `--separator` 令牌给装饰线，而不是把 `--border` 调回不达标的值。

### 同一批截图里发现的交叉缺陷（→ T23）

深色主题实测像素值（页面底色 `rgb(10,10,10)`）：

| 优先级 | 填充 | 文字 |
| --- | --- | --- |
| P0 | `rgba(255,174,168,0.149)` | `rgb(255,170,167)` |
| P1 | `rgb(212,212,212)` 实心 | `rgb(23,23,23)` |
| P2 | `rgb(38,38,38)` 实心 | `rgb(250,250,250)` |
| P3 | 透明 | `rgb(250,250,250)` |

P1 的填充亮度约为 P0 有效填充的 4.6 倍，是整行最抢眼的元素。**这是 T16 与 T18 各自正确的改动叠加出来的**：T16 的 H 任务因 `oklch(0.704 0.191 22.216)` 超出 sRGB 色域，被迫把 `--destructive` 降到 `0.82 0.1`（该处 L 下最大 C 仅约 0.10，无解）；T18 的 A 任务把 P1 映到 `default`（= `--primary`）。两个 agent 单独看都没有做错，谁也不可能独自发现——**这类跨范围回归只能靠交叉验收时看真实渲染，不能靠读各自的报告。**

修法不是把 P1 降下去（`secondary` 已被 P2 占用，`outline` 被状态列独占，降无可降），而是把 P0 抬上来：补 `--destructive-foreground` 令牌 + `destructive-solid` 实心变体，P0 用实心红、P1 接手原来的淡红填充。最终强调顺序为「实心红 ≈ 实心中性 > 实心暗灰 > 无填充」，P0 与 P1 的亮度接近但靠色相（危险色）分出高下，P2/P3 保持单调递减。

---

## T14 验收范围的一个诚实边界：本轮只验证了深色

`apps/web/src/routes/__root.tsx:47` 是 `<html className="dark" lang="zh-CN">`，全仓没有任何 ThemeProvider（`packages/ui/src/components/sonner.tsx:15-16` 是唯一显式记录该决定的地方——它原先经 `next-themes` 的 `useTheme()` 取值，而在无 Provider 时该值恒为 `"system"`，等于一直在骗自己）。

因此：

- `globals.css` 里 `:root` 那份浅色调色板**在本应用里永远不会渲染**。T16 为浅色令牌做的 APCA 计算是纸面推导，不是实机验证，`--success` 的浅色值 `oklch(0.5 0.13 139)` 同理。
- 保留浅色令牌是对的（`packages/ui` 是共享包，将来接主题切换时需要），但**不能把「浅色已验证」写进验收结论**。
- 我这轮所有截图、CDP 取色、APCA 复核**一律是深色下的**。向用户交付时必须如实说明这一点。
- 附带一个待观察项（本轮不改）：`@custom-variant dark (&:is(.dark *))` 匹配的是 `.dark` 的**后代**，`<html>` 自身不在其中。若将来有人在 `<html>` 上直接写 `dark:` 工具类会静默失效。目前无此用法。

---

## T21 复核（脑图路由主地标）

改动极小且落点正确：`mindmap.tsx` 把 `<main className="h-full" id="main" tabIndex={-1}>` 包在 `<ClientOnly>` **外层**而不是写进 `MindmapView`。这是唯一正确的层级——ClientOnly fallback、Suspense fallback、MindmapView 自己的 loading/error 三态都不经过 `MindmapView` 的正常返回值，写在里面那几个分支就没有地标。`h-full` 是必需的，`<main>` 是新插的一层，断一环画布高度就塌成 0。文件 36 → 51 行。

**我没有采信它的报告，自己在浏览器里重测了一遍**（1440×900，演示项目脑图路由）：

| 检查项 | 实测 |
| --- | --- |
| `<main>` 数量 / `#main` 数量 | 1 / 1（全页唯一） |
| `main` 矩形 | `1183×849 @ top 51` |
| `.map-container`（mind-elixir 根） | `1183×849 @ top 51` |
| 画布宿主 `div.h-full.w-full` | `1183×849 @ top 51` |
| 纵向滚动条 / document | 无 / `900 = 900` |
| `main.tabIndex` | `-1` |
| 跳转链接端到端（Tab → Enter） | Tab 命中「跳到主要内容」→ Enter 后 `document.activeElement` = `MAIN#main`（改动前焦点原地不动，是死链） |

三个矩形逐像素相同 → 高度链没断，`<main>` 没有额外吃掉或撑开空间。DOM 内节点 63 个，与 T15 「折叠子树不进 DOM」的结论一致。

**它顺带更正了我一处措辞**：mind-elixir 5.15.1 的根元素类名是 `.map-container`，不是我说的 `.mind-elixir`。属实，我上面的表按 `.map-container` 量。

### T21 报的新缺陷（已确认，另行归档，不阻断）

`apps/web/src/router.tsx:61` 的全局 `defaultPendingComponent` 是一个只有 `aria-hidden` 转圈图标的 `<Loader />`，**不含任何地标**。于是：① 所有 `ssr:false` 路由的服务端响应里没有 `<main>`（`curl` 脑图路由，`id="main"` 出现 0 次，而列表路由是 1 次）；② 任何路由 pending 期间页面处于「零 `<main>`」状态。

**本轮不修**，理由是 T21 的论证成立：跳转链接必须先被 Tab 到才有意义，而那要求 JS 已可交互，那时 `<main>` 已经在了。真要修也不是加个 `<main>` 那么简单——它会和路由自己的 `<main>` 在切换瞬间同时存在，破坏唯一性，需要先设计。→ 归入 T20。

---

## T16 复核（packages/ui 令牌与变体）

`--destructive-foreground` 与 `destructive-solid` 变体已落地，代码与报告一致（`globals.css:30-32/66-69/90`、`badge.tsx:20-24`）。

**它偏离了我给定的值，而且它是对的。** 我给暗色 `--destructive-foreground` 定的是 `oklch(0.205 0 0)`，它用了 `oklch(0.145 0 0)`，理由是我只算了实心态、没算 hover。我自己重算复核：

| 暗色前景 | 实心 `--destructive` 上 \|Lc\| | hover `bg-destructive/90` 合成到 `--background` |
| --- | --- | --- |
| `oklch(0.205 0 0)`（我给的） | 68.8 | **59.1** ❌ 跌破 60 |
| `oklch(0.145 0 0)`（它用的） | **70.0** | **60.2** ✅ |

两态它都更优，采纳。（浅色 `oklch(0.985 0 0)` 双方一致：实心 |Lc| 77.9、hover 75.2。）

余下两点记录，均不需动作：
- hover 态 60.2 是**贴着门槛**过的，余量只有 0.2。但 `destructive-solid` 目前只渲染成 `<span>`（`case-table.tsx:144` 等处都不是链接），`[a]:` 门控的 hover 分支实际是死代码，所以这个薄余量当前不产生风险。若将来优先级徽章变成可点筛选链接，需要重测。
- 它复核 `--success` 时在 `--accent@60%` 那一格得 76.3、我得 77.4，差 1.1，来源是合成方式不同（它用 `color-mix(in oklab)`，我按 sRGB 字节合成）。两者都远高于 30 门槛，不影响结论；记下来是因为**以后两边对不上数时，先怀疑合成色彩空间而不是怀疑算法**。

---

## 全仓任意值扫描（我自己做的，不采信门禁脚本）

`scripts/check-tailwind.js` 的正则**只匹配单行 `className="..."`**，多行 `cn(...)` 里的任意值它看不见；同时它把任意**变体**（`[&_tr]:border-b`）误报为错误。所以它的 rc=0 是不可采信的。我另写了一个扫描器过全仓 `packages/ui/src` + `apps/web/src` 的 `.ts/.tsx/.css`，按「utility 记号紧跟 `-[...]` 且其后不是 `:`」区分**任意值**与**任意变体**。结论：

- **真正的任意值只剩 3 个文件 5 处**，已全部派给 T25（见上表）。
- `apps/web/src/index.css`（81 行）与 `packages/ui/src/styles/globals.css` 里出现的 `grid-rows-[auto_auto_1fr]`、`text-[10px]`、`ease-[cubic-bezier(...)]`、`stroke-[1.5]`、`translate-y-[calc(-50%-2px)]`、`max-w-[calc(100%-2rem)]` 等等**全部在注释里**，是「本具名类等价于哪个任意值」的说明文字，不是实际用法。逐行核对过，无一漏网。
- `data-[side=*]:` / `group-data-[size=sm]:` / `has-data-[slot=kbd]:` / `[&>svg]:` 属任意**变体**：Base UI 的 data 属性选择器绕不开，基线禁的是任意**值**，这些保留。

**留档一条方法论**：以后判断「任意值是否清干净」，不要看 `check-tailwind.js` 的退出码，要跑一次独立扫描；那个脚本本身的修复未派（不在本轮任何 agent 范围内），是已知欠账。


## T23 复核（优先级/状态徽章）

自己核的，不是采信报告：

- `rtk proxy grep` 全仓 `CaseStatusBadge` / `STATUS_*` / `PRIORITY_BADGE_VARIANTS`：`CaseStatusBadge` 全仓**唯一定义**在 `case-status-badge.tsx:20`，三处消费（`case-table.tsx:129`、`case-detail-view.tsx:64`、`version-snapshot-view.tsx:51`），`case-table.tsx` 里的旧局部组件确已删除、无残留。`PRIORITY_BADGE_VARIANTS` 五处消费全部读同一张表（含 `ai-proposal-item.tsx:74`），没有谁另起炉灶。
- `case-meta.ts:43-48` P0→`destructive-solid` / P1→`destructive`，`case-meta.ts:68-72` `active`→`bg-success`；`mindmap-adapter.ts:92-99` P0 实心 / P1 接手 15% color-mix，与列表映射同序。两处注释都写明「改一处就要改另一处」。
- `case-status-badge.tsx:24` 状态点带 `aria-hidden={true}`——正确：状态文字（生效/草稿/废弃）已经是可访问名，点是冗余视觉线索，不该被读两遍。三态形态差异（实心/实心弱/空心环）保留，满足「不能只靠颜色」。

**代理纠正了我一处错误，它是对的。** 我在派单简报里预测的修后态是「P0 ≈ P1 ≫ P2」，还写了「实心红(0.509) ≈ 实心中性(0.642)」。这跟我在同一份简报里指定的映射自相矛盾：P1 一旦变成 `destructive`（淡填充），就不可能还接近实心的 P0。那两句是我早期草稿里「P1 保留 default」版本的残留，忘了删。代理按我明确指定的映射实现，实测结果是 `P0 0.528 ≫ P2 0.0194 ≈ P1 0.0186 > P3 0.0030`——这才是对的。

**遗留（不修，记账）**：P1(0.0186) 与 P2(0.0194) 是亮度平局，只靠色相分（P1 暖红 vs P2 中性灰）。要真正拉开需要在 packages/ui 加第二级 destructive 台阶（如 `destructive/30`）。不修的理由：优先级徽章的**文字本身就是 P0/P1/P2/P3**，等级信息从来不只靠颜色承载，色阶只是加速扫读的辅助线索，平局不构成可达性缺陷。

## T24 复核（键盘拖拽空走一步）

**我给的三个可疑点全错，代理用实测把它们逐个证伪了：**

| 我的假设 | 实测结论 |
|---|---|
| `sortedZones` 用 `endsWith(activeId)` 子串排除，可能多排 | trace 确认 uuid 下**正好**排掉 `before:<active>` + `inside:<active>` 两个，不是根因（但确实是靠 uuid 侥幸，已一并改成精确匹配） |
| `nextZone` 的 `epsilon = 1` 吃掉中心 y 相近的落点 | 落点中心 y 最小间距 14px，没有任何一对相差 <1px，不是根因 |
| 被拖项自身落点仍在 `closestCenter` 碰撞集合里 | 属实（拿起时高亮自己、播报「挂到「自己」之下」），但只是次要缺陷，不解释空走 |

**真因**是我完全没想到的方向：坐标推进器只对齐 **y**，而 `closestCenter` 按**二维**欧氏中心距排名。模块树每层缩进 12px、`inside` 落点还要让开行首两个 24px 按钮，各落点横向中心与被拖行差 0–20px；这个横向罚分（最大 20）**大于**相邻落点 17px 的纵向间距，于是「对齐到 A 的中心」被判成 B。逐拍算得上：第 2 拍碰撞中心 (134,207)，`inside:订单管理` 中心 (154,207) 距 20.0，`before:订单管理` 中心 (140,190) 距 18.03 —— 后者赢，高亮原地不动。

**而且这不只是视觉问题**：`onDragEnd` 用的是 `event.over`，所以键盘放下时真的落到被判错的那个落点上。这比「空走一步」严重——我一开始把它当体验问题分类，分错了。

修法是对的：不再让碰撞检测去猜，键盘拖拽自持一个落点游标，坐标推进器按**序列下标** ±1 推进，碰撞检测直接汇报游标位置，两者共用同一份 `sortedZones`，一致性由构造保证而非靠数值巧合。`use-module-drag.ts:52-55` 用 `args.pointerCoordinates === null` 分流键盘/指针，指针路径 `pointerCollisionDetection` 一字未改。`useMemo(createModuleKeyboardDrag, [])` 让游标按组件实例存活，三个 `onDrag*` 回调都 `reset()`——跨按键存活、不跨拖拽，这个生命周期是对的。

单测里把真机量出来的几何表（含各层缩进造成的横向偏移）写死，意味着**任何回退到二维中心距的实现都会让断言直接挂掉**——这是有效的回归锁，不是摆设。

## 派生：T26

T24 主动上报了一个它超范围没做的缺陷：拖父模块时，它自己的子孙落点仍在步进序列里，放下必 CYCLE。功能上安全（有前端拦截 + 服务端环检测），但**鼠标用户永远碰不到这些落点**，只有键盘用户被迫逐个空翻——拖根模块要翻十几个。这是键盘专属可达性缺陷，已拆为 T26。

判定逻辑不用新写：`resolveModuleDrop(tree, activeId, drop)` 是纯函数，`kind === "invalid"` 就是 CYCLE，直接当谓词用。

**同时拍板 T24 escalate 上来的一个取舍**：拿起瞬间游标落在最近的**有效**落点（而非修复前的 `inside:<自己>` 这个 noop 落点）。维持这个行为，不新增「原位」落点。理由：播报会立刻念出落点、Esc 可原样取消，而「插到「交易中心」之前」这种自指播报对读屏用户更糟。

## 环境教训：scratchpad 必须按 agent 分目录

T23 报告：它的 `cdp.mjs` / `measure.mjs` 在运行途中被另一个 agent 的同名文件覆盖。scratchpad 根目录是所有并行 agent 共享的，同名脚本会互相踩。此后所有派单一律要求写进 `scratchpad/<taskid>/` 子目录。


## 更正：「只验证了深色」这个边界，我此前描述得不准

我先前记的是「本轮所有截图、CDP 取色、APCA 复核一律在深色下，交付时必须如实说明」。这话没错但会误导——它暗示浅色是一块**未验证的已发布表面**。实际不是。

实测（全仓 grep）：`apps/web/src/routes/__root.tsx:47` 是 `<html className="dark" lang="zh-CN">`，全仓**没有** ThemeProvider、没有主题切换 UI、没有任何 `prefers-color-scheme` 媒体查询、没有 `data-theme` 开关。`packages/ui/src/components/sonner.tsx:15-16` 的注释也把这个决定写死了：先前经 `next-themes` 的 `useTheme()` 取值，无 Provider 时恒为 `"system"`，故直接硬编码。

所以准确的说法是：**这个应用只有深色一种模式，用户到不了浅色**。`globals.css` 里 `:root` 那套浅色令牌是永不生效的死代码。

对交付的影响：
- 深色是唯一会被用到的模式，我这轮的全部取色/APCA 复核**覆盖了实际可达的全部表面**，不存在「一半没测」。
- 真正的遗留是另一件事：浅色令牌集从未在真实界面上验证过。将来任何人加主题切换，等于一次性启用一整套没验过的配色——这是**加开关时的任务**，不是现在的缺口。要记在账上，别让后人以为浅色已经验过。


## T25 复核（含我自己漏报 8 处的账）

**先记我自己的错。** 我在「全仓任意值扫描」那节写的是「真正的任意**值**只剩 3 文件 5 处」，并特意声明「我自己做的，不采信门禁脚本」。代理独立复扫的结果是 **13 处出现 / 9 个不同的任意值**，全部落在我已经点名的那 3 个文件里——`alert-dialog.tsx` 我报了 1 处实际 3 处，`bubble.tsx` 我报了 1 处实际 7 处。文件集是对的，逐文件计数是错的。

讽刺的地方在于：我在同一节里刚指出 `check-tailwind.js` 的正则「只匹配单行 `className="..."`，看不见多行 `cva(...)`」，然后自己交出了一个有等价盲区的扫描器。**「我自己扫的」不等于「扫干净了」**——工具换了，验证纪律没换就没用。

**我这次的复扫（本轮重做，按类名上下文而非裸正则）**：

- 先做了一版过宽的：把 TS 泛型 `string[]`、索引访问 `rows[0]`、正则字符组 `/[%_\\]/` 全算进去了，404 条噪音。这版没有价值，重做。
- 重做版只看两类上下文：① CSS 文件里**注释外**的 bracket token；② .ts/.tsx **字符串字面量内**的 token，且用括号深度匹配。结果：
  - `apps/web/src/index.css`：注释外 bracket token **0 个**
  - `packages/ui/src/styles/globals.css`：注释外 bracket token **0 个**（两个文件里所有 `[...]` 都在「等价于哪个任意值」的说明注释里，这是仓库既定做法）
  - .ts/.tsx 字符串里非变体 token：16 个，逐个核实**全部**是带命名 group 的任意变体（`group-data-[size=default]/alert-dialog-content:`、`group-has-data-[variant=ghost]/message:` 等）。它们躲过了我第一版的「后跟 `:` 即变体」判据，因为中间隔着 `/组名`。

**结论：全仓源码侧任意值为 0。** `scroll-area.tsx` 现在零方括号；`alert-dialog.tsx` / `bubble.tsx` / `card.tsx` / `message.tsx` 的剩余方括号全是变体。

**代理的两个判断我认可**：
- `transition-[color,box-shadow]` **没有**复用 `transition-control`。理由成立：`transition-control` 多带 `background-color/border-color/opacity/scale` 且缓动写死 `ease-out`，而 scroll viewport 需要 Tailwind 默认 `cubic-bezier(0.4,0,0.2,1)`。为了少一个类名去改变实际过渡行为是本末倒置，新建更窄的 `transition-focus-ring` 是对的。
- `grid-rows-[auto_1fr]` 不能用内建 `grid-rows-2`——后者是 `minmax(0,1fr)` 等分，会把标题行拉成等高。

**代理实测复现了 `check-tailwind.js` 的两个缺陷**（此前我是读代码推断的，现在有实证）：
- **假绿**：把改前含 `max-w-[80%]` / `bg-[color-mix(...)]` 的多行 `cva(...)` 放进 repro 文件 → 脚本输出「✅ 通过」rc=0。
- **假阳**：`group-data-[size=sm]/x:grid`、`has-data-[slot=kbd]:pr-1`、`[&>svg]:size-4`、`data-[side=top]:mb-2` 四个合法变体全被报错 rc=1。

代理没有为了消掉假阳去改正确代码，也没去改脚本（超范围）——两个决定都对。**修 `check-tailwind.js` 本身仍在待办**，它现在既漏报又误报，rc 值两个方向都不可信。


## T26 复核（跳过非法落点）

自己读码核的：

- `module-drag-keyboard.ts:75-86` `isReachableZone` 的两条排除写得对，注释里点明了一件容易踩空的事：**自身落点不能靠 `resolveModuleDrop` 代劳**——它把落到自己身上判为 `noop`（合法）而不是 `invalid`，所以自身排除必须单独留着。
- 退化路径正确：`tree` 里查不到 `activeId`（树没加载完 / 刚被队友删掉）时 `resolveModuleDrop` 一律返回 `noop`，过滤自动失效、退回「只排除自身落点」，不会把序列清空让键盘用户无处可放。这个方向选对了——宁可多给落点，不可给空序列。
- `use-module-drag.ts:135-141` 的 `useRef` + `useEffect` 镜像 + `useMemo(…, [])`：`modules.tree` 每次 refetch 都是新数组引用，直接把 tree 传进工厂会让工厂重建、游标清空，**拖到一半按一次刷新位置就丢了**。收 getter 是对的。

### 代理纠正了 T24 一处我已经签字的事实错误

T24 的验收结论我写成了「12 次按键 = 12 个不同落点」，并当作**叶子模块**的回归基线。T26 实测发现：T24 单测里的 `ACTIVE_ID = "b"` 是 **交易中心，它有两个子模块（订单管理、退款管理），是父节点不是叶子**。也就是说那条基线描述的其实是一次**父模块拖拽**。

这不是无关紧要的口误：父模块拖拽现在会被 T26 的过滤器合法地砍掉落点，如果原样保留那条「回归测试」，它就会悄悄改成在测新的过滤路径，而不再守护 T24 修的那个不变量。T26 把默认被拖模块换成真正的叶子 `c`（订单管理，行矩形取自实测），**保留断言的性质而不是字面数字**——这个处理是对的。

我当初复核 T24 时核了落点序列表、核了代码、核了单测断言意图，唯独没核夹具里那个 id 到底是不是叶子。

### 遗留（已决定不修，记账）

**单根项目里，拖根模块现在只剩 `root-end` 一个落点，方向键因此完全无响应。** 拿起时会播报「移到根层级末尾」，放下是合法 noop、不报错。

不修的理由：这个行为**是对的**——单根树里那个根模块确实无处可去，过滤器只是如实反映了这一点，而不是制造了死路。拿起时的播报已经把唯一落点说清楚了。要更好可以在只剩 ≤1 个落点时播报「该模块无其他可用落点」，但那要动 `module-drag-parts.tsx` / `module-drag-a11y.ts`，且只在「单根项目 + 拖根节点」这一个形状下才出现（多根项目不受影响）。**这是可以做的改进，不是缺陷，交给用户定夺。**

## 更正：守门脚本此前一直是「假绿」（zsh 不分词）

T27 顺手提出、我实测证实：我从 T23 起分发给每个 agent 的守门脚本调用方式是错的。

```
FILES=$( { git ls-files; git ls-files --others --exclude-standard; } | grep -E ... )
node scripts/check-tailwind.js $FILES     # ← 错的
```

本仓库的 shell 是 zsh 5.9，**不带引号的 `$VAR` 不做单词分割**（这是 zsh 与 bash 的关键差异）。
实测：`node -e 'console.log(process.argv.length - 1)' $FILES` 输出 **1**；
`printf '%s\n' "$FILES" | tr '\n' '\0' | xargs -0 node -e '...'` 输出 **205**。

也就是说这两个脚本每次只收到「一整坨换行拼起来的字符串」当作一个文件名，
`readFileSync` 抛错被 `catch { return [] }` 吞掉，于是恒定输出「✅ 通过」、rc=0。

**受影响范围**：T23 / T24 / T25 / T26 四份验收里我写下的「守门脚本通过」全部无效——
不是说它们真的违规，而是**那句话当时没有测到任何东西**。

正确调用方式（后续所有派发都必须用这个）：

```
printf '%s\n' "$FILES" | tr '\n' '\0' | xargs -0 node scripts/check-tailwind.js
printf '%s\n' "$FILES" | tr '\n' '\0' | xargs -0 node scripts/check-file-rules.js
```

用正确方式重测 205 个文件的结果：

- `check-file-rules.js` → **rc=0，真通过**（行数/函数长度/复杂度限制确实是绿的）
- `check-tailwind.js` → **rc=1**，报 `packages/ui/src/components/table.tsx` 第 24、34 行的
  `[&_tr]:border-b` 与 `[&_tr:last-child]:border-0`

后者是脚本的已知误报缺陷：这两处是 arbitrary **variant**（选择器变体），
不是 `init-code-quantity.md` 要禁的 arbitrary **value**。门禁是红的，但代码是对的。

## 派生：T28（修 check-tailwind.js 的双向缺陷）

不改 `table.tsx` 去迎合脚本——那是拿正确代码去将就错误的门禁。派 T28 修脚本本身，两个缺陷一起治：

- **误报**：`/\[[^\]]+\]/` 匹配任何方括号，分不清变体与值。
  `ALLOWED_PATTERNS`（group-/peer-/variant-）还把正则测在**方括号内部文本**上而不是整个 token 上，
  于是双向错：`[&_tr]` 内部无 "group-" 所以漏放行，而真违规的 `bg-[--group-color]` 反而被放行。
- **漏报**：逐行匹配，且所有 class 上下文正则都要求定界符同行，多行 `cva({...})` 完全看不见。
  （讽刺的是我在 T25 那节里刚记下这个盲区，转头自己写的扫描器也有同款缺口。）

要求的算法：不再「先找 className 上下文」，改为扫字符串字面量（跳注释、处理转义）→ 按空白切 token →
**做方括号深度计数找最后一个顶层 `:`**，之前是变体（合法），之后是工具类（有方括号即违规）。
`[&_tr:last-child]:border-0` 就是靠深度计数才不会切错。
同时要求新增 `scripts/check-tailwind.test.mjs`（node:test，零依赖）双向覆盖。

## T28 复核（含我批准的一处偏离）

自测 10 条独立用例（agent 没见过的 fixture）全过，其中包括我自己怀疑的那条边界：
`skipNonCode` 用「前一个非空白字符」区分正则与除法，而 `DIVISION_PREFIX` 含 `\w`，
所以 `return /['"]/.test(s)` 会被误判成除法、那个 `'` 会被当成字符串开头。
实测**不成灾**：单双引号字面量遇换行即 `abort` 回退一个字符，误吞不会跨行扩散；
仓库里唯一的 `return /` 还在注释里。留作已知边界，不修。

独立复跑：206 文件 `check-tailwind.js` rc=0、`check-file-rules.js` rc=0、`node --test` 14/14、
我自己造的多行 `cva` fixture（`min-h-[3px]`）仍然 rc=1 且行号准确 —— 门禁是**因为对的原因**绿的，
不是因为瞎了。lefthook 用相对路径 `node scripts/check-tailwind.js {staged_files}` 调用，
而新加的 `process.argv[1] === fileURLToPath(import.meta.url)` 守卫在相对路径下同样成立（已实测）。

**偏离与裁决**：我给的算法字面意思是「工具类部分里出现方括号即违规」。
代理照做后 rc=1，报出 6 个文件 16 处——全是**非类名字符串**：MCP 工具描述文案里的 `[{id,`、
`closest("[data-cursor-root]")`、SQL 的 `::text[]`、脚本自己帮助文案里的 `"w-[96px]"`。
这是我的算法漏了一环：改扫全部字符串字面量（这是治缺陷 B 的必要条件）就必然把非类名字符串卷进来。

代理补的 `isArbitraryUtility` 形态约束我**批准**，理由是它推导自 Tailwind 任意值的真实文法，
而不是「按文件/按模式开白名单」那种会把门禁挖空的补丁：方括号成对非空、前缀只含工具类名字符
且以 `-` 或 `/` 收尾、前缀为空时必须是 `[属性:值]` 形态、右括号后只允许 `/50` 与 `!`。

代理主动交代的唯一盲区：形如 `"[data-cursor-root]"`（空前缀 + 括号内无冒号）不报。
我确认这不丢东西——arbitrary property 的文法**要求** `[prop:value]`，无冒号就不可能是合法任意值。

**缺陷 B 此前没有藏住任何真实违规**：代理审了 206 个文件里所有含方括号的 token，
约 150 个全部处在变体位置。这与我上一轮自写扫描器的结论（全仓 0 处任意值）独立吻合。

## T29 复核（服务端压缩）

我自己验的，不是采信报告：

- **`contentTypeFilter` 确实存在**——这是全任务最要命的一条：若 hono 静默忽略未知选项，SSE 就会被压，
  AI 生成面板会「憋住不出字」。读了 `node_modules/.pnpm/hono@4.13.2/.../middleware/compress/index.js`：
  `const contentTypeFilter = options?.contentTypeFilter ?? COMPRESSIBLE_CONTENT_TYPE_REGEX`，支持是真的。
  同一份源码还显示它会跳过任何已带 `Transfer-Encoding` 的响应——**流式还有第二层保险**。
- **中间件次序正确**：`/ws` 在 `index.ts:30` 注册，早于 cors（32）与压缩（44），
  握手根本走不到压缩中间件；路径排除是第二道保险而非唯一依靠。
- **实测**：`/rpc/projects/list` → `content-encoding: gzip` + `vary: Accept-Encoding, Origin`；
  `--compressed` 解出来是带种子数据的合法 JSON；`/` 的 `text/plain` 不压（JSON-only 过滤器，有意为之）。
- **`/mcp` 排除有据**：实测 `tools/list` 返回 `content-type: text/event-stream` + `transfer-encoding: chunked`，
  不是「保守起见先排除」的猜测。

**代理主动交代的一个诚实缺陷**：`threshold: 1024` 在 `/rpc` 上实际是**空转**的。
源码里是 `contentLength && Number(contentLength) < threshold`——没有 `Content-Length` 头时整个阈值判断被跳过，
而 `c.newResponse(rpcResult.response.body, ...)` 在中间件阶段没有该头（Node 之后才补）。
于是小 JSON 也会被压（`projects.list` 579B → 396B，仍是净赚）。
真要落实字节阈值就得缓冲每个响应体，得不偿失。**接受现状**，记在这里以免日后有人以为阈值生效。

**SSE 未压缩这条，代理没能在真端点上实测**（AI 未配置，`ai.generate` 直接返回 503 的普通 JSON——
那个 503 确实被压了，且这是**正确**的，它不是流）。代理改用真 `@orpc/server` RPCHandler + 真 async-generator
procedure + 从仓库文件按绝对路径 import 的同一个中间件搭了 harness，实测 SSE 无 `content-encoding`
且分块按 ~120ms 间隔到达（未被缓冲）。我认可这个替代验证：中间件是同一份，被测行为是同一条。
但如实记下——**真实的 `ai.generate` 路径要等 AI 配置好之后才算走过**。

## T32 复核（mindmap.tree 作用域参数）

代理的两个设计决策我**独立核对过**（依据是我本人读过的 `mindmap-adapter.ts`，不是采信它的转述）：

- **保留「模块根数组」形状、不引入项目根**：响应体里本来就没有项目根节点——
  `MindmapTreeInput` 是 `{cases, modules, projectId, projectName}`，
  `toMindElixirData` 用 `encodeProjectNodeId(input.projectId)` 现造根节点（adapter 第 199-210 行）。
  所以服务端只需把 `modules` 从 N 个根变成 1 个根，adapter 一行都不用改。反过来若把项目根塞进响应，
  adapter 的根节点合成逻辑就得改写。决策正确。
- **`includeSteps:false` 用空数组而非省略字段**：`MindmapCaseInput.steps` 是必填 `CaseStep[]`，
  `toCaseNode` 直接 `caseInput.steps.map(...)`（adapter 第 41-43、173-175 行），
  **字段缺失会当场抛 TypeError**。空数组走已有的「无步骤用例」分支（渲染成叶子、不画展开箭头）。
  这不是偏好问题，是被类型逼出来的唯一正确选择。

我自己实测（种子项目 54 用例 / 8 模块）：

| 调用 | 字节 | 说明 |
| --- | --- | --- |
| 不传新参数 | 26548 | 与改动前一致 |
| `includeSteps:false` | 13393 | **-49.6%**，`steps` 键仍在且为 `[]` |
| 伪造 moduleId | 404 | 类型化 `NOT_FOUND`，**不是静默空树** |

「除 steps 外与 baseline 完全一致 / modules 一致」我用 python 逐字段比对过，为 True。
伪造 moduleId 返回 404 这条尤其重要：静默返回空树会让前端以为「这个模块下没用例」，是最坏的失败模式。

**代理主动交代的一处妥协，我接受**：作用域裁剪发生在 API 层内存里而非 SQL 里——
因为我禁止它改 `packages/db/**`，而 repository 目前只有「按项目」的读接口。
后果：**载荷与前端深拷贝的收益全部拿到了**（T15 那 91× 正是来自这两处），
但 DB 侧仍是全项目查询。要把收益带到查询层，需要后续任务在 `packages/db` 加 scoped repository 函数。

**待复核**：代理报告 `pnpm lint` 有 1 个 error 落在
`apps/web/src/components/mindmap/mindmap-adapter.test.ts`（`max-lines-per-function`），
不在它的文件范围内——那是 T31 正在改的区域。**T31 落地后我要单独确认这条**。

## T30 复核（侧边栏默认只展开到二级）

**结论：通过。** 我自己读了全部改动文件并独立验证了三条载荷性判断。

**独立验证（不是代理报告的数字）**

- 折叠子树**真的卸载**，不是 CSS 隐藏——这是整个收益的地基。我没信文档，直接读了装机的 `@base-ui/react@1.7.0`：
  `collapsible/panel/CollapsiblePanel.mjs:50` `const keepMounted = keepMountedProp ?? false;`，
  `panel/useCollapsiblePanel.mjs:291` `const shouldRender = keepMounted || hiddenUntilFound || mounted || open;`。
  两个 prop 我们都没传 → 关闭态不渲染。成立。
- 种子项目行为**未变**：直接 curl SSR HTML，8 个模块名全部出现（电商平台/交易中心/订单管理/退款管理/支付中心/收银台/用户中心/账号与登录），
  `data-slot="collapsible-content"` 4 个（即 4 个有子节点的模块全展开）。8 ≤ 40，走「小项目整棵展开」这一侧，符合设计。
- 门禁我自己跑的：`workspace` 单测 52 passed / 0 failed；`TURBO_FORCE=1 pnpm check-types` 7/7；
  两个守门脚本用 NUL 分隔调用法在 **220** 个文件上 rc=0；目录内最大文件 `module-tree.tsx` 254 行、`module-tree-node.tsx` 251 行，均在 300 行内。

**我复核过的设计判断**

- 覆盖表放在 `use-module-expansion.ts` 一个 hook 里而不是每个节点 `useState`：`modules.tree` 每次 invalidate 换新树引用，
  节点级状态会随节点重建而丢。集中存放才能让「队友保存触发刷新」不冲掉本人展开的状态。正确。
- 首帧不读 sessionStorage（`useState(EMPTY_OVERRIDES)` + `useEffect` 里再读）：这一页是 SSR 的，首帧读会话存储必然 hydration mismatch。正确。
- 键盘拖拽没有被破坏，且是**由构造保证**的：`module-drag-keyboard.ts` 的 `sortedZones` 每次都现读 `droppableRects`，
  折叠行不在其中就是少几个落点，而步进是对数组下标做加减，不可能空走或卡住。
  更关键的是 `useKeyboardDrag` 的 `useMemo` 依赖是 `[]`——`expansion` 对象每次覆盖变更都换新引用，
  会让 `onDragEnd` 换新，但**不会**重建落点游标，拖到一半的位置不丢。这正是当初写那段注释要防的坑，没有被踩回去。
- 折叠的父节点**仍然是合法落点**：`useModuleRowDrop(node.id)` 挂在行本身（未被折叠），只有「插到之前」的 6px 落点条随子树卸载。
  配合代理自己加的 `revealParent`（放下后展开新父节点），拖进折叠父节点不再「看起来像丢了」。这处超出交办范围的改动我认可——不加它这个功能就是坏的。

**残留（不阻塞预览，记在这里）**

1. **扁平树拿不到收益**：只有 depth ≥ 1 才折叠，根层必须渲染。400 个根模块的项目照付老价钱。折叠治不了，要治只能虚拟化，而虚拟化会破坏键盘拖拽落点——本轮已明确不做。
2. **深链会被陈旧的用户折叠压住**：`isModuleOpen` 里用户覆盖优先级最高，若用户先折叠了某祖先，之后再走 `?moduleId=<该祖先的子孙>` 深链，该行不会挂载，`useScrollSelectedIntoView` 也就不会触发——**页面静默地什么都不发生**。
   正确的解法不是让祖先链无条件压过覆盖（那样用户就再也折叠不了选中分支），而是**在 `selectedModuleId` 变化的那一刻**清掉祖先链上的覆盖项，让导航意图赢一次、之后仍可自由折叠。留作后续。
3. 展开覆盖表按 projectId 存在 sessionStorage 且**从不清理**已删除模块的 id。只是会话级垃圾，无功能影响。

## T31 复核（脑图 refresh 开销 + 选中态）

**结论：生产代码通过；门禁不完整，已派生 T33。**

**我独立验证的最高风险项：跳过库内深拷贝是否安全**

这是本任务唯一可能悄悄搞坏数据的改动。`redrawMindmap` 把新树直接挂到 `mind.nodeData` 再调无参 `refresh()`，
绕过了 `MindElixir.js:817` 的 `JSON.parse(JSON.stringify(e))`。那次深拷贝原本是一道防护：
库随后会往每个节点写 `parent` 反向指针（`.parent = t`）。**只要产出的树里有任何一个对象来自 react-query 缓存，
缓存就会被写进循环引用。** 我逐条查了：

- `sortByOrder` 是 `[...items].sort(...)`，**返回副本**——`sortByOrder(input.modules)` / `sortByOrder(module.children)`
  直接作用在缓存数组上，若是原地 `sort` 就会重排缓存。它不是。✅
- `toModuleNode` / `toCaseNode` / `toStepNode` / `toExpectedNode` 全部返回新的对象字面量，
  `metadata` 每次新建，`steps` 经 `.map()` 重造，原 `step` 对象没有被嵌进去。✅
- 唯一的共享引用是 `buildPriorityTag` 里的 `PRIORITY_TAG_STYLES[priority]`（模块级常量，不是缓存数据）。
  我担心它被库改写，于是把 mind-elixir 里三处 `Object.assign(...style...)` 全挖出来看了：
  - `@13073` 标签渲染路径 `Object.assign(s.style, o.style)`——`s` 是新建的 `<span>`，**我们的对象是源不是目标**，不被改写；✅
  - `@18116` `reshapeNode` 路径会改写 `o.style`，但那是 `NodeObj.style`，我们从不设置它，`o.style &&` 直接短路；✅
  - `@101745` 箭头 reshape 用的是 `Object.assign({}, ...)`，非破坏性，且我们不用箭头。✅

  结论：无缓存对象可从 `nodeData` 抵达，深拷贝可以安全跳过。

**其余独立验证**

- 库 API 属实：`dist/types/index.d.ts:65` `currentNodes: Topic[]`、`:169` `selectNodes(tpcs: Topic[])`，
  `redrawMindmap` 用的就是这两个。✅
- `TrailingMerge` 状态机我按 idle/merging/blocked 三态逐条推演过，关键不变式成立：
  **blocked ⇒ pending≠null ∧ timer≠null**，所以 blocked 期间 `push` 只替换待绘值、不重新武装定时器也不会丢快照；
  `maxWaitMs` 从首次入队起算，持续保存的队友饿不死重绘。✅
- 选中态复原被放在 `applyingRemote` 守卫**之内**（`apply()` 的 try 块里），`selectNodes` 不会回声出一批同步操作。✅
- `pnpm test` 我自己跑的：**13 files / 189 tests passed**。✅
- 临时项目确已删除：`projects/list` 现在只剩「电商演示项目」一个。✅

**门禁缺口（我发现的，代理没报）**

代理的门禁清单里写了 `pnpm check rc=0`（biome，属实），但**它从没跑过 `pnpm lint`（eslint）**。
实测 eslint 有 **4 个 error**，全是 `max-lines-per-function`（上限 50），其中 **3 个是 T31 自己新增的测试文件**：

```
mindmap-adapter.test.ts       61:37  (53 行)   ← T32 早先标记的那条，就是它
mindmap-budget.test.ts        60:34  (83 行)   ← T31 新增
mindmap-redraw.test.ts        25:35  (51 行)   ← T31 新增
mindmap-refresh-merge.test.ts 23:30  (90 行)   ← T31 新增
```

已派 **T33** 专门修：只准拆 describe 结构，**不准改生产代码、不准改 eslint 配置、不准加 eslint-disable**——
规则是对的，是代码结构要改。这同时结清了 T32 留下的那条待复核项。

**教训（下次派单必须带上）**：本仓库有 **两套** lint（biome 走 `pnpm check`、eslint 走 `pnpm lint`），
只跑其中一套就是不完整的门禁。此前几轮的派单模板里只有 `pnpm check`，这是我的模板疏漏，不是代理的错。

**残留（不阻塞预览）**

1. `MindmapBudgetNotice` 自己又调了一次 `planMindmapRender`，与画布用的那份是两次独立计算。函数是纯的、同输入必同输出，
   但在 300ms 合并窗口里 react-query 的 `data` 已更新而画布还没重绘，提示文案会短暂领先画布 ≤1s。自愈，低危。
2. `applyExpandedCases` 的 `collectById` 不看祖先是否折叠：一条原本展开的用例若这次落进了折叠的模块子树，
   它照样吃掉一份展开额度却根本不渲染，于是 `dropped` 会少报。低危。
3. `EXPANDED_CASE_WEIGHT = 22` 是把「时间成本」折算成「节点预算」的启发式（展开用例实际只多 8 个 DOM 节点，
   但耗时是 22 倍），两种量纲混用。文档里写清楚了，够用，但不是精确模型。


## T33 复核（eslint `max-lines-per-function`）

**背景**：这条派单本身就是我派单模板的漏洞产物。仓库有两套 lint —— `"check": "ultracite check"`（biome）
与 `"lint": "eslint . --cache"`。我之前所有派单的门禁清单里只写了 `pnpm check`，于是 T31 交付时
诚实地报了 `pnpm check` rc=0（biome 确实全绿），但 eslint 有 4 个 `max-lines-per-function` error，
其中 3 个是 T31 新引入的。**这不是 T31 撒谎，是我的模板缺项。** 从 T33 起门禁清单固定为四项 +
两个 guard 脚本。

**改了什么**（mtime 证据：只有这 4 个文件是 08-20 00:05–00:08，其余生产文件停在 08-19 23:xx 及更早）：

| 文件 | 原违规行 | 原长度 |
| --- | --- | --- |
| `mindmap-budget.test.ts` | :60 | 83 行 |
| `mindmap-redraw.test.ts` | :25 | 51 行 |
| `mindmap-refresh-merge.test.ts` | :23 | 90 行 |
| `mindmap-adapter.test.ts` | :61 | 53 行（T32 早先标记的存量项） |

手法是把超长的 `describe` 回调按语义拆成多个平级 `describe`，不是把断言塞进 helper 里蒙混过关。

**反作弊核验**（我自己跑的，不采信报告）：

1. `pnpm lint` → **0 error / 3 warning**，warning 全是 `apps/server/src/index.ts` 的 `no-console`（存量）。
2. `pnpm test` → **13 文件 189 测试全过**。测试总数与派单前完全一致 —— 既没删测试也没 `.skip` 掉。
3. `grep -rn "eslint-disable\|biome-ignore"` → 无。没有靠注释压制规则。
4. 配置文件 mtime：`eslint.config.js` 08-18 20:43、`biome.json` 08-18 20:43、`package.json` 08-19 02:44、
   `pnpm-lock.yaml` 08-19 22:43 —— 全部早于 T33 的作业窗口（08-20 00:05 起）。没有放宽规则、没有动依赖。

**结论：通过。**


## T35 复核（版本历史移入 Sheet 内 Tabs）

**问题**：`case-detail-sheet.tsx` 原来把 `VersionHistoryPanel` 追加在用例正文/编辑表单**下面的同一个滚动容器**里 ——
看历史要先滚过整个正文，编辑态下历史压在表单底下，两块内容抢同一条滚动条。用户直接点了这个问题。

**改法**：Sheet 内两个 tab，历史**替换**正文而不是堆叠。`SheetHeader`（固定）→ notice/conflict → `Separator` →
`CaseDetailTabs`（`flex-1 min-h-0 flex-col`），tab 条 `shrink-0`，两个 panel 各自 `min-h-0 flex-1 overflow-y-auto p-4`。
原 header 上的「版本历史 / 收起版本历史」按钮删除，职责交给 tab。

**我核过的**：

| 核验项 | 结果 |
| --- | --- |
| tabs 原语 | `@base-ui/react/tabs` —— 确是 Base UI，不是 Radix |
| 文件行数 | tabs 85 / tabs-shell 74 / body 99 / sheet 287→165，全部远低于 300 |
| `eslint-disable` / `biome-ignore` | 五个文件里一个都没有 |
| 依赖是否被动 | `package.json` 08-19 02:44、`pnpm-lock.yaml` 08-19 22:43、`globals.css` 08-19 22:00，**全部早于 T35 作业窗口**，属实未动 |
| `any` 泄漏 | Base UI 的 `onValueChange` 值是 `any`，它收窄成 `unknown` 再比较，没漏进业务代码 |

**`keepMounted` 的不对称是对的**（详情面板 `keepMounted`、历史面板不加）：标题栏「保存」按钮靠 `form="case-editor-form"`
跨 DOM 关联表单，详情面板一旦卸载按钮就失去目标；历史面板反过来必须按需挂载，否则没人看也会去拉一次版本列表。
两个方向的理由都写进了代码注释。

**结论：通过。**并派生 T37 —— 见下。

### T35 上报的真缺陷（T37）

`apps/web/src/components/workspace/use-workspace-navigation.ts:83`：

```ts
/** 选择类操作：翻页和开关详情要能被浏览器后退撤销，所以推新历史项。 */
function selectionActions(patch: ApplyPatch) {
	return {
		closeCase:  () => patch({ caseId: undefined, history: undefined }, false),  // 推
		selectCase: (caseId: string) => patch({ caseId, history: undefined }, false), // 推
		setHistory: (open: boolean) => patch({ history: open || undefined }, true),   // ← 替换
		setPage:    (page: number) => patch({ page: page <= 1 ? undefined : page }, false), // 推
	};
}
```

注释说"推新历史项"，四个里三个传 `false`（推），`setHistory` 传 `true`（替换）—— **代码与自身注释自相矛盾**。
这是既有行为、不是 T35 引入的回归（改 tab 之前那个按钮也一样），但改成 tab 之后危害放大了：
点 tab 不产生历史项，用户按后退会直接飞出整个页面。

T35 正确地**没有**越界去改（该文件属 T36 范围），只上报。T35 已用独立实测证明「只要历史项存在，
后退/前进就能从 URL 正确重建 tab」，所以这一行是最后一块拼图。串行排在 T36 之后。


## T36 复核（视觉对齐审计）

**用户原话是「视觉对齐部分」，没给细节**，所以我把它拆成 8 条清单派下去，要求逐条交代查了没有、查出什么。
交付回来 24 处修改，另外**明确报告了两条「查完是零实例」**——这比凑数改几处更有价值。

### 它确立的两条约定（写进代码注释，不是碰巧调对）

**① 工作区 gutter = 16px**：header `px-4` / 内容区 `main p-4` / 侧栏 `aside p-2` + 行 `px-2`。
侧栏拆成「面板 8 + 行 8」而不是直接 `px-4`，因为行需要自己的 hover/选中底色，底色要从面板边缘内缩 8px，
文字才落在同一条 16px 线上。这是我派单时只给了「对不齐」的现象，它自己推导出的解法。

**② 控件高度 = 32px 档**：`Input h-8` / `SelectTrigger h-8` / `Button size="default"`；
`size="sm"`（h-7）只留给弹层内与表格内的次级按钮。实测 SSR：`h-7` 的按钮 10 个 → 2 个（剩下两个是分页的
上/下一页，自成一组彼此等高，刻意保留），`h-8` 的 0 个 → 8 个。

### 我核过的

| 核验项 | 结果 |
| --- | --- |
| `pnpm test` | 13 文件 / 189 测试全过 |
| `pnpm lint` | 0 error / 3 warning（`apps/server/src/index.ts` 既有 `no-console`） |
| `check-tailwind.js` / `check-file-rules.js` | 双绿（全仓 220 文件，NUL 分隔写法） |
| 改动文件行数 | `case-list-view.tsx` 250 / `case-table.tsx` 283 / `module-tree.tsx` 264，均 < 300 |
| `eslint-disable` / `biome-ignore` | 全仓只有两条，都是既有的：`routeTree.gen.ts`（生成物）与 `label.tsx`（08-18 20:48，写了正当理由）。T36 一条没加 |

### 「同心圆角零实例」这条我复算过，属实

全仓圆角分布：**42 个 `rounded-none` / 5 个 `rounded-full`（状态点、头像、气泡）/ 1 个 `rounded-md`
（`__root.tsx` 的 skip-link，禁改区）/ 1 个 `rounded-inherit`**。这套设计系统是刻意的纯直角，
`outer = inner + padding` 无从违反。它没有为了交差硬凑修改，如实写了"零个实例，未做任何修改"。

### 一处它说过头了（我更正）

它把 `--radius*` 判为"死令牌"，理由是"所有组件都写死 `rounded-none`"。**不完全对**：
`packages/ui/src/components/sonner.tsx:35` 有 `"--border-radius": "var(--radius)"`，
`--radius` 有且仅有这一个消费者。真正的问题不是"死令牌"而是**一致性缺口**——
toast 是全仓唯一带常规圆角的面板，在纯直角系统里独自圆角。
该文件属 T34 范围，已把这条转给仍在运行的 T34，要求它二选一并把理由写进注释。

### 它自己上报的未做到（我不加掩饰地记下来）

1. **脑图两处改动无法用 curl 验证**：`/projects/$projectId/mindmap` 是 `ssr: false` + `ClientOnly`，
   SSR HTML 里根本不含这段。类型/lint 过、几何推导写了注释，但**没有浏览器实测**。
2. **`case-detail-sheet.tsx` 是禁区**（T35 领地），抽屉内部 gutter 未审计。它改的 `sheet.tsx` 关闭按钮偏移
   会作用到那个抽屉，而抽屉 header 是自绘的，落点是否仍与标题同轴**需要复核**。
3. **`versions/**` 是禁区**，`version-viewer.tsx` / `version-history-panel.tsx` 的骨架尺寸没对照真实态量过——
   第 7 条（骨架与实态尺寸一致）在那两个文件上等于没查。
4. **列宽钉法有前提**：`w-16/w-20/w-28` 在 `table-layout: auto` 下是下限而非硬约束。它消除的是
   "枚举值长度变化引起的抖动"；若以后 `CASE_TYPE_LABELS` 加了 4 字以上的值，抖动会回来一部分。
   彻底解法是 `table-fixed` + 全列显式宽度，风险更大，本轮未做。
5. **没有做浏览器级的 320px / 200% 缩放实测**，第 8 条结论来自 CSS 推导（`grid-cols-N` 是 `minmax(0,1fr)`）
   与源码扫描。

### 我另外记下的残留（非本轮范围，未动）

`packages/ui/src/components/input.tsx` 的基础字号是 `text-xs`（12px），整套系统都是这个密度。
**iOS 上聚焦小于 16px 的输入框会触发自动缩放**。这是 base-lyra 的密度取向、非本轮引入，
用户也没抱怨过字号，故只记录不处理。

**结论：通过。**
## T34 复核（主题令牌重做 + 亮/暗切换）

### 交付物

| 文件 | 行数 | 性质 |
| --- | --- | --- |
| `packages/ui/src/styles/theme.css` | 136 | 新建：冷蓝 hue≈265 两套令牌 + `@theme inline` 映射，每条带 APCA 实测理由 |
| `packages/ui/src/styles/globals.css` | 191 | 原 299 行（已顶到 ≤300 上限），令牌与理由拆走后降到 191，首行 `@import "./theme.css"` |
| `apps/web/src/components/theme/use-theme.ts` | 99 | 新建：防闪烁脚本常量 + `useSyncExternalStore` 主题 store |
| `apps/web/src/components/theme/theme-toggle.tsx` | 40 | 新建：`aria-label="深色模式"` + `aria-pressed`，图标 `aria-hidden` |
| `apps/web/src/routes/__root.tsx` | 99 | 去掉写死的 `className="dark"`，改 `lang="zh-CN"` + `suppressHydrationWarning` |

拆出 `theme.css` 是被 ≤300 行规则逼出来的：把完整实测理由写回 `globals.css` 会到 327 行，
而我给的指令是「不许直接删理由」。拆文件是唯一同时满足两条约束的解，判定合理。

### 我实际验证的（不采信报告）

| 项 | 结论 |
| --- | --- |
| 抑制注释 | 全仓 12 处，全部属既有的 db 仓储 / `label.tsx` / `seed.ts`，T34 五个文件**一处没加** |
| 是否改门禁配置 | `eslint.config.js`、`biome.json` mtime 均为 08-18 20:43，早于 W11 作业窗口（08-19 21:28 起），未动 |
| SSR 首帧 | `<html lang="zh-CN">` 上**没有**写死的 `dark`；`<head>` 首个节点即防闪烁脚本 |
| 防闪烁脚本 `try` 范围 | `try` 只包住 `localStorage.getItem`，系统偏好检测在 `try` 之外 —— 这是 T34 自己发现并修的真 bug（原写法下禁用 localStorage 会把系统偏好一起吞掉，暗色系统用户卡在亮色） |
| 切换按钮是否 SSR | 在 SSR 输出 5653 偏移处，`aria-label="深色模式" aria-pressed="false"`，`fixed bottom-3 left-3` 在 6510 处 |
| toast 圆角转派 | `sonner.tsx:41` 已改 `"--border-radius": "0"`，注释写明「`--radius` 令牌本身不动，skip-link 的 `rounded-md` 仍在用它派生的 `--radius-md`」 |

**我自己的验证失误**：先前用 `curl -s ... | grep` 直接管道查切换按钮，反复取到空响应，一度怀疑 T34 谎报。
改成先存文件再查即命中。**T34 说得没错，是我的验证方式有问题**，记在这里以免复现。

### T34 自报的三项未解决（原样保留，不掩盖）

1. **暗色 `text-primary` = −36.6，低于非正文 60 门槛。** 一个令牌当不了文字与填充两头：
   要让文字达标需 L≥0.9，那时 `bg-primary` 又压不住 `--primary-foreground`（L=0.74 时白字已掉到 −46.3）。
   T34 选了用得多的填充侧（`bg-primary` 6 处 vs `text-primary` 3 处）。
   我复核确认 `variant="link"` **全仓无人使用**，唯一活的落点是 `empty.tsx:71` 的链接 hover，
   且该处有 `[&>a]:underline` 提供冗余线索，不构成「仅靠颜色传达」。
   —— 但 hover 比基础态（−76.3）更看不清仍是缺陷，**已并入 T38**。

2. **`focus-visible:border-destructive/40` 仅 2.82:1（暗）/2.15:1（亮）**，在 `button.tsx`，超出其作用域。
   我读 `button.tsx` 全文后把这条**升级**：该变体覆盖的不是「一个边框」而是**边框和环两个**，
   即整套焦点指示都不达标 → 独立成 **T38**。

3. **全程零浏览器视觉验证。** T34 没有截图能力，所有结论来自数值计算与 SSR 文本。
   **亮色那套令牌至今没有任何人真正渲染看过** —— 这是本轮最大的未验证面，必须写进验收报告。

**结论：通过**（三项未解决均如实上报，其中两项已转为独立任务，第三项进验收报告披露）。
## T38 复核（destructive 焦点环 + 链接文字对比度）

### 改了什么

| 位置 | 前 | 后 |
| --- | --- | --- |
| `button.tsx` destructive 变体 | `focus-visible:border-destructive/40` + `ring-destructive/20` + `dark:ring-destructive/40` | **三条覆盖全删**，回落基类 `border-ring` + `ring-1 ring-ring/50` |
| `empty.tsx:74` | `[&>a:hover]:text-primary` | `[&>a:hover]:text-foreground` |
| `button.tsx` / `badge.tsx` 的 `link` 变体 | `text-primary` | `text-foreground` |

### 比派单时判断的更差一层

我派单时说的是「边框和环两个都被覆盖，所以整套指示不达标」。T38 量出来还有第三层：
**暗色下环用 `/40`、边框也是 `/40`，两者是同一个计算色，互比 1.00:1** —— 所谓「边框+环」的双层
指示根本没有两层，塌成一条 2.82:1 的窄带。且边框不只对页面底面不达标，对**它自己的填充**
也只有 1.80:1（亮）/1.81:1（暗），hover 时进一步掉到 1.29:1。

修后（三种面：background / card / muted）：边框对底面 16.95~15.37（亮）/17.29~13.47（暗），
对填充 14.25~12.96 / 11.12~8.20，ring/50 光晕对底面 3.48~3.38 / 4.91~4.49，全部过 3:1。

**为什么撤掉红色调而不是提高不透明度**：T38 反推了「红色边框要同时压住底面和填充」所需的不透明度
= 亮 ≥65%、暗 ≥60~70%，那已经基本等同实心 `--destructive`，会与基类的 `aria-invalid:border-destructive`
撞成同一种视觉（把「聚焦」误读成「校验失败」）。回落基类还顺带让破坏性按钮和其它变体拥有
**同一种焦点指示**，符合一致性识别。判断成立。

### 我自己补测的一项（T38 未覆盖）

`text-primary` 改掉之后，`--primary` 在全应用**只剩非文本用途**：`workspace-tabs.tsx:7` 活动 tab
下边框、`module-drag-parts.tsx:20/98` 拖放填充与指示环、`version-list.tsx:89` 选中版本边框。
T34 报的 −36.6 是**文本**门槛（60），这三处走的是 WCAG 1.4.11 的**非文本** 3:1，是另一套门槛，
两个 agent 都没量过。我自己量了（脚本先用 T34 已发布的 16.89/17.28/3.12/3.35 校准，**逐位吻合**）：

| | background | card | muted | secondary | accent |
| --- | --- | --- | --- | --- | --- |
| 亮色 primary | 5.42 | 5.69 | 4.92 | 4.77 | 4.28 |
| 暗色 primary | 5.16 | 4.81 | 4.01 | 4.01 | **3.37** |

全部达标，最紧的一档正是 `border-primary bg-accent`（暗色 3.37:1）。
所以「同一个令牌当文字 −36.6 不达标、当指示色 5.16:1 达标」不是矛盾 —— 两套门槛对应两种角色，
T38 把它从文字角色撤出、只留非文本角色，终态自洽。

### 反作弊

`theme.css` 仍 136 行、`globals.css` 仍 191 行，`--primary` 两套取值与 T34 文档一致
（亮 `oklch(0.52 0.2 265)` / 暗 `oklch(0.62 0.19 265)`），未被改动去迁就数字。
门禁：test 13/189 持平、lint 0 error、check 0 error、check-types 7/7、两个守卫脚本通过。
无新增抑制注释，无配置改动。

### 留作残留（不阻塞，交由用户定夺）

1. **`link` 变体失去了「蓝色链接」的可供性。** 改 `text-foreground` 后，静止态与正文同色，
   只有 hover 才出下划线 —— 看上去就是一段普通文字。当前**零调用点**，属潜在坑而非实际缺陷。
   要找回蓝色需要一个专供文字的令牌（约 `--primary-text`，暗色 L≈0.86），那要动 `theme.css`，
   我按「刚重做完的文件不并发改」划成了只读，故未做。
   （`empty.tsx` 那处不受影响：它有常驻 `[&>a]:underline`。）
2. **所有数字仍是计算值，非浏览器采样。** 两条独立实现的测量管线互相吻合是强证据，
   但仍是「模型对模型」而非「模型对浏览器」。并入下一轮视觉验收。
## T37 复核（tab 切换应推历史项 + 抽屉关闭按钮交叉复核）

### 任务一：改了一行

`ApplyPatch` 第二参数的语义我要求它自己去证而不是信我的描述，它证了：
`(next: SearchPatch, replace: boolean) => void` → `patch` → `reduce(reducer, replace)` →
`navigate({ replace, search: reducer })`，TanStack Router 的 `replace: true` 即替换当前项。
所以原先四个 selection 操作里三个推、唯独 `setHistory` 替换，确与函数自身注释矛盾。
`use-workspace-navigation.ts:89` 改 `true` → `false`，我已读源码确认。

浏览器实测（我要的是数字不是结论，它给了）：

| 步骤 | history.length | search | tab |
| --- | --- | --- | --- |
| 列表页 | 2 | （空） | — |
| 点用例行 | 3 | `?caseId=…` | 详情 |
| 点「版本历史」 | **4**（+1，证明是 push） | `?caseId=…&history=true` | 版本历史 |
| 后退 ×1 | 4 | `?caseId=…` | **详情** |
| 后退 ×2 | 4 | （空） | 关闭，回列表 |
| 前进 ×1 / ×2 | 4 | 逐级还原 | 可逆 |

深链直接带 `history=true` 进入仍落在版本历史 tab。另查了两种 push 化后可能的历史污染
（点击已选中的 tab、tab 条上按方向键），都不产生多余历史项。

### 任务二：核过，没问题，未做改动

这是我要求的交叉复核 —— T36 改了 `sheet.tsx` 的关闭按钮偏移，但当时 `case-detail-sheet.tsx`
属 T35 领地无法验证。实测该抽屉真实盒模型（`p-0 w-full! sm:max-w-3xl!` + 自绘 header 生效状态）：

- **纵轴**：标题首行中心 cy=26；关闭按钮盒 top 12 / h 28 → cy=26；按钮内 svg cy=26。三者同轴，
  `dialog.tsx` 注释里「16 + 20/2 = 26 = 12 + 14」的推导逐像素成立。
- **横轴**：图标右边界 1424，正好压在 16px gutter 线上，与下方「编辑」按钮右边界同一条线。
- `p-0` 在此是空操作（`SheetContent` 本无默认 padding），故覆盖内边距未影响落点。

**它没有为了交差硬凑一个修改** —— 这正是派单时明确要求的（「本来就对的就说没问题」）。

### 它顺手报出的真问题（已升级为 T39）

dev 环境下 TanStack devtools 悬浮徽标固定在视口右上角，**完全盖住这个抽屉的关闭按钮**，
把徽标 `display:none` 后 X 才露出。它正确判断这不属于自己的范围、未擅自改动，只上报。

我接管后定位到根因在 T34：T34 为了给浮动主题开关腾出左下角，把 router devtools 挪到了
`top-right`，而那正是全仓 Sheet/Dialog 关闭按钮的统一位置。属 T34 引入的 dev 期回归，
且用户即将在 dev 模式下预览，会第一时间撞上 → 派 **T39**。

### 需要向用户披露的

- T37 为做浏览器实测，在**全局**装了 `chrome-devtools-mcp`（`npm i -g`）。不进仓库、
  不改 `package.json`/lockfile，但确实动了全局 npm 环境。不想留可 `npm uninstall -g chrome-devtools-mcp`。
- 截图因工具限制落在系统临时目录而非指定 scratchpad，仓库内无残留（`git status` 已核，无新增文件）。

**结论：通过。**
## T39 复核（主题开关移进 chrome + devtools 让位）

### 改了什么

| 文件 | 改动 |
| --- | --- |
| `__root.tsx` | 移除浮动 `<ThemeToggle className="fixed bottom-3 left-3 z-50 shadow-lg" />`；devtools `top-right` → `bottom-left`，并把「top-right 是关闭按钮的固定位置」写进注释钉住 |
| `project-list.tsx` | 标题行右侧改为 `gap-2` 组：`<ThemeToggle />` + 「新建项目」；骨架屏同步从两个骨架改三个，注释一并更新 |
| `route.tsx`（工作区） | `<PresenceAvatars className="ml-auto" />` → `<div className="ml-auto flex items-center gap-4">` 内含头像 + 开关，组内 gap 对齐 header 自身的 `gap-x-4` |
| `theme-toggle.tsx` | 未动，`aria-label` + `aria-pressed` 保留 |
| `routes/projects/index.tsx` | 无需改动（`ProjectsPending` 本就委托 `ProjectListSkeleton`） |

两处落点都在 32px 控件行上：`size="icon"` 即 `size-8`，与「新建项目」的默认 `h-8`、
工作区 header 已明写的「控件高度 = 32px 档」一致。

### 实测证据（我要的是证据不是结论）

- **关闭按钮不再被遮挡，且没有靠 `display:none` 作弊**：Sheet 打开时 `elementFromPoint` 打在 X 中心
  返回的就是关闭按钮本身，按钮盒 `{x:1242,y:12,28×28}`，devtools 徽标 `{x:8,y:661,155×30}`，
  对角线两端；随后通过真实命中测试点击 X，抽屉关闭、URL 掉掉了 `?caseId=`。
- **两处开关都可用且持久**：项目列表页点击 → `localStorage.theme="light"` + `<html class="">`，刷新仍亮；
  工作区 header 点击 → `theme="dark"` + `<html class="dark">`，`body` 背景 `oklch(0.16 0.012 265)`，刷新仍暗。
- **骨架屏真的等高**：用 `window.__TSR_ROUTER__` 清缓存 + Slow 3G 逼出真实 pending 态，
  骨架标题行 37 次采样恒为 `height 32, y 24`，就绪态同为 `height 32, y 24`，卡片栅格 `y 72`。零跳动。
- **无布局破坏**：1280px header 单行；500px 换行成两行且头像+开关组右对齐；
  360px 项目列表行仍 32px。两页 `scrollWidth === clientWidth`，控制台零报错。

### 亮色模式首次真机渲染的结论

**令牌本身是好的** —— 项目列表、工作区列表、筛选条、徽章、详情抽屉在亮色下都正确且可读。

**但发现一个真缺陷：脑图画布不跟随主题**（详见 T40）。这正是我坚持要补浏览器验证的理由：
T34 的全部数值计算都是对的，却量不到「有个第三方组件自带一套主题、根本没接进来」这种问题。

### 需要记录的两点

1. **T39 的一个无法复现的观察**（它主动上报而非隐瞒）：Slow 3G 节流下整文档导航后，
   曾读到 `localStorage.theme === "dark"` 而 `<html class="">`。四次复现失败，
   `use-theme.ts` 里除显式切换外无处移除该 class。可能是 CDP 网络模拟的副作用。
   **若日后出现首帧主题闪烁的报告，从这条线索查。**
2. 左下角现在是 devtools 徽标，它继承了当初把 ThemeToggle 移走的那个重叠问题
   （滚到底时压住模块树最后一行）。这是我明确指示的取舍：devtools 仅存在于 dev 构建，
   产品 UI 优先。记录在案。

**结论：通过。**

---

## 并发写入者（非本会话）

复核 T39 门禁时发现 `packages/db/src/repositories/**` 出现了没有任何 agent 被授权的改动。
查明：**另一个 Claude Code 会话（`automationstack-d5`）正在同一个仓库里工作**，
于 08-20 01:33–01:45 新建 `case-snapshot-core.ts`、`case-snapshot-core.test.ts`、`repository-types.ts`，
并重构 `case-import-repository.ts`、`mindmap-repository.ts`。这也解释了 T37 观察到的
「种子库里用例版本号从 v4 涨到 v5、名字被改过又回滚」。

由此产生两条门禁红，**均不属于本会话，已明确要求所有 agent 不许代修**：

| 门禁 | 文件 | 现象 |
| --- | --- | --- |
| `check-file-rules.js` | `case-import-repository.ts` | 301 行 > 300（我一度据「301→302」判断该会话仍在写，**这是我读错了**：文件 mtime 稳定在 08-20 01:34，301 与 302 的差是 `wc -l` 与守卫脚本计数口径不同，见 T42 ③） |
| `pnpm lint` | `case-snapshot-core.test.ts` | `max-lines-per-function` |

---

## T42 复核（并发会话的两条门禁红 + 守卫脚本差一错误）

三条全部自查，**不采信报告**：

| 项 | 报告 | 我的实测 |
| --- | --- | --- |
| `case-import-repository.ts` | 301→268 | `wc -l` = 268 ✅ |
| 新建 `case-import-lookup.ts` | 43 行 | 43 行 ✅，只含 `findBySourceRef` / `findByNameInModule` 两个函数 |
| 原有 `noAwaitInLoops` 抑制 | 位移到 257 行 | 全仓抑制扫描确认它在 257 行，注释原文未改 ✅ |
| 测试拆分 | 1 个 describe → 4 个顶层 describe，11 个用例不变 | `grep -c "	it("` = 11 ✅，四个顶层 describe 在 46/74/84/108 行 ✅ |
| 守卫差一 | `split("\n").length` → `- 1` | 已改，注释说明与 `wc -l` 对齐 ✅ |

**放宽一行到底赦免了谁 —— 我自己独立跑了一遍**（这是派单时专门设的防作弊点：
修 ③ 会把门禁放宽一行，不能让 ① 顺势自己变绿）：

```
298  apps/web/src/components/workspace/module-drag-keyboard.test.ts
297  scripts/check-tailwind.js
290  packages/db/src/repositories/modules-repository.ts
```

290–320 行区间只有这三个文件，**没有任何文件落在 299 或 300**。上限从 299 挪到 300
一个文件都没赦免；`case-import-repository.ts` 的 301 真行数在修正后的口径下依然超限，
只能靠真拆文件解决 —— ① 无法被 ③ 洗白。

**防作弊检查**：全仓抑制注释扫描，`eslint-disable` / `biome-ignore` / `@ts-*` 全部是
既有的（drizzle barrel、`noAwaitInLoops` 的事务串行、`routeTree.gen.ts` 生成物、
`scripts/seed.ts` 的 console）；`eslint.config.js` / `biome.json` mtime 停在 08-18 20:43，
`package.json` / `pnpm-lock.yaml` 无本轮改动。

**门禁（我自己跑的）**：`pnpm lint` 0 error（3 条 `no-console` warning 在
`apps/server/src/index.ts`，既有）、`check-file-rules.js` exit 0（此前 exit 1）、
`check-tailwind.js` exit 0、`pnpm test` 15 文件 202 通过、`TURBO_FORCE=1 pnpm check-types` 7/7。

### 它提出但没有擅自改的三条（我的判断）

1. **`overwriteExisting` 在结果为 `unchanged` 时仍报 `action: "overwritten"`** —— 真问题，
   但属于并发会话的代码且有注释说明是刻意的，不在本次授权范围内，留给用户决定。
2. **`findByNameInModule` 只按 `moduleId` 过滤、不带 `projectId`，与兄弟函数不对称** ——
   **不是缺陷**：`modules.projectId` 是 FK，一个 moduleId 只能属于一个项目，加 `projectId`
   条件是冗余的。对称性是风格问题，不改是对的。
3. **`wc -l` 口径的边界**：300 行内容且**结尾无换行**的文件现在算 299 行、放行。这是
   `wc -l` 的固有语义（数换行符个数），仓库由 biome 统一格式化、全部以换行结尾，
   实际不可达。接受。

**结论：通过。**

---

## T40 复核（脑图画布不跟随亮/暗主题）

**它推翻了我派单时的根因假设，而且是对的。**我写的是「`mind-elixir/style.css` 自带一套主题」；
实际 `style.css` 是主题中立的，颜色全是 CSS 自定义属性。真正的根因在构造函数
（`MindElixir.js:2866`）：没传 `theme` 时它按 **`matchMedia('(prefers-color-scheme: dark)')`**
选内置主题 —— 认的是**操作系统**，而本仓库的外观由 `<html>.dark` 决定、用户可显式覆盖系统。
这台机器 OS 是暗色、应用是亮色，于是整屏从中间劈开。假设错了但现象没错，修法也因此更干净。

### 修法为什么是对的

新建 `mindmap-theme.ts`（80 行），`cssVar` 每一项与 `palette` 全写成 `var(--令牌)`，
构造时一次性传入。关键在于 `changeTheme` 做的全部事情就是
`container.style.setProperty(key, value)`，而 `palette` 只在 `linkDiv` 里被读成 SVG 的
`stroke` 与内联 `style.borderColor` —— 三个落点都是 **CSS 值**，`var()` 在使用点才解析。
所以 `.dark` 一加一撤，画布/节点/连线/工具栏同帧跟着变：**零 JS、零 layout、零 DOM 变更**。

这让我派单时点名的两个坑**结构性不成立**，而不是「小心绕开了」：不跑 `refresh()` 就
不会击穿 `mindmap-budget` 的节点预算、不会把用户手动展开的节点收回去，也不会与
`TrailingMerge` 的挂起状态打架。它实测佐证：手动展开 27 个节点后切主题，
`MutationObserver` 记录 **canvas 内 0 次 mutation**，节点数 90→90、展开数 27→27、
根/主/连线元素引用全部同一。

反向证据它也查了：`changeTheme(theme, shouldRefresh = true)` 第二个参数**默认 true**，
走「JS 解析出具体颜色再调用」这条路会直接触发 O(节点数) 的整树重建 —— 这正是我要求避开的。

### 我自己核对的

- `mindmap-canvas.tsx:86` 确实把 `theme: MINDMAP_THEME` 传进了构造函数 ✅
- **`palette` 只有一个颜色安全吗？** 我去读了 `MindElixir.js:1347`：
  `g = c.nodeObj.branchColor || y[l % y.length]` —— **取模**，长度 1 时恒取第 0 项，
  不会越界成 `undefined`。这是我不看源码就不敢签字的一处 ✅
- `mindmap-theme.test.ts` 钉住的不变量选得准：任何人把某个值改回写死颜色，
  那一处就永远停在一种外观，而**这种回归在单一外观下自测是看不出来的**。
  15 个测试文件全在 vitest 的 `src/**/*.test.ts` 收集范围内，2 个新用例确实在跑 ✅
- 三个新增/改动文件 80 / 43 / 126 行，全部合规；门禁我已整体重跑

### 它自报的三条限制（我认可，记录在案）

1. **主分支色塌成一种颜色**。mind-elixir 默认用 10 色轮换区分主分支，令牌里没有
   一套能在亮暗两种底色上都过 3:1 的 10 色板；`PRESENCE_COLOR_PALETTE` 统一在 L=0.8
   且语义是「人」。统一用 `var(--primary)` 与全站一致，**代价是丢掉按模块区分颜色**。
   若以后要恢复，需要为脑图单独设计一支分支色阶。
2. **`exportSvg` / `exportPng` 会导出无法解析的 `var()`**。当前两个工具栏都没暴露导出、
   右键菜单也已裁剪，不可达；但**一旦加导出功能，这是必须先处理的前置约束**。
3. 一次无法归因的事件：`localStorage.theme` 变成 `light` 而 React 的图标仍是月亮。
   图标不同步能解释（它自己的脚本直接改 `classList`、绕开了 store 的 notify），
   localStorage 那次写入归不了因（可能是别的会话在驱动同一个 Chrome）。
   清场重跑未能复现。与 T39 那条同样无法复现的观察放在一起看 —— 若预览时真出现
   首帧主题闪烁，这两条是线头。

**结论：通过。**

---

## T43 复核（脑图按模块作用域）

派单时我点名的**第一风险**是查询键失配：画布改成按 moduleId 查询后，`mindmap-sync-runner.ts`
的 `:158`（rebuild）与 `:244`（patchCache）仍用 `{ input: { projectId } }` 拼键，
会去补画布根本没在读的那条缓存 —— 文件头注释写的「runner 认领自己写下的引用，
所以自己的编辑不触发重绘」这条机制会失效，用户正在打字时画布可能被重建。

**它的解法是对的，而且是编译期而非约定**（我核过源码）：

- `MindmapScope.moduleId` 声明为 `readonly moduleId: string | undefined` —— **必填属性**，
  不是 `moduleId?:`。构造时必须显式表态「全项目还是某个模块」，漏写就是编译错误，
  不会静默退化成「全量」。
- `mindmapTreeQueryOptions(scope)` 把整个 scope 原样透传给 oRPC，是**唯一**构造点。
  `:166` 和 `:252` 现在都调它，键不可能分叉。
- runner 的 deps 里**已经没有 `projectId` 字段**，只有 `scope`，不存在第二份可漂移的副本。

加第三维 = 往 `MindmapScope` 加一个必填字段 → 所有构造点当场编译失败，
而查询键的构造点仍然只有一个。这满足了我要求的「漏传在类型层面不成立」。

### 它自己发现并处理的一个我没想到的连带问题

作用域一多，缓存就不止一条了：全量脑图、别的模块各有自己的条目，
上面那次 patch 覆盖不到它们，而 `staleTime` 是 60s —— **切回全量脑图会看到编辑前的旧树**。

它的处理（`:269-275`）值得记下来：`invalidateQueries({ refetchType: "none" })`
只标脏不重取，并且用 `hashKey` **把自己这一条排除掉**。理由写在注释里：
重取自己会产生新引用，画布会在用户手底下重建 —— 这正好是本任务要防的那件事。
这条如果写漏了，症状是「编辑时画布偶发重建」，极难复现。

### 第二个陷阱（作用域视图里的「新建」）的处置

`mindmap.tree` 不含项目根，根节点是前端 adapter 造的，所以作用域视图里选中项目根
按 Tab 会建出 `parentId: null` 的项目级模块 —— 它不属于当前作用域，**建完立刻消失，
看起来像新建失败**。它复用了既有的 `mindmap-guards.ts` 拦截 + toast（没另起一套）：

- 挂到项目根 → 拦下 + toast「当前只看这一个模块，节点不能挂到项目根下；请先返回全量脑图」
- 删除作用域根模块 → 拦下 + toast，**确认对话框根本不弹**（删了会导致下次 tree 返回 NOT_FOUND、整页变加载失败）

### 实测里最有说服力的一条

验「改名不重建画布」时它做了**对照实验**：先给全部节点打 `data-t43stamp`，
改名后 52 个 stamp 全在（0 个被替换）、选中态还在、手动折叠的节点仍是折叠态；
然后手动 reload 同一页，stamp 数变 0。**后者证明探针确实能检出重建**——
否则「没检测到重建」可能只是探针失灵。这是我认可的验证方法。

### 我另外核对的

- 键盘可达性：脑图按钮是带 `href` 的真 `<Link>`（`ModuleMindmapLink`，`module-tree-node.tsx:125`），
  `aria-label` 用了带模块名的 `模块「X」脑图`，与本行既有的 `模块「X」操作` 同句式 ✅
- 模块名链接与脑图链接共用同一个 `useSelectModuleSearch` reducer（`:85`），
  没有「两处各写一遍 search 补丁」的分叉风险 ✅
- `pnpm test` 17 文件 219 通过、两个守卫脚本 exit 0、`check-types` 7/7 ✅
- **它报告里说 `pnpm lint` 有 4 个 error 在 T44 的文件里 —— 那是 eslint 缓存的陈旧读数**。
  我删掉 `.eslintcache` 重跑是 **0 error**，只剩 `apps/server/src/index.ts` 既有的 3 条
  `no-console` warning。它没说错话（它读到的就是那样），但结论要以清缓存后的为准。

### 记录在案的代价

1. **`module-tree-node.tsx` 现在 294/300 行**，逼近上限，下次动这个文件大概率要先拆。
2. **模块树每行现在 4 个控件**（拖拽、折叠、脑图、菜单），实测全部 24×24、间距 4px、无重叠，
   最深层名称仍有 88px 且长名不产生横向溢出。但**长模块名的可读宽度被压到 88px**，靠 truncate 兜底。
   它的建议我同意：**再要加第 5 个行内控件，应该把「脑图」和「操作」合并进菜单，而不是继续加图标**。
3. 图标 `NetworkIcon` 用 lucide 默认 stroke 2 —— 该行本来就是混的（Grip/Folder 是 1.5），
   它对齐的是相邻两个图标按钮。这一行的 stroke 不统一是既有问题，不是本次引入的。

### 它主动声明的未覆盖

Cmd/中键新标签页（`<a href>` 由浏览器原生保证，但没实测）；真实鼠标拖拽把节点拖出模块
（拖出的拦截只有单测覆盖）；多人协作下 realtime 失效在作用域视图里的表现。

**结论：通过。**

---

## T44 复核（用例编辑抽屉 + markdown 编辑器）

用户提了两件事：**抽屉要占大部分页面**、**尽量用富文本编辑器**。前一件是纯尺寸问题，
后一件在「存储格式已经定成 markdown 纯文本」的前提下是有陷阱的，复核的重点在后者。

### 它用实测淘汰了两个所见即所得方案，这条我认可

用户说的「富文本」最直觉的读法是 WYSIWYG（Milkdown / MDXEditor 这类）。
它没有凭偏好排除，而是拿 10 条真实用例文案跑了往返，**6 条被改写**：
`&` → `\&`、`*` → `\*`、`_` → `\_`、`- ` → `* `。原因是这类编辑器经
remark 解析再 stringify，而用例正文里全是 `user_id`、`GET /api?a=1&b=*` 这种字符。

后果有两层，第二层更隐蔽：**存量数据被污染** + **版本对比里冒出一堆假改动**
（`field-diff.ts` 对原始字符串做 diffWords，转义字符会被当成真实修改）。
所以选了 CodeMirror：**markdown 原文就是编辑器缓冲区，转换函数是恒等函数**，
结构上不存在丢字符的可能。语法标记（`**`、`- `、`#`）保持可见只调暗，
屏幕上看到的永远等于库里存的。

代价要如实说：**这不是所见即所得**。加粗显示为 `**加粗**` 并加粗，不是只显示「加粗」。
在「不能碰存量纯文本」这个约束下，我认为这是正确取舍，但它确实不是用户字面要的东西。

体积也是实测的（esbuild --bundle --minify + gzip -9）：CodeMirror 99KB gzip，
比 MDXEditor 的 222KB 小一半以上。它还进一步剔掉了 `@codemirror/lang-markdown`
（会连带拉进 lang-html/js/css 做嵌套高亮，99KB → 173KB），改用 `@lezer/markdown`
的 parser 自己包一层 `Language`。**新增 6 个依赖全部精确版本、catalog 未动。**

### 40 个编辑器实例的问题它想到了

一个用例可以有 20 个步骤 × 2 个字段。它的做法是**未聚焦是原生 textarea、聚焦才就地换成
CodeMirror**，同屏永远只有一个活实例；chunk 在字段挂载时预取，聚焦切换是同步的。
顺带解决了三件事：SSR（这条路由是会 SSR 的，`@codemirror/view` 在 import 期读 `navigator`）、
存量数据逐字符显示、chunk 加载失败时 textarea 仍可用。

### 它在验证里抓到的一个真 bug（这条最有价值）

我派单时提醒的是「Firefox 可能派发 relatedTarget 为 null 的 focusout」。
它用 CDP 抓到完整事件序列，证明**Chrome 上同样会触发**，而且我把机制想窄了：

```
focus    target=TEXTAREA#case-preconditions
blur     target=TEXTAREA  related=null   ← React 摘掉持焦元素时派发
focusout target=TEXTAREA  related=null
focus    target=DIV(抽屉容器)            ← Sheet 的焦点陷阱把焦点抓了回去
```

关键是最后一行：焦点不是落到 body，而是被抽屉的 focus trap 抓走——所以这跟浏览器
差异无关，**任何把编辑器放进 Sheet 的实现都会中招**。症状是「点进去永远进不了编辑器」。

修法是浏览器无关的：`relatedTarget` 非 null 时按原逻辑判容器包含；为 null 时不当场
下结论，两层 `requestAnimationFrame` 后改判 `document.activeElement` 是否回到本字段
容器内。我核过源码，判断分支是对的，交接竞态与处理方式也写进了 hook 注释。

它还顺手修了一个自己引入的坑：按 Esc 退出编辑器后焦点仍在 textarea 上，
再点它不触发 focus 事件、光靠 `handleFocus` 回不到编辑器 → 补了 `onClick` 在
`escaped` 态下重新拉起。

### 我另外核对的

- **宽度**：`w-full! gap-0 p-0 text-sm sm:w-11/12! sm:max-w-7xl!`，1440 视口下 1280px / 89%，
  左侧始终留 160px 列表条（刻意不做整页：用户知道自己没离开列表，点外面能关）。
  新建与编辑用的是同一个常量、同一个 `<CaseForm>`，原 384px 的 `case-create-dialog.tsx`
  已删除且无残留引用 ✅
- **字号改在内容层**，没有掀 `sheet.tsx` / `dialog.tsx` 基类上的 `text-xs/relaxed`
  （那两条是全站每一个弹层的默认字号）✅。`packages/ui` 只动了 `textarea.tsx` 一处：
  删掉 `md:text-xs`——我核过，它与基类 `text-xs` 逐字节等值（视觉零变化），
  但因为带断点变体，tailwind-merge 不会让调用方传的 `text-sm` 覆盖它。`input.tsx` 里有同样的先例。
- **键盘**：Escape 绑定排在 `defaultKeymap` 之前（standardKeymap 也占 Escape）；
  **刻意不绑 `indentWithTab`**，Tab 必须能把焦点带出 contenteditable，否则键盘用户被困 ✅
  工具条按 ARIA toolbar 模式做 roving tabindex（否则 20 步 × 5 颗会往 Tab 序塞 100 个停靠点）✅
- **可访问名**：`.cm-content` 带 `aria-label` 且与可见 Label 同文案（聚焦后真正持焦的是
  contenteditable，`htmlFor` 关联不到它，只能靠可访问名对齐）；步骤字段原来只有 placeholder，
  现在有了真实可访问名，比改造前更好 ✅
- **误关保护**：脏判定用字段级指纹而不是整对象 `JSON.stringify`（后者依赖键插入顺序，
  而表单值一路是 `{...values, name}` 展开出来的）；拦到脏就弹二次确认且**不动受控的 `open`**，
  抽屉原地不动，一个字不丢 ✅
- **门禁我自己重跑**（先 `rm -f .eslintcache`）：lint **0 error** / 3 条既有 `no-console` warning，
  test **17 files 219 passed**，两个守卫脚本 exit 0，`TURBO_FORCE=1 pnpm check-types` 7/7，
  `pnpm install --frozen-lockfile` **ok**（证明没有局部安装造成的 lockfile 漂移），
  3000=200 / 3001=307，`packages/api/node_modules/@automationstack/ai` 软链完好 ✅
- 全仓抑制注释扫描：只有既有的两处（`routeTree.gen.ts` 是生成文件、`label.tsx` 是既有），
  本次**零新增** ✅

### 记录在案的代价

1. **撤销历史随 view 销毁**：字段失焦后 Cmd+Z 撤不回上一次聚焦期间的编辑。
   这是「聚焦才挂实例」的直接代价。
2. **工具条按钮 24×24**（`size="icon-xs"` = `size-6`），正好压在 WCAG 2.5.8 的 24×24 下限上，
   `gap-0.5` 无重叠、合规，但没有余量。
3. **加粗/斜体没有「再点取消」**，重复点会得到 `****文本****`。v1 接受。
4. **`case-form.tsx` 293/300 行**，与 `module-tree-node.tsx` 的 294 一样逼近上限，
   下次动这两个文件大概率要先拆。

### 它主动声明的未覆盖

Firefox 未实测（机器上只有 Chrome）；前置条件 / 步骤字段的词级 diff 未单独实测
（实测到的 `<ins>/<del>` 来自 priority 与 maintainer，但走的是 `field-diff.ts` 里同一条
`diffText` → `diffWords`）；屏幕阅读器未实测（只验了 DOM 上的 aria 属性与焦点顺序）；
触屏/移动端未实测；输入延迟未做量化 profiling；「放弃并关闭」后 DOM 里残留 1 个
Base UI 关闭态 `[role=dialog]` 节点，可见性未进一步确认。

**结论：通过。**

---

## 主代理独立复核：抽屉 + 编辑器的亮/暗双外观实测

T41（跨外观视觉验收）被终止且零交付，所以到 T44 为止，**所有视觉数据都来自各任务自己的
自测**，没有第三方复核。我自己补了一次，范围只收在本次改动最大的那个面上：
1440 视口、用例详情抽屉进入编辑态、前置条件字段挂上 CodeMirror，
输入 `**粗** \`code\` - 项` 让语法标记出现，再用 APCA 量。**只输入不保存，未写库。**

| 量测点 | 亮色 Lc | 暗色 Lc | 判定 |
|---|---|---|---|
| 抽屉标题（14px/500） | 103 | −100 | ✅ 正文阈值 75 |
| 字段标签（14px/400） | 103 | −100 | ✅ |
| 编辑器正文（14px/400） | 103 | −95 | ✅ |
| 工具条图标 | 99 | −97 | ✅ |
| **调暗的语法标记 `**`（opacity 0.65）** | **81** | **−71** | ⚠️ 见下 |

**唯一一条不对称：语法标记在暗色下 |Lc| = 71，比亮色的 81 低 10，掉到正文阈值 75 以下。**
按「非正文 ≥60」算它是过的（71 > 60），而 `**`/`` ` ``/`- ` 这类标记本来就是刻意压暗的
格式提示、语义由被它包裹的样式化文本承载，我倾向按非正文计。但这是本次唯一一处
亮暗不等价的地方，**记在这里，不自行改配色**——要不要把 `opacity: 0.65` 在暗色下抬到
0.75 由用户定。

顺带确认的（两种外观完全一致）：抽屉 1280px / 视口 89%；工具条 5 颗按钮实测 24×24；
CodeMirror 14px / 行高 22.75px（= leading-relaxed 1.625，与未聚焦态 textarea 一致，
所以聚焦切换不跳）；caret 颜色亮色 `oklch(0.22 …)` / 暗色 `oklch(0.97 …)`——
说明主题令牌在编辑器内部确实生效，没有硬编码色；**控制台零异常**。

### 顺带发现的一条可用性问题（未改）

前置条件字段的编辑区实测 **1245px 宽**。这是把抽屉拉宽到 1280px 的直接副作用：
单列长文本的行长远超舒适阅读区间，眼睛回扫距离过长。步骤区因为是两列栅格，
每列约 600px，问题小得多。建议给单列的 markdown 字段加一个最大行长约束
（`max-w-prose` 一档），抽屉仍然宽、但正文不摊满。这条是「把抽屉做宽」这个需求
自带的代价，不是 T44 做错了，留给用户决定。

### 这次复核**没有**覆盖的

只测了 1440 一个视口、只测了「前置条件」一个字段、只测了详情抽屉（新建抽屉没测）、
只在 Chrome 上测。列表页 / 脑图页 / AI 面板 / 版本对比这些面**至今没有任何第三方
跨外观复核**——T41 死掉留下的窟窿只补上了一小块。

---

## 开发库当前的测试残留（直接读库对账，2026-08-20）

我怀疑 T44 在既有用例上留了改动，让它自查，结果**它是对的、我推断错了**：
`DEL:"P0" / INS:"P1"` 那条 diff 出现在既有用例的历史里，但 T44 只是打开
「版本历史」tab **读**了一下。它自己造的那条临时用例（含 3 个版本快照）
已经连级联删除一起清干净，`cases/get` 返回 404，既有 20 条用例在它的
时间窗（`2026-08-21T03:56–04:12Z`）内**一条都没被写过**。

但我自己直接读库时发现，**库里确实有更早留下的测试残留**，与 T44 无关，
列在这里免得用户看到时以为是 bug：

1. **`e234ca50…`「普通商品下单成功【T18临时】」** —— 名字里带「T18临时」，
   是 T18 建完没清的用例。它后来还被回滚过两次
   （v4 `savedBy=访客-0eee`「回滚至 v1」、v5 `savedBy=小新`「回滚至 v2」）。
2. **`7b13a3c4…`「未发货订单申请退款」现在是 v8**，其中 **v4–v8 是代理的测试写入**：
   `savedBy` 全为 null，changeNote 依次是「诊断测试」「还原诊断改动」「真实改动验证」
   「回滚至 v3」，时间集中在 `2026-08-20T08:25–08:37Z`。内容最后回滚到了 v3，
   所以**当前值是对的**，但版本历史里永久多了 5 条测试记录。
3. **多了一个项目 `8c85bb88…`「Wonder」**，`createdAt 2026-08-21T03:09:29Z`。
   无法归因——不是 T44（早于它开工 47 分钟），可能来自共用同一工作树的
   另一个会话，也可能是手动点出来的。

这三条都只影响演示数据、不影响代码，清不清由用户定。真要清干净，
重跑种子脚本是最省事的做法。
