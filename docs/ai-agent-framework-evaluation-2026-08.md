# AI Agent 底座选型与用例生成方案调研

> 调研日期：2026-08-22 ～ 2026-08-26
> **决策（2026-08-26，由项目负责人拍板）：采用 pi（`@earendil-works/pi-agent-core`）作为 agent 底座。**
> 本文所有第三方数据均为调研期间实测/实查，非文档转述；数据会过期，重新决策前请按附录方法复核。

> ⚠️ **本文原先给出的推荐是「保留 AI SDK v7」，该推荐未被采纳。**
> 下面 §0～§3 原样保留调研过程与论证，**不要把它们读成现行决策**——它们是决策的输入，
> 记录的是「当时基于哪些事实这样想」。选型已定为 pi，落地与实测另见 §5。
> 保留反对意见的原文而不是删掉，是为了让 pi 上线后真的踩到 TypeBox / 依赖体积这两条时，
> 能查到当初预判了什么、预判错在哪儿。

---

## 0. 结论摘要

> 下表是**调研当时的推荐**，非最终决策。最终决策见文首。

| 候选 | 调研期推荐 | 一句话理由 | 最终 |
|---|---|---|---|
| **AI SDK v7**（现状） | ✅ 保留 | 需要的能力全都有，zod 原生，零迁移成本 | ❌ 未采纳 |
| **pi**（`@earendil-works/pi-agent-core`） | ❌ 不采用 | 成熟度很高，但 TypeBox 与本仓库全栈 zod 冲突，且其独占能力我们用不上 | ✅ **采用** |
| **Mastra** | ❌ 不采用（evals 留观） | 为一个我们并不需要的能力（mid-execution resume）吞下整个平台 | ❌ 未采纳 |

**关键论证**：我们设想的「两阶段生成」中间那次暂停，**不是 workflow 意义上的 suspend**，因此 Mastra 的核心卖点对我们不成立。详见 §3.2。

**真正的问题不在框架**：当前生成质量差的主因是**上下文饥饿**，换任何框架都不会自动解决。详见 §1。

---

## 1. 现状诊断：问题不在 prompt，在上下文

### 1.1 决定性发现

`packages/ai/src/tools.ts` 中 `read_existing_cases` 的返回类型：

```ts
export interface ExistingCaseSummary {
	caseType: CaseType;
	id: string;
	name: string;
	priority: CasePriority;
	tags: string[];
}
```

**没有 `steps`，没有 `preconditions`。模型从头到尾没有看见过任何一条已有用例的正文。**

这直接导致系统提示词里两条要求物理上无法达成：

- 「避免生成重复或高度相似的用例」→ 只能靠标题字面比对，判不了语义重复
- 「了解已有用例」→ 只看得到标题、类型、优先级、标签，学不到本项目的写作粒度与风格

`packages/api/src/lib/ai-deps.ts` 中 `EXISTING_CASE_LIMIT = 50`，`toExistingCaseSummary` 只映射上述 5 个字段。

### 1.2 两个真实缺陷（与选型无关，独立存在）

**① `tool-error` 事件被静默吞掉**

`packages/ai/src/agent.ts` 的 `translatePart` switch 处理
`text-delta / tool-call / tool-result / abort / error / finish`，随后 `default: return;`。
AI SDK 的 `tool-error` 落进 default 分支被丢弃。

触发路径有两条，都不罕见：
- 工具入参 zod 校验失败（模型给出的 `proposals` 不合 schema）
- `execute` 内部抛错（如 moduleId 不存在）

用户侧表现：界面停在「生成中」，没有任何错误提示。

**② `acceptProposals` 存在跨项目采纳漏洞**

`packages/db/src/repositories/ai-acceptance-repository.ts` 的 `findModuleProjectId`
仅由 `moduleId` 反推 `projectId`；proposals 按 id 直取，**没有任何 session → project 的归属校验**。
构造请求可将 A 项目会话产出的提案，采纳进 B 项目的模块。

> 注：`packages/api/src` 目前全局没有项目成员校验（仓库范围的既定设计），
> 因此这个洞的实际可达性取决于登录用户能否拿到目标 moduleId。但修复成本极低，
> 不应依赖「拿不到 id」作为防线。

### 1.3 现有数据模型（无需改动的部分）

```
ai_generation_sessions (id, project_id, module_id, requirement, model, status, error, ...)
	└── ai_case_proposals (id, session_id, proposal jsonb<ProposedCase>, sort_order, status, accepted_case_id, ...)
```

`ProposedCase = { name, preconditions, steps: CaseStep[], priority, caseType, tags }`，
与 `test_cases` 表字段一一对应。这套「先入提案表、人工采纳后再落 test_cases」的两段式
是好设计，**方案沿用不动**。

### 1.4 已建成但完全未接线的部分

`ai_provider_config` 表 + 管理页 + `secret-box.ts` 的 AES-256-GCM 密钥存储 **全部建好，但当前完全不生效**。

生效口径只看环境变量（`packages/ai/src/config-store.ts` 的 `resolveAiConfig`）：
`AI_API_KEY` / `AI_BASE_URL` / `AI_MODEL`。
schema 注释已明确写明「这里是登记处，不是生效决策点」——即当前为有意为之的中间态。

---

## 2. 三家横评

### 2.1 AI SDK v7（`ai@7.0.68`，仓库现状）

以下均为对已安装 `node_modules/.pnpm/ai@7.0.68_zod@4.4.3/node_modules/ai/dist/index.d.ts` 的直接 grep 结果：

| 能力 | 位置 | 说明 |
|---|---|---|
| `Agent` | `:4608` | **仅为 type-only interface** |
| `ToolLoopAgent` | `:5147` | 真正的实现类；默认 `stopWhen` 20 步（`streamText` 为 1） |
| `toolApproval` | `:3452` `:4784` `:5008` | 官方 human-in-the-loop，稳定非实验 |
| `tool-approval-request` | `:1173` `:2334` | 配套的 stream part 类型 |
| `repairToolCall` | `:3478` | 已毕业；`experimental_repairToolCall`（`:3484`）已废弃 |
| `MockLanguageModelV4` | `dist/test/index.d.ts:103` | 支持数组脚本化 `doStream`，可测多步；`MockLanguageModelV2` 已不再导出 |

其他实测要点：
- `maxRetries` 默认 2；`onError` 默认 `console.error` + 推入流
- 遥测拆分至 `@ai-sdk/otel`，或零依赖走 Node `diagnostics_channel` 的 `"ai:telemetry"`
- **无官方 eval 框架**

**代码债（与选型无关，应修）**：
- `tool-error` 未处理（见 §1.2）
- `result.fullStream` 已废弃 → 应改用 `result.stream`
- `stepCountIs` 是 `isStepCount` 的别名

**关于 `toolApproval` 为何不采用**：见 §3.2。简言之，它要求持久化并重放完整 `ModelMessage[]`
（SDK 为此专门提供 `validateUIMessages`，说明 schema 漂移是已知痛点），
且官方明示「Subagent tools cannot use approval flows」。

### 2.2 pi（`@earendil-works/pi-agent-core`）

**身份更正**：用户提到的 `pi-agent` 原为 `badlogic/pi-mono`，
现 **HTTP 301 重定向至 `earendil-works/pi`**；npm scope 由 `@mariozechner/*`
（冻结于 0.73.1，2026-05-07）迁至 `@earendil-works/*`。

| 指标 | 实测值（2026-08-26） |
|---|---|
| Star / Fork | 97,467 / 12,050 |
| Open issues | 138 |
| License / 建仓 | MIT / 2025-08-09 |
| npm latest | 0.84.3（共 42 版） |
| 周下载 | 2,745,463（旧 scope 仍有 830,543 残余） |

**「去除 coding」无需手术**：依赖方向单向 `coding-agent → agent-core → ai → telemetry`；
coding 工具在 agent-core 内仅 1,203 行，且全部为 opt-in 工厂函数（不调用即死代码）。
直接安装 `@earendil-works/pi-agent-core` 即可。

**嵌入可行性**：无 `bin`，主入口无 `node:*` 导入，可纯作库嵌入 Hono 进程。
`agentLoop()` 返回的 `EventStream implements AsyncIterable`，可直接喂给 oRPC event iterator。

**独有优点**：
- `shouldStopAfterTurn` + `continue()` + `followUp()`：比 `toolApproval` 更贴近「干净暂停再恢复」
- 工具入参校验失败时，把**带路径的错误消息回灌给模型**令其自行修正
- 专门处理「响应触达 output token 上限导致参数被静默截断」的场景

**否决理由**：
1. **TypeBox 绑定**。`AgentTool.parameters` 类型为 `TSchema`。本仓库 oRPC contract、
   db schema 类型、现有 3 个工具**全部是 zod**。这是持续性的日常摩擦，不是一次性成本。
2. **0.x + 周级 minor + 已有一次整包改名换 scope 的前科。**
3. **巴士系数**：第一贡献者 3,540 commits vs 第二名 551；外部 issue/PR 默认自动关闭；
   背后公司无公开信息。
4. 将 OpenAI / Anthropic / Google / **AWS Bedrock** 四个官方 SDK 作为**硬依赖**（非 peer）。
   我们只用一个 OpenAI 兼容端点。
5. **其独占能力恰是我们不需要的**：session tree、上下文压缩、40+ provider。
   我们的「会话」是 Postgres 领域数据不是聊天记录；压缩服务于长时 coding session，
   我们一次 run 至多 8 步；provider 只有一个环境变量配置的端点。

### 2.3 Mastra（`@mastra/core@1.61.0`）

调研包含在隔离 scratchpad 中**真实安装并运行**的三组实验（本仓库零改动）。

#### 可行的部分（全部实测通过）

- **纯库可嵌**：`import { Agent } from '@mastra/core/agent'`，
  无需 `new Mastra()`、无需 storage、无需 memory、无需 server，完整跑通
  tool-call → tool-result → text 流程。
- **不依赖 `ai` 包**：deps 中只有三份别名化 provider 规范
  （`@ai-sdk/provider-v5/v6/v7` → `@ai-sdk/provider@2.0.3/3.0.14/4.0.4`），
  自行重写了 agentic loop，仅复用 provider 协议层。**因此与我方 `ai@7.0.68` 无版本冲突。**
- **现有 zod 工具零改动复用**：`ToolsInput` 显式接受 AI SDK tool 对象。
  实测将 `propose_cases` 完整嵌套 zod schema 原样喂入，schema 转换正确、`execute` 正常执行。
- **`createGenerationModel()` 直接可用**：产出模型 `specificationVersion === 'v4'`，
  经 `AISDKV7LanguageModel` 分发。
- **zod 版本无冲突**（实查）：`@mastra/core` peer `^3.25.0 || ^4.0.0`，
  `@mastra/memory` 硬依赖 `^4.4.3`，本仓库 catalog `zod: 4.4.3` 两者皆满足。
- **可 100% 自托管**：`MastraPlatformExporter` 无 token 时自我禁用；
  `LicenseClient` 无 key 时走 open-source 分支不联网；纯库用法不加载 PostHog
  （`dist/index.js` 与 `dist/agent/index.js` 对 telemetry 的引用数为 0）。
- **Evals 可离线进 CI**：`runEvals()`（来自 `@mastra/core/evals`）为纯编程 API，
  无需实例/storage/server，可裸跑于 vitest。内置 8 个确定性 scorer + 11 个 Quick Checks
  （`@mastra/evals` 全部依赖仅 `sentiment`/`compromise`/`keyword-extractor`/`string-similarity`，
  无任何模型 SDK）+ 16 个 LLM 判分 scorer。

#### 否决理由

**① 数据库 schema 所有权，直接冲突架构铁律**

实测：配置 storage 后跑一个 3 步 workflow，**自动建了 44 张 `mastra_*` 表**。
`init()` 是全域的——初始化 storage 即初始化全部 ~23 个 domain，不论是否使用。
且 `@mastra/pg` 编译产物中有 18 处 `ALTER TABLE`，含 `ADD COLUMN IF NOT EXISTS`、
`ALTER COLUMN ... DROP NOT NULL`、分区 ATTACH/DETACH、`RENAME TO "mastra_agents_legacy"`。
**升级 Mastra = Postgres 被就地改结构，且未经我方 review。**

（官方文档仍称「八张核心表」，严重过期。）

缓解方案存在且有效——只挂 `workflows` 单 domain 可降至 **1 张表**（实测 44 → 1），
配合 `schemaName: 'mastra'` 隔离——但需要团队明确豁免并写入文档，
且每次升级都要 `exportSchemas` diff 一遍。

**② semver 不可信，breaking change 走 minor**

1.0 发布于 **2026-01-20**（实查 npm time），至今 **61 条 1.x minor 线**（约每周 2 个），
npm 上共 1517 个版本。CHANGELOG 中 1.x 段 "breaking" 出现 98 次，例如：

- `**Breaking:** Removed cloneAgent() from the Agent class`
- `**Breaking Change:** memory.readOnly has been moved to memory.options.readOnly`
- `breaking schema change to mastra_schedules and mastra_schedule_triggers`

近期还有大规模改名：`runExperiment → runEvals`、`scorers/llm + scorers/code → scorers/prebuilt`、
`CloudExporter → MastraPlatformExporter`、legacy evals 整体删除。
**网上任何 pre-v1 的 Mastra 资料均已失效**，包括多数 LLM 训练数据中的内容。

**③ 依赖面积与商业化方向**

实测干净目录安装 `@mastra/core + @mastra/memory + @mastra/pg + zod`：

| | 本仓库现状 | Mastra |
|---|---|---|
| `node_modules` | 20 MB | **146 MB**（7.3×） |
| 顶层包数 | 9 | **160**（17.8×） |
| 总包数 | — | 206 |

`@mastra/core` 单包 unpackedSize **65,057,846 字节 / 3,102 文件**（实查 npm）。
`@modelcontextprotocol/server`、`@a2a-js/sdk` ×2、`croner`、`execa`、`posthog-node`、`ws`
**全部为硬依赖**——这是攻击面与供应链面积，不是可选项。

好消息：无 native 依赖（`find -name "*.node"` 零结果），唯一二进制是 `xxhash-wasm` 的
纯 wasm，无 install script，不影响 CI 缓存与跨平台。

**License 现状（含一处重要更正）**：

`@mastra/core` npm 标 `Apache-2.0`，GitHub 仓库标 `NOASSERTION`。
存在 `ee/LICENSE`（Kepler Software, Inc. 私有条款，"Version 1.0, Effective August 24, 2026"），
覆盖 `packages/core/src/auth/ee`、`agent-builder/ee`、`editor/src/ee`、`playground*/src/ee`。

> **更正一处流传说法**：EE license **不是 2026-08-24 新建的**。
> `ee/LICENSE` 的提交历史最早可追溯至 **2026-03-03**
> （`feat: auth core, server RBAC, and adapter permission enforcement`）；
> 2026-08-25 那次提交是 `chore: **update** Enterprise Edition license`，即**修订条款**。
> 真实情况是：open-core 边界已存在约半年，近期发生的是厂商修改了条款措辞。
> 这不比「刚开始商业化」乐观——它是一个**有观测记录的行为模式**。

agent / workflow / tools / memory / evals 核心目前仍在 Apache-2.0 一侧。

#### 迁移成本（若采用）

现有 `packages/ai/src/agent.ts` 155 行。

| 文件 | 改动 |
|---|---|
| `tools.ts` / `provider.ts` / `prompts.ts` / `config-store.ts` | **零改动**（实测验证） |
| `packages/api/src/lib/ai-generation-stream.ts` / 前端 / oRPC | **零改动**（`GenerationEvent` 是我方领域类型，差异被翻译层吸收） |
| `agent.ts` 的 `streamText` 调用 | 约 15 行 |
| `agent.ts` 的 `translatePart` | 约 40 行：chunk 形状变为 `{ runId, from, type, payload }`；**必须删掉 `case "abort"`**（Mastra chunk union 无 `abort` 类型，中止走 `error`） |

纯 agent 迁移约半天，净增代码接近 0。若含 workflow suspend/resume 则约 3~4 人天。

---

## 3. 决策与论证

### 3.1 判据

本项目选型的实际约束，按权重排序：

1. **架构铁律**：所有 SQL / 事务只在 `packages/db/src/repositories/`，`packages/api` 不得运行时导入 drizzle 或 db client
2. **300 行/文件上限**（`scripts/check-file-rules.js` 强制）
3. **全栈 zod**（oRPC contract + db schema 类型）
4. 单进程 Hono，不引第二个服务
5. 生成链路是产品核心，稳定性优先于能力上限

### 3.2 决定性论证：我们的「暂停」不是 suspend

Mastra workflow 的 suspend/resume 解决的是
**「执行到一半停住，之后把 JS 执行状态原样恢复继续跑」**。
因此它必须序列化 `WorkflowRunState`（status / context / activePaths / stepResults /
suspendedPaths / serializedStepGraph）进 `mastra_workflow_snapshot`，
因此 `resume()` 无条件读 storage——实测无 storage 时**连同一个 run 对象都恢复不了**：

```
status1 = suspended                                              ✅
Error: No snapshot found for this workflow run: gen caee7e94-... ❌
```

而我们设想的两阶段生成是这个形状：

```
阶段一  agent run → 产出大纲 → 写入领域表 → HTTP 请求结束
          ↓
        用户编辑大纲（可能数小时、可能换设备、可能换人）
          ↓
阶段二  新请求 → 读领域数据 → 用【用户改过的大纲】重新构造 prompt → 全新 agent run
```

**阶段二不恢复任何执行状态。** 它甚至不应携带阶段一的 message 历史——
带了反而会让模型倾向坚持自己原来的大纲，而非采纳用户的修改。

中间那个「暂停」的载体是一张**必须由我们设计的业务表**：
大纲要能被逐条编辑增删、要能被实时协作（`/ws`）多端同步、要能审计。
这些需求下它必须是结构化领域数据，**不可能**是一个不透明的 snapshot JSON。

**结论：为获得一个我们用不上的能力，付出 146MB / 160 包 / 周级 breaking minor /
一次架构铁律豁免，不划算。**

同一论证同时否决了 AI SDK 自己的 `toolApproval`——我们两边都不需要，
因为我们的暂停不是暂停，是两次独立的运行。
（`toolApproval` 保留给未来真正的破坏性操作，例如「AI 批量修改已有用例」。）

### 3.3 evals 的处理

`@mastra/evals` 是唯一有实质吸引力的部分。但我们前几条评估其实是确定性的：

- 有没有调用 `propose_cases`
- 产出数量是否符合预期
- 有没有与已有用例标题撞车
- 每条是否至少含一个步骤、每步是否有可验证的 expected

这是 vitest 里约 30 行的事，而仓库已有 85 个测试文件 / 750 个测试的基建。

**决定：先自研。** 若自研脚手架超过约 200 行，再考虑将 `@mastra/evals` 收为 devDependency
（它确实可以无 storage 无 server 裸跑）。

---

## 4. 实施方案

底座不变 → 迁移成本为零 → 全部工作量投入真正的问题。

| 阶段 | 内容 | 阻塞 |
|---|---|---|
| **P0** | 修 §1.2 的两个缺陷：`tool-error` 落地为用户可见错误；`acceptProposals` 补 session → project 归属校验 | 无 |
| **P1** | **喂饱上下文**：`ExistingCaseSummary` 增加 `steps` / `preconditions`；同时将 `EXISTING_CASE_LIMIT = 50` 的**条数**限制改为 **token 预算**截断（带正文后条数不再是有效度量） | 无 |
| **P2** | **两阶段大纲**：大纲阶段领域表 + oRPC 两条 procedure + 前端确认编辑 UI。**做成可跳过**（简单需求一把生成） | 待拍板 |
| **P3** | **评估集**：vitest + `MockLanguageModelV4` 脚本化多步；先做确定性检查 | P1 |
| **P4** | **`ai_provider_config` 接线**：让已建成的登记表真正生效 | 待拍板 |

---

## 5. 待拍板问题

1. **两阶段大纲做不做？** 建议做，且做成可跳过。这是质量提升最大的杠杆，也是唯一需要动前端交互的一块。
2. **输入端先做哪个场景？** 建议「**覆盖补全**」——选一个已有模块，agent 读完现有用例后指出覆盖空白并补齐。它天然吃 P1 的成果，且比「从需求文档生成」更易验收（有 ground truth 可比）。
3. **「范例用例」标记要不要？** 让用户在项目里标几条「这就是我们要的写法」，生成时优先喂给模型。成本极低（一个 boolean 字段），收益是把「学习本项目风格」从玄学变成可控。
4. **P4 是否现在做？** 与生成质量无关，纯粹是「已建成的东西目前是死的」。

---

## 附录：核验方法

本文数据均可复现。关键命令：

```bash
# Mastra 依赖与体积
npm view @mastra/core@1.61.0 dependencies --json
npm view @mastra/core version license dist.unpackedSize dist.fileCount

# Mastra 发版节奏
npm view @mastra/core time --json     # 查 1.0.0 时间戳与版本总数

# Mastra EE license 真实起始时间（勿只看文件内的 Effective 日期）
curl -s "https://api.github.com/repos/mastra-ai/mastra/commits?path=ee/LICENSE&per_page=5"

# zod 范围冲突
npm view @mastra/core peerDependencies.zod
npm view @mastra/memory dependencies.zod

# pi 身份与热度
curl -sI https://github.com/badlogic/pi-mono          # 观察 301 目标
curl -s https://api.github.com/repos/earendil-works/pi
npm view @earendil-works/pi-agent-core version

# AI SDK v7 能力（对已安装产物直接 grep，不看文档）
grep -n "ToolLoopAgent\|toolApproval\|repairToolCall" \
  node_modules/.pnpm/ai@7.0.68_zod@4.4.3/node_modules/ai/dist/index.d.ts
grep -n "MockLanguageModel" \
  node_modules/.pnpm/ai@7.0.68_zod@4.4.3/node_modules/ai/dist/test/index.d.ts
```

**复核时的注意事项**：

- Mastra 官方文档与实际代码存在多处不一致（storage 默认后端、「八张表」、scorer 分类、
  `createRun` vs `createRunAsync`），**一律以源码与实测为准**。
- GitHub `open_issues_count` 含 PR，不等于 issue 数。
- License 文件内的 "Effective" 日期是条款生效日，**不是文件创建日**——须查提交历史。

### 尚未验证的项（若日后重启评估需补）

1. `@mastra/pg` 的 `WorkflowsPG` 单 domain 只建 1 张表——该结论实测于 libsql
   （`WorkflowsLibSQL`），PG 版按 `exportSchemas` 结构推断应一致，但未经真实 Postgres 验证。
2. 并发 resume 行为，尤其在 `/ws` 实时协作下两人同时确认大纲的场景。
3. 长时间 suspend 的 snapshot 体积与清理策略（有 `retention` / `prune()` 配置，未查默认值）。
4. Mastra 在本仓库 pnpm workspace + catalog 下的实际 dedupe 结果（scratchpad 用的是干净树）。
