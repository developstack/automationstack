# 平台契约：工具、字段、错误

MCP server 名 `testcase-platform`，共 10 个工具。调用时一律写全限定名
`testcase-platform:<工具>`。

## 工具

| 工具 | 入参 | 返回 |
|---|---|---|
| `list_projects` | — | 项目数组：`{id, name, description, createdAt, updatedAt}` |
| `create_project` | `name`，可选 `description` | 新项目（含 `id`） |
| `get_module_tree` | `projectId` | 两块内容：缩进大纲文本 + 扁平 JSON `{id, name, parentId, depth, caseCount, activeCaseCount, gap}` |
| `ensure_module_path` | `projectId`、`path`（根到叶的名字数组，1–10 段） | `{moduleId, createdModuleIds[]}` |
| `read_cases` | `projectId`，可选 `moduleId`/`includeDescendants`/`keyword`/`status`/`priority[]`/`tags[]`/`sourceRefPrefix`/`detail`/`page`/`pageSize` | `{detail, items[], page, pageSize, total}` |
| `list_case_tags` | `projectId` | 去重排序后的标签字符串数组 |
| `import_test_cases` | `projectId`、`cases[]`（≤50）、`onDuplicate` | `{created[], skipped[], errors[]}` |
| `search_cases` | `projectId`、`keyword`，可选 `limit` | 摘要行数组（**无正文**） |
| `delete_cases` | `id` | `{id}`；被测试任务引用时返回 `CONFLICT` 拒绝 |
| `move_cases` | `ids`（1–100，同一项目）、`moduleId` | `{moved[], unchanged[], missingIds[], syncedRunIds[]}`；目标模块不在同一项目时什么都不改 |

细节：

- **`get_module_tree` 的计数含子孙**。用例通常挂在叶子上，中间层模块是文件夹；
  `gap` 取 `"empty"`（整棵子树零用例）/ `"no-active"`（有用例但没有 active）/ `null`。
- **`ensure_module_path` 幂等**，按名字匹配，已存在的层不会重建；写用例前用它拿 `moduleId`。
- **`read_cases` 的 `detail`**：`summary`（默认，无正文）返回
  `id/name/moduleId/priority/status/caseType/tags/sourceRef/maintainer/updatedAt`；
  `full` 额外带 `preconditions` 与 `steps`，**每页默认 10 条、最多 20 条**。
  想读一个大模块时：先 summary 摸清有哪些，再对需要的部分翻 full。
- **`search_cases` 只按用例名做不区分大小写的子串匹配**，`%` 与 `_` 按字面处理，
  不返回 `steps` / `preconditions`。它只回答"这条在不在"，不能用来判重、也不能用来学风格。
- **`delete_cases` 是硬删除、不可逆**（没有回收站）。只在用户明确要求删掉某条用例时用，
  `id` 先从 `read_cases` / `search_cases` 拿。**被任何测试任务引用的用例删不掉**
  （返回 `CONFLICT`，错误里带引用数）——这是为了让历史报告可复现，正解是把
  `status` 改成 `deprecated`。
- **`move_cases` 只改模块**：用例排到目标模块的最后，正文、状态和版本历史不变。
  用例放错了模块时用它调整，**不要删除后重新导入**（删除会丢掉版本历史）。
  待评审、待测试和测试中的测试任务里，这些用例的模块也跟着改（`syncedRunIds`）；
  已完成、已提交和已作废的测试任务不变。调用后告诉用户改了哪些测试任务。
- **`sourceRefPrefix` 是前缀匹配**（左锚定）：`gen:PROJ-1234#` 能捞出上一轮为这个需求
  生成的全部用例。`sourceRef` 为 null 的用例永远不会被它匹配到。

## 用例字段

`import_test_cases` 的每条用例：

| 字段 | 类型 / 取值 | 说明 |
|---|---|---|
| `moduleId` | uuid，**必填** | 来自 `ensure_module_path` 或 `get_module_tree` |
| `name` | 非空字符串，**必填** | — |
| `preconditions` | 字符串或 null | 默认 null |
| `steps` | `[{id, step, expected}]` | 默认 `[]`；`id` 在一条用例内唯一且非空 |
| `priority` | `P0`\|`P1`\|`P2`\|`P3` | 默认 `P2`——**新写的用例要显式给** |
| `caseType` | `functional`\|`interface`\|`performance`\|`security`\|`compatibility`\|`other` | 默认 `functional` |
| `status` | `draft`\|`active`\|`deprecated` | 默认 `draft`，生成的用例**保持 draft** |
| `tags` | 字符串数组 | 默认 `[]` |
| `maintainer` | 字符串或 null | 默认 null |
| `sourceRef` | 字符串或 null | 幂等键，项目内唯一（数据库上是 `(projectId, sourceRef)` 的部分唯一索引，只对非 null 生效） |

## sourceRef 约定

生成场景固定写成：

```
gen:<需求标识>#<用例名 slug>
```

- `<需求标识>` 与用户敲定（`PROJ-1234`、`prd/payment-v2.md`），**同一需求每次重跑必须一样**。
- `<用例名 slug>` 由用例名派生：小写、空白与标点换成 `-`；中文可直接保留。
  **不要用序号**——中间插一条会让后面全部错位，重跑就变成整批重复。
- 搬运存量用例走的是另一套（`<来源文件>#<行号/ID>`，见 testcase-migration），两者靠 `gen:` 前缀区分。

## onDuplicate

命中已存在的 `(projectId, sourceRef)` 时：

| 取值 | 行为 | 什么时候用 |
|---|---|---|
| `skip` | 保留已有用例，本条计入 `skipped` | 补漏、重跑、不确定时的默认选择 |
| `overwrite` | 走版本快照管线覆盖内容，可回滚；**只改内容，不会把用例移到别的 `moduleId`** | 需求改了，同一批用例重出一版 |
| `create-anyway` | 再建一条，且 `sourceRef` 被置成 null | 生成场景**不要用**：那条用例从此退出幂等体系，以后每次重跑都再复制一份 |

## 返回与部分失败

`import_test_cases` 的每行独立校验、独立执行，一行坏不影响其余：

```json
{
  "created": [{ "action": "created", "caseId": "…", "version": 1, "name": "…" }],
  "skipped": [{ "name": "…", "sourceRef": "…" }],
  "errors":  [{ "index": 3, "name": "…", "sourceRef": "…", "message": "入参校验失败：steps.0.id: …" }]
}
```

`errors[].index` 是**本批内的下标**（从 0 起），不是草案表行号——分批提交时别拿它去对总表。

## 错误对照

所有失败都被折成 **HTTP 200 + `isError: true` + 一段文本**，FORBIDDEN / NOT_FOUND /
BAD_REQUEST 在这条通道上长得一模一样。**判断依据只有文本本身**，而且每次调用都要看
`isError`——没有异常抛出不等于成功。

| 文本 | 含义 | 怎么办 |
|---|---|---|
| `你不是该项目的成员` | 这枚 token 的主人没有该项目的权限 | **停下来**。让用户去平台把自己加进项目成员。**不要换一个项目继续写** |
| `项目不存在` | projectId 错了，或项目被删了 | 重新 `list_projects` 取 id |
| `模块不存在` / `目标模块不存在或不属于该项目` | moduleId 不属于这个项目 | 重新 `ensure_module_path` |
| `父模块不存在或不属于同一项目` | 路径挂错了父节点 | 用 `get_module_tree` 核对层级 |
| `path 不能为空` | `ensure_module_path` 的 path 传了空数组 | 补上路径 |
| `入参校验失败：<字段>: …` | 某一行用例的字段不合法 | 只修 `index` 指的那一行，其余行已经写进去了，重提整批会走 `onDuplicate` |

## 连不上时

**一个 `testcase-platform:` 工具都看不见**是最常见的形态。鉴权发生在注册工具之前——
token 不通过时服务端返回 401，客户端拿不到工具列表，于是"401"和"服务端没起"表现完全一样。
按顺序排查，不要猜：

1. 确认 MCP server 已配置：Claude Code 里 `/mcp` 看列表，或看项目根的 `.mcp.json`。
2. 确认 `AS_TOKEN` 环境变量已设置且非空（在平台的设置页生成 API Token）。
3. **改了 `AS_TOKEN` 一定要重启客户端**：`.mcp.json` 里的 `${AS_TOKEN}` 是客户端**启动时**
   展开的，进程起来之后再 export 新值不会生效——这一条最容易在"我明明改了"里卡住。
4. 确认服务端地址可达（默认 `https://testcase.logwing.com/mcp`），服务端起没起。

工具能看见但调用报错，走上面的错误对照表，不要回来重装。
