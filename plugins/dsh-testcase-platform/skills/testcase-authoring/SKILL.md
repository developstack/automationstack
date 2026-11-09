---
name: testcase-authoring
description: 从需求文档、PRD、接口定义、用户故事或代码变更设计测试用例，并写入测试用例平台（草稿态待评审）。流程含：先读平台已有用例正文作为风格与查重锚点、拆解测试点、就需求里没写清的假设向用户确认、按等价类/边界值/判定表/状态迁移/成对组合/错误推测/场景法配方法、逐条按可判定性自检，最后经 testcase-platform MCP 工具批量写入。触发场景：根据需求写用例、生成测试用例、设计测试用例、需求转用例、给这个功能补用例、这个模块覆盖够不够、补几条异常场景、write test cases from requirements、design test cases、generate test cases from a PRD。用户没说「用例」二字、只说「这个需求怎么测」「这块要测哪些点」时同样适用。输入是需求，不是已有用例文件——用户给的若是 Excel/CSV/XMind/TestRail 导出件里已经写好的存量用例，那是搬运不是设计，改用 testcase-migration。
---

# 从需求设计测试用例

把一段需求变成一批**低层用例**（步骤里带真实数据、预期可判定），经用户确认后写进平台。
产出的形状由平台字段定死：`name` / `preconditions` / `steps[{id, step, expected}]` /
`priority` / `caseType` / `status` / `tags` / `sourceRef`。

## 常驻规则（全程有效，不是某一步的注意事项）

这四条在整个任务里一直成立，包括用户中途改需求、要求"再来 20 条"、或者催"直接写就行"的时候。

1. **动笔前先读平台**。没调过 `testcase-platform:read_cases` 就开始写用例，产出必然是
   教科书味的通用用例：跟这个项目已有的几百条对不上、还会把已经存在的用例换个说法重写一遍。
   模型看不见平台里的数据，这是它唯一的入口。
2. **两道闸门，未过闸门不调用任何写入工具**——闸门①（假设确认，第 3 步）、
   闸门②（草案确认，第 5 步）。需求永远不完整，而模型的默认行为是自己把缺口补上并且不说；
   写进平台的用例是要给人执行的，替用户拍板的那部分正是评审时会被推翻的部分。
3. **写入一律 `status: "draft"`**。平台的用例列表按 status 过滤，`draft` 就是"未评审"这一格。
   直接写 `active` 等于把没人看过的 AI 产出混进正式用例库，事后要靠人逐条挑出来。
4. **`onDuplicate` 用 `"skip"`（补漏）或 `"overwrite"`（需求改了重出一版），
   不用 `"create-anyway"`**——它会把 sourceRef 置成 null，那条用例从此退出幂等体系，
   以后每次重跑都再复制一份。

工具名一律写全限定名 `testcase-platform:<工具>`：同一会话里可能挂着别的 MCP server，
裸名会歧义。

## 流程

把下面这份清单复制进你的回复，逐项打勾：

```
- [ ] 0 工具可用（testcase-platform:list_projects 能返回）
- [ ] 1 需求原文 / 目标项目 / 目标模块 / 需求标识 四样齐了
- [ ] 2 读了平台上下文：模块覆盖、范例用例、目标模块现有用例、标签词表
- [ ] 3 输出测试点清单 + 未言明的假设，🚧 闸门① 等用户回答
- [ ] 4 每个测试点配了方法，输出「测试点 × 方法」矩阵
- [ ] 5 写出草案并逐条自检，🚧 闸门② 等用户确认或修改
- [ ] 6 ensure_module_path → import_test_cases（draft / skip / gen: 前缀 sourceRef）
- [ ] 7 汇总 + 交接给用户去平台评审
```

### 0. 确认工具在

调一次 `testcase-platform:list_projects`。**一个平台工具都看不见时按顺序排查，不要猜**
（鉴权发生在注册工具之前，所以 401 的表现就是"没有工具"，与"服务端没起"同形）：
排查步骤见 [references/platform-contract.md](references/platform-contract.md) 的「连不上时」一节。

### 1. 收集输入

- **需求原文**：文件路径 / 粘贴的文本 / Jira 链接。拿不到原文就不要开始——凭需求标题写用例是编。
- **目标项目**：`testcase-platform:list_projects`，读一下项目 `description`（团队常把自己的约定写在那里）。
- **目标模块**：下一步的模块树里挑，或与用户商定新建。
- **需求标识**：sourceRef 的前缀，如 `PROJ-1234` 或 `prd/payment-v2.md`。**这一项要和用户敲定**，
  agent 每次自己编一个，重跑时幂等就没了。

### 2. 读平台上下文

四个调用，按顺序：

1. `testcase-platform:get_module_tree(projectId)` — 每个模块带 `caseCount` / `activeCaseCount` / `gap`。
   决定往哪挂，以及"补用例"是从零开始还是查漏。
2. `testcase-platform:read_cases(projectId, tags:["范例"], detail:"full")` — 取风格样本。
   项目没有这个标签就跳过，别硬造。
3. `testcase-platform:read_cases(projectId, moduleId, detail:"full")` — 目标模块现有用例正文。
   **这是查重的唯一依据**：判断两条中文用例是不是一个意思，只能靠读正文。
4. `testcase-platform:list_case_tags(projectId)` — 标签词表，新用例的标签优先落在里面。

重新生成同一需求时，再加一条 `read_cases(sourceRefPrefix:"gen:<需求标识>#", detail:"full")`：
把上一轮的产物摆给用户看，再决定这次是 `skip` 补漏还是 `overwrite` 重出一版。

### 3. 拆需求 → 测试点 + 假设　🚧 闸门①

输出两份东西：

- **测试点清单**：需求里每一条可验证的规则一行（"用户名 4–20 字符"、"已提交的任务不可修改"）。
- **未言明的假设**：需求没写、但写用例必须定下来的东西——边界含不含端点、错误提示的确切文案、
  超时时长、权限矩阵里没列的角色、并发下的行为。**逐条问用户，不要自己填上默认值继续。**

问完停下等回答。一次别问太多，先问影响用例条数与优先级的那几条。

### 4. 选方法

按下表给每个测试点配 1–2 种方法，输出「测试点 × 方法」矩阵。
详细的产出形状与常见错误在 [references/techniques.md](references/techniques.md)，只读用到的那几节。

| 需求里出现这个信号 | 默认用 | 补充用 |
|---|---|---|
| 输入框、参数、字段、"支持…格式"、"最多/最少" | 等价类划分 | 边界值分析 |
| 数字范围、长度限制、日期区间、配额、分页 | 边界值分析 | 等价类划分 |
| "如果 A 且 B 则…否则…"、多条件组合、权限矩阵、费率规则 | 判定表 | 成对组合（条件 >4 个时） |
| 状态、流程、"提交后不能再改"、订单/工单/审批流 | 状态迁移 | 场景法 |
| 多个独立可选维度（浏览器 × 系统 × 支付方式） | 成对组合 | — |
| 完整业务流程、用户故事、"用户可以…然后…" | 场景法 | 判定表（分支处） |
| 接口文档、错误码表、幂等/重试/超时 | 等价类 + 边界值 | 错误推测 |
| 以上都覆盖完之后 | 错误推测 | — |

不确定时用「等价类划分 + 边界值分析」起步。

### 5. 写草案 + 自检　🚧 闸门②

按 [references/case-quality.md](references/case-quality.md) 写，写完**把该文件末尾那份清单逐条打勾**，
不过的就改，改不动就删。然后输出草案表等用户确认：

| # | 用例名 | 优先级 | 方法 | 与已有用例的关系 |
|---|---|---|---|---|
| 1 | 用户名 21 字符时提示长度超限 | P1 | 边界值 | 新增 |
| 2 | … | P0 | 场景法 | 与《…》重叠，建议放弃 |

「与已有用例的关系」三选一：**新增** / **与《X》重叠（建议放弃）** / **补充《X》的边界**。
这一列是第 2 步读正文的兑现处，不能空着。用户改完再进第 6 步。

### 6. 写入

- `testcase-platform:ensure_module_path(projectId, path)` 拿 `moduleId`（幂等，已存在不会重建）。
- `testcase-platform:import_test_cases`，每批 ≤50 条，`status:"draft"`，`onDuplicate:"skip"`，
  `sourceRef` = `gen:<需求标识>#<用例名 slug>`（slug 由用例名派生，**不要用序号**：
  中间插一条，后面全部错位，重跑就造出一堆重复）。
- 每批读 `created` / `skipped` / `errors` 三段；`errors` 里的 `index` 是**批内下标**，不是草案表行号。

### 7. 汇总 + 交接

汇总"新建 N 条 / 跳过 N 条（已存在）/ 失败 N 条（附原因）"，附上写入的模块与 sourceRef 前缀，
然后明确交接：**这些用例是 `draft`，去平台里逐条评审，确认后把状态改成 `active`。**

## 会咬人的地方

- **`isError: true` 有两种含义**。`你不是该项目的成员` 是"你不该继续"——停下来让用户去找项目 owner 加成员，
  **不要换个项目继续写**（那会把用例写进错误的项目）。`项目不存在` / `模块不存在` / 入参校验失败
  是"改了再来"。对照表在 [references/platform-contract.md](references/platform-contract.md)。
- **HTTP 状态码在这条通道上没有信息量**：FORBIDDEN / NOT_FOUND / BAD_REQUEST 全被折成
  HTTP 200 + `isError: true`，所以**每次调用都要看 `isError` 和文本**，别因为"没报错"就当成功。
- **`search_cases` 不返回 `steps` / `preconditions`**，拿它当上下文来源等于什么都没读。
  读正文只有 `read_cases(detail:"full")` 一条路。
- **`overwrite` 不会移动模块**：它只覆盖内容字段，用例还留在原来的 `moduleId` 下。
- **`read_cases(detail:"full")` 每页最多 20 条**（默认 10）。别为了"一次读完"把 pageSize 开到最大，
  正文很占地方；先 summary 看清有哪些，再对需要的模块拉 full。

## 参考文档

- [references/techniques.md](references/techniques.md)——按"需求里出现什么信号"索引到方法；每种方法的产出形状与常见错误。**第 4 步查表用，只读用到的那几节。**
- [references/case-quality.md](references/case-quality.md)——标题/前置条件/步骤/预期/优先级的判据，以及**第 5 步逐条打勾的自检清单**。
- [references/platform-contract.md](references/platform-contract.md)——九个工具的入参与返回、用例字段与枚举、sourceRef 约定、错误文本对照表、连不上时的排查。**调用工具前不确定参数时读它。**
- [references/worked-example.md](references/worked-example.md)——一段真实需求走完全流程：测试点、假设提问、方法矩阵、草案表、工具调用、汇总。**第一次用这个 skill、或不确定产出该长什么样时读它。**
