---
name: testcase-migration
description: 将**已经写好的存量测试用例**（Excel/CSV/XMind/TestRail 等导出件）解析、规范化后批量迁移进本平台，并产出可核对的迁移汇总表。触发场景：导入用例、迁移测试用例、批量导入用例、用例入库、把这个 Excel/XMind 导进去、import test cases、migrate test cases、bulk-load test cases。通过 testcase-platform MCP 工具（list_projects/create_project/get_module_tree/ensure_module_path/read_cases/list_case_tags/import_test_cases/search_cases）完成解析、映射确认、建模块、分批导入与抽查。输入是已有用例文件，不是需求——用户给的若是需求文档/PRD/接口定义/用户故事，要新**设计**用例而不是搬运既有用例，改用 testcase-authoring。
---

# 测试用例迁移 Skill

> **事实来源**：本文「工具契约」一节与 `apps/server/src/mcp/tools/` 的实现逐字对齐；实现变更时**必须回改本文档及 references/**。调用工具失败时按「前置条件」第 4 条分诊，**不要凭空模拟导入结果**——编一份汇总表出来，用户要到平台里才发现一条都没进去。

把用户提供的存量用例源文件解析、规范化后，经平台 MCP 工具批量导入，并产出可核对的迁移汇总表。

**这个 skill 只搬运，不设计。**判据看输入的形状：手里是**已经写好的用例**（Excel/CSV/XMind/TestRail 导出件，每行/每个节点就是一条用例）→ 用本 skill；手里是**需求**（PRD、接口文档、用户故事、一段功能描述）→ 那要新设计用例，用 `testcase-authoring` skill。两者共用同一条写入通道（`testcase-platform:import_test_cases`）与同一套字段，区别在前半段：搬运做的是**字段映射**，设计做的是**从需求推导测试点**。源文件里只有用例标题没有步骤、用户又要求顺手补全步骤时，那一半已经是设计：切到 testcase-authoring 走它的两道闸门，不要在映射流程里顺手编步骤。

## 前置条件

1. 平台服务在运行：`apps/server` 监听 `http://localhost:3000`（通常 `pnpm dev`）
2. 仓库根 `.mcp.json` 已指向 `https://testcase.logwing.com/mcp`（本仓库已内置该配置）
3. **环境变量 `AS_TOKEN` 已设置**为一枚平台 API token（`as_` 开头，在平台里生成）。
   `/mcp` 要求 `Authorization: Bearer <token>`，**MCP 的身份与权限就是这枚 token
   所属用户的身份与权限**：导入只能落进该用户所属的项目，`testcase-platform:list_projects` 也只
   列得出这些项目。没带或 token 无效时服务端返回 401，不存在任何默认身份。
4. MCP 工具可用（`testcase-platform:list_projects` 能正常返回）；不可用时先解决连接问题再开始迁移。
   两类失败的区分方式（**注意不是靠 HTTP 状态码**）：
   - **401**：token 缺失或失效。鉴权发生在建 MCP server 之前，所以这时**一个工具
     都不会被注册**，连 `tools/list` 都是空的——表现是「根本没有平台工具可用」。
   - **权限不足**（token 主人不是该项目成员）：**不会**返回 403。服务端把
     FORBIDDEN / NOT_FOUND / BAD_REQUEST 统一包成 `isError: true` 的文本结果，
     HTTP 状态码仍是 200（见 `apps/server/src/mcp/tools/tool-helpers.ts` 的
     `safeToolCall`）。表现是工具能调用，但返回 `Error: <原因>`。
     正解是去找项目 owner 把 token 主人加进项目成员，不要换成别的项目继续导。

## 工具契约（与实现对齐）

十个工具都返回 JSON 文本内容块；调用失败（如项目不存在）返回 `isError: true` 的文本结果，不会中断会话。

| 工具 | 入参 | 返回 |
|---|---|---|
| `testcase-platform:list_projects` | 无 | `[{ id, name, description, createdAt, updatedAt }]` |
| `testcase-platform:create_project` | `name`(必填)、`description`(可选) | 新建项目对象（含 `id`） |
| `testcase-platform:get_module_tree` | `projectId` | **两个文本块**：① 缩进大纲（`- 名称 (id: …, 3 cases / 2 active)`，零用例/无 active 的模块带 `←` 标记）② 扁平 JSON `[{ id, name, parentId, depth, caseCount, activeCaseCount, gap }]`。**计数含子孙模块**（用例一般挂在叶子上，中间层是文件夹）；`gap` 取 `"empty"`/`"no-active"`/`null`。迁移时用它判断目标模块是不是已经有一批同源用例 |
| `testcase-platform:ensure_module_path` | `projectId`、`path`(字符串数组，1–10 段) | `{ moduleId, createdModuleIds }`——`moduleId` 是最深一级模块 id（用作用例的 `moduleId`）；`createdModuleIds` 只含本次真正新建的层级，幂等重跑为 `[]` |
| `testcase-platform:import_test_cases` | `projectId`、`onDuplicate`(**必填**)、`cases`(1–50 条；**逐条校验，非法行不影响整批**) | `{ created[], skipped[], errors[] }`，详见下 |
| `testcase-platform:read_cases` | `projectId`，可选 `moduleId`/`includeDescendants`/`keyword`/`status`/`priority[]`/`tags[]`/`sourceRefPrefix`/`detail`/`page`/`pageSize` | `{ detail, items[], page, pageSize, total }`。`detail: "full"` 才带 `preconditions`/`steps`，**每页默认 10 条、最多 20 条**。迁移时的用途只有一个：**导前**核对目标模块里是不是已经有内容相同、只是 sourceRef 对不上的用例（换过一次 sourceRef 规则就会这样，幂等键失灵，重跑会整批重复入库）|
| `testcase-platform:list_case_tags` | `projectId` | 项目已用标签的去重排序数组。源文件里的标签先跟它对一遍，同义标签（`登录`/`用户登录`/`auth`）并存会稀释平台的标签过滤 |
| `testcase-platform:search_cases` | `projectId`、`keyword`(必填)、`limit`(可选，默认 20，上限 50) | `[{ id, name, moduleId, priority, status, caseType, sourceRef, updatedAt }]`，按 `updatedAt` 倒序；`%`/`_` 按字面量转义 |
| `testcase-platform:delete_cases` | `id` | `{ id }`。硬删除、不可逆；被测试任务引用时返回 `CONFLICT`。**迁移流程不用它**，改错走 `import_test_cases` |
| `testcase-platform:move_cases` | `ids`(1–100，同一项目)、`moduleId` | `{ moved[], unchanged[], missingIds[], syncedRunIds[] }`。导完发现一批用例进错了模块时用它移过去，不要删掉重导；用例排到目标模块最后，正文和版本历史不变。进行中的测试任务里的模块跟着改，已完成的不变 |

### `testcase-platform:import_test_cases` 返回结构

```jsonc
{
  "created": [ { "index": 0, "caseId": "…", "name": "…", "sourceRef": "…",
                 "action": "created" | "overwritten", "version": 1,
                 "warning": "…"?              // 仅 create-anyway 命中重复时出现
               } ],
  "skipped": [ { "index": 1, "name": "…", "sourceRef": "…",
                 "existingCaseId": "…", "reason": "…" } ],
  "errors":  [ { "index": 2, "name": "…", "sourceRef": "…", "message": "…" } ]
}
```

- **`index` 是该批次内 0 起的下标**，不是源文件行号。汇总时必须自己维护「批次内下标 → 源行号/节点路径」的映射
- `errors[]` 同时收纳**字段校验失败**与**执行失败**两类行，按 `index` 升序；`created`/`skipped`/`errors` 三者的 `index` 合起来正好覆盖本批全部下标
- `overwritten` 的 `version` 是覆盖后的新版本号（走版本快照管道，历史保留）

### `onDuplicate` 三种策略的准确语义

去重键是 `(projectId, sourceRef)`（数据库部分唯一索引）。

| 策略 | sourceRef 已存在时 | 效果 |
|---|---|---|
| `skip` | 不动已有用例 | 计入 `skipped`，带 `existingCaseId` |
| `overwrite` | 走版本快照管道更新已有用例 | 计入 `created`，`action: "overwritten"`，`version` 自增。**注意：只覆盖内容字段（name/priority/caseType/status/preconditions/steps/tags/maintainer），不会把用例移动到新的 `moduleId`**——源数据换了模块时需人工处理 |
| `create-anyway` | 新建一条用例，但**其 `sourceRef` 会被置为 `null`**（唯一索引不允许重复） | 计入 `created` 并带 `warning`；该条此后无法再参与幂等去重，重跑会再次重复创建 |

**无 `sourceRef` 的行**：回退为「目标模块内同名匹配」——
- `skip` / `overwrite` 策略下，模块内已有同名用例 → 计入 `skipped`，`reason` 明示「该行无法幂等去重」的警告
- `create-anyway` 策略下照常新建（会产生重复）

这正是 SKILL 要求**每条都必须设 sourceRef** 的原因。

## 工作流

按顺序执行，**第 2 步必须获得用户确认后才能写入任何数据**。

### 1. 解析源文件

- 识别格式：Excel/CSV 平铺表、XMind 层级、TestRail 导出等
- 用 [references/source-formats.md](references/source-formats.md) 的同义词表识别列含义；读取全部数据行，统计总数
- 记录每条记录的源定位（行号/节点路径/源 ID），后续用于 sourceRef 与失败报告

### 2. 汇报字段映射方案，等用户确认

向用户输出并确认：

- 列 → 平台字段的映射表（含忽略了哪些列）
- 枚举规范化方案（优先级/类型/状态的取值映射，见下方规范化规则）
- 模块路径推导方式（模块列拆分规则或 XMind 层级判定）
- sourceRef 生成规则、目标项目（新建还是复用）、onDuplicate 策略建议
  - 首次迁移/重跑补漏 → `skip`（默认推荐）
  - 用户明确要求源数据覆盖平台已有数据 → `overwrite`
  - `create-anyway` 仅在用户明确知晓会产生重复时使用

用户确认后再继续；对有歧义的列（如「高」是否映射 P0）逐条问清。

### 3. 选定项目

- `testcase-platform:list_projects` → 展示已有项目，**优先引导复用**已有项目
- 确无匹配且用户同意时才 `testcase-platform:create_project`

### 4. 获取模块树并推导模块路径

- `testcase-platform:get_module_tree` 查看现状，规划源模块如何挂接（避免与已有模块重名歧义；同名即复用）
- 为每条用例算出模块路径数组（如 `["订单", "支付", "退款"]`）

### 5. 规范化用例

按下方「规范化规则」把每条源记录转成平台字段（字段/枚举定义见 [references/case-schema.md](references/case-schema.md)）。

### 6. 建模块 + 分批导入

- 对每个**去重后的**模块路径调用 `testcase-platform:ensure_module_path`，缓存 `路径 → moduleId`
- `testcase-platform:import_test_cases` 分批提交，**每批 ≤50 条**，带确认过的 `onDuplicate` 策略
- 每批记录返回的 created/skipped/errors（错误不中断，见「部分失败处理」）

### 7. 抽查

- `testcase-platform:search_cases` 抽查 2-3 个关键字（覆盖不同模块/优先级），核对名称、模块、优先级是否对得上。
- **核对步骤正文必须用 `testcase-platform:read_cases(..., detail: "full")`**：`search_cases` 不返回 `steps`/`preconditions`，拿它去验「步骤是否正确入库」是验不了的——步骤拆分（编号配对、预期整体挂尾）是这套流程里最容易错的一环，至少抽 1-2 条读正文确认。

### 8. 输出迁移汇总表

```
迁移汇总：源文件 xxx.xlsx，共 120 条
- 成功创建：110
- 跳过（sourceRef 已存在）：7
- 失败：3
  | 源行号 | 用例名称 | sourceRef | 失败原因 |
  |---|---|---|---|
  | 15 | ... | xxx.xlsx#row:15 | name is required |
新建模块：登录/账号密码登录、订单/退款（共 N 个）
抽查结果：3/3 通过
```

失败行必须能定位回源文件（行号/节点路径）。

## 规范化规则

完整映射示例见 [references/mapping-examples.md](references/mapping-examples.md)。

### 优先级映射（目标枚举：P0/P1/P2/P3，默认 P2）

| 目标 | 源值 |
|---|---|
| P0 | P0、冒烟、Blocker、Critical、最高、致命；「高/High」且为源体系最高档并经用户确认时 |
| P1 | P1、高、High、Major、重要（源体系存在更高档 Critical 时的「高」） |
| P2 | P2、中、Medium、Normal、一般；**无法识别时的默认值** |
| P3 | P3、低、Low、Minor、Trivial、次要 |

原则：源体系同时有 Critical 与 High → Critical→P0、High→P1；「高」已是最高档 → 默认 P1，映射确认时明示并允许用户改为 P0。

### 平铺表格的模块列拆分

- 单列路径：按 `/`、`>`、`-`、`\`、`::` 等分隔符拆成路径数组（分隔符在映射确认时明示）
- 多列（一级模块/二级模块/…）：按列序拼路径，空列截断
- 无模块列：与用户商定统一挂接路径（如按文件名/sheet 名建一级模块）

### XMind 层级 → 模块/用例 的启发式

- 叶子的祖先链 = 模块路径；根节点默认作为一级模块（映射确认时给出「根=项目、跳过根」备选方案）
- 用例节点判定（满足其一）：带优先级标记（`[P0]` 或优先级图标）；子节点形如「前置/步骤/预期」；无子节点且父层已明确是模块层
- 用例节点的子节点解析为 preconditions/steps，不再下钻建模块
- 无用例特征的中间/叶子节点 → 只建模块（保留空模块结构）

### 步骤文本拆分为 steps

目标结构：`steps: [{ "id": "<uuid>", "step": "...", "expected": "..." }]`，**每步 id 必须唯一（生成 uuid）**。

- 步骤列与预期列都有编号（`1.`/`1、`/`Step 1`）：按编号一一配对；预期缺号的步骤 `expected: ""`
- 预期为整体一段（无编号）：挂到最后一步的 expected，其余步为空——在映射确认时明示该策略
- 单元格内多行无编号：每行一个 step
- 无步骤只有预期：生成一步 `{ step: "执行用例", expected: <整体预期> }`（确认时明示）

### sourceRef（必设，幂等重跑安全）

- **每条导入用例必须设置 sourceRef**，同一项目内唯一、对同一源可复现：
  - 源自带稳定 ID → `<来源>#<ID>`（如 `testrail#C1234`）
  - Excel/CSV → `<文件名>#<sheet名>!row:<行号>`（单 sheet 可省 sheet 名）
  - XMind → `<文件名>#<根到用例的节点路径>`（能取到稳定节点 id 则用 id）
- 平台按 `(projectId, sourceRef)` 部分唯一索引去重；不设 sourceRef 的行无法去重，重跑会重复入库

## 部分失败处理

> ⚠️ **两类失败要分清**：
> 1. **批量层面失败（整批拒绝）**——只有**批参数本身**不合法才会整批拒绝：`projectId` 不是 uuid、`onDuplicate` 不在三种取值内、`cases` 不是数组 / 为空 / >50 条。此时返回 `BAD_REQUEST: Input validation failed`，一条都不入库。
> 2. **逐条失败（不中断）**——**单行不满足 schema**（`name` 为空、`moduleId` 不是 uuid 或缺失、`priority` 不在枚举内、`steps[].id` 为空等）与**单行执行失败**（`moduleId` 不存在或不属于该项目、数据库约束冲突）都只影响该行，计入 `errors[]`，其余行照常创建。校验失败的 `message` 形如 `入参校验失败：name: Too small: expected string to have >=1 characters`，能看出是哪个字段不合法。

- 脏数据可以直接提交：非法行会带 `index` 与字段级原因落到 `errors[]`，不必在规范化阶段先剔除（但仍建议尽量规范化，减少返工）
- 单条失败**不中断**整体迁移，收集 `errors` 继续后续批次
- 全部批次完成后统一汇总，失败条目按「批次内 index」反查源行号/节点路径与原因
- 重跑安全：修复源数据后用同一 sourceRef 规则、`onDuplicate: skip` 整文件重跑——已成功的条目被 skip，只补导失败/新增的行
- 若某批整体调用失败（网络/服务不可用），记录批范围，服务恢复后仅重跑该批即可（同样靠 sourceRef 兜底）

## 参考文档

- [references/case-schema.md](references/case-schema.md)——平台用例字段、枚举、默认值、sourceRef 约束（事实来源：`packages/db/src/schema/`）
- [references/mapping-examples.md](references/mapping-examples.md)——Excel/XMind/TestRail 三个完整映射示例
- [references/source-formats.md](references/source-formats.md)——中英列名同义词表与枚举取值映射
