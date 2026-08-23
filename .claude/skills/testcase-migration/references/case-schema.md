# 平台用例字段规范（case-schema）

> 事实来源：`packages/db/src/schema/test-cases.ts`、`modules.ts`、`projects.ts`。
> 本文描述导入时（`import_test_cases`）每条用例可提供的字段、枚举值与默认值。
> 服务端生成的字段（id、currentVersion、createdAt、updatedAt 等）不需要也不应由导入方提供。

## 用例（test_cases）字段

| 字段 | 类型 | 必填 | 默认值 | 说明 |
|---|---|---|---|---|
| `name` | string | ✅ | — | 用例名称/标题 |
| `moduleId` | uuid | ✅（由 ensure_module_path 获得） | — | 所属模块。导入前必须先通过 `ensure_module_path` 拿到模块 id |
| `projectId` | uuid | ✅（工具调用**顶层**参数，不写在每条用例里） | — | 所属项目。服务端校验 `moduleId` 必须属于该 projectId，否则该条计入 `errors`（`moduleId 不存在或不属于该项目`） |
| `priority` | enum | ❌ | `"P2"` | 见下方枚举 |
| `caseType` | enum | ❌ | `"functional"` | 见下方枚举 |
| `status` | enum | ❌ | `"draft"` | 见下方枚举。迁移导入建议保持默认 `draft`，除非源数据明确标记已评审 |
| `preconditions` | string \| null | ❌ | `null` | 前置条件，纯文本（可多行） |
| `steps` | `CaseStep[]` (jsonb) | ❌ | `[]` | 步骤数组，结构见下 |
| `tags` | `string[]` (jsonb) | ❌ | `[]` | 标签数组 |
| `maintainer` | string \| null | ❌ | `null` | 维护人（自由文本，平台无登录） |
| `sourceRef` | string \| null | 迁移场景**必设** | `null` | 源数据唯一标识，幂等去重键，见下 |
| ~~`sortOrder`~~ | int | — | — | **`import_test_cases` 不接受该字段**（多余字段会被静默忽略）；新用例由服务端追加到模块末尾 |

服务端管理、导入方**不要提供**：`id`、`currentVersion`（默认 1，乐观锁）、`lastModifiedBy`、`createdAt`、`updatedAt`。

> 字段校验是**逐条**进行的：某条用例不满足上表约束（`name` 为空、`moduleId` 缺失或非 uuid、枚举值非法、`steps[].id` 为空等）只会让**该条**落入 `errors[]`（带批次内 `index` 与指明字段的 `message`），同批其余用例照常入库。

## 枚举值（与 pgEnum 逐字一致）

- **priority**（`case_priority`）：`P0` | `P1` | `P2` | `P3` —— 默认 `P2`
- **caseType**（`case_type`）：`functional` | `interface` | `performance` | `security` | `compatibility` | `other` —— 默认 `functional`
- **status**（`case_status`）：`draft` | `active` | `deprecated` —— 默认 `draft`

任何其他写法（如 `p0`、`High`、`功能`）都必须先规范化为上述枚举值，规范化规则见 SKILL.md 与 `source-formats.md`。

## steps 结构（CaseStep）

```json
[
  { "id": "<唯一字符串，如 uuid>", "step": "操作描述", "expected": "预期结果" }
]
```

- `id`：每个步骤的唯一字符串 id（生成 uuid 即可），前端按 id 做版本 diff 配对，**不能省略、不能重复**
- `step`：该步的操作/动作描述
- `expected`：该步的预期结果；源数据只有整体预期时，放在最后一步的 `expected`，或拆分对齐（见 SKILL.md 步骤拆分规则）

## sourceRef 与幂等去重

- 数据库有部分唯一索引：`UNIQUE (projectId, sourceRef) WHERE source_ref IS NOT NULL`
- 即：同一项目内 `sourceRef` 不可重复；`sourceRef` 为 null 的行不受约束（也就**无法去重**）
- `import_test_cases` 依赖它实现 `onDuplicate: skip | overwrite | create-anyway` 策略（三者的准确语义见 SKILL.md）
- ⚠️ `create-anyway` 命中已存在的 sourceRef 时，新建的用例**其 sourceRef 会被服务端置为 `null`**（唯一索引不允许重复），返回项带 `warning`
- ⚠️ 无 sourceRef 的行退化为「目标模块内同名匹配」：`skip`/`overwrite` 下同名即跳过并给出警告，`create-anyway` 下直接重复创建
- **迁移导入必须为每条用例设置稳定、可复现的 sourceRef**，推荐格式：
  - Excel：`<文件名>#row:<行号>`（如 `login-cases.xlsx#row:12`）
  - XMind：`<文件名>#<稳定节点路径或节点 id>`
  - TestRail：`testrail#C<case id>`（如 `testrail#C1234`）
- 同一份源重跑：`skip` 策略下已导入的全部 skipped，天然幂等

## 模块（modules）与项目（projects）

- `projects`：`id`(uuid)、`name`(必填)、`description`(可空)
- `modules`：`id`(uuid)、`projectId`(必填 FK)、`parentId`(可空自引用，null=根节点)、`name`(必填)、`sortOrder`(int, 默认 0)
- 模块树无限层级；迁移时用 `ensure_module_path` 按名称路径（如 `["订单", "支付", "退款"]`）逐级找/建，幂等
- `ensure_module_path` 的 `path` 单次调用**最多 10 段**（更深的层级分多次调用逐段下钻）；同级按 `name` 精确匹配复用，匹配不到才新建并追加到同级末尾
- 返回 `{ moduleId, createdModuleIds }`：`createdModuleIds` 只含本次新建的层级，可直接用于汇总表的「新建模块」一行

## 版本快照（case_versions，仅供了解）

每次用例创建/修改，服务端自动写入全量快照（version 自增）。导入创建的用例同样产生 v1 快照；`onDuplicate: overwrite` 覆盖已有用例时同样走快照管道，产生 v2/v3…（历史不可变），返回项的 `version` 即覆盖后的新版本号。导入方无需任何操作。

经 MCP 通道写入的记录，`savedBy` / `lastModifiedBy` 统一记为 `MCP 迁移`。
