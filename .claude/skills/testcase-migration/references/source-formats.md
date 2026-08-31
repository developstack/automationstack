# 源文件列名同义词表（source-formats）

解析源文件（Excel/CSV/TestRail 导出等）时，用本表把中英文列名映射到平台字段。匹配时忽略大小写、空格与全半角差异；同一字段命中多列时向用户确认。

## 列名 → 平台字段

| 平台字段 | 常见中文列名 | 常见英文列名 |
|---|---|---|
| `name` | 用例名称、用例标题、标题、名称、用例名、测试点、检查点、案例名称 | Title、Name、Case Name、Test Case、Summary、Test Point |
| `preconditions` | 前置条件、前提条件、预置条件、前提、准备条件 | Precondition、Preconditions、Prerequisite、Setup |
| `steps`（step 部分） | 步骤、操作步骤、测试步骤、执行步骤、步骤描述 | Steps、Test Steps、Step Description、Procedure、Action |
| `steps`（expected 部分） | 预期、预期结果、期望结果、预期输出、验证点 | Expected、Expected Result(s)、Expected Outcome、Verification |
| `priority` | 优先级、用例等级、等级、级别、重要性 | Priority、Severity、Importance、Level |
| `caseType` | 用例类型、类型、测试类型、测试分类 | Type、Case Type、Test Type、Category |
| `status` | 状态、用例状态、评审状态 | Status、State、Review Status |
| `moduleId`（经模块路径） | 模块、所属模块、功能模块、子模块、一级模块/二级模块…、目录、分组 | Module、Section、Suite、Component、Feature、Folder、Group |
| `tags` | 标签、标记、关键词 | Tags、Labels、Keywords |
| `maintainer` | 维护人、负责人、作者、创建人、编写人、owner | Maintainer、Owner、Author、Created By、Assignee |
| `sourceRef`（若源自带 id） | 用例编号、编号、用例ID、序号 | ID、Case ID、Test Case ID、External ID |

注意：
- 源自带的「编号/ID」列优先用于构造 `sourceRef`（加上来源前缀保证项目内唯一，如 `testrail#C1234`）；没有时退回 `<文件名>#row:<行号>`。
- 「序号」若只是表内行号而非稳定业务编号，不要单独作为 sourceRef，仍用 `文件名#row:行号` 形式。
- 模块列可能是单列路径（`订单/支付/退款` 或 `订单>支付`），也可能拆成「一级模块/二级模块/三级模块」多列——都要拼成路径数组交给 `testcase-platform:ensure_module_path`。

## 优先级取值 → 平台枚举

| 平台值 | 常见源值 |
|---|---|
| `P0` | P0、0、冒烟、Blocker、Critical、最高、致命 |
| `P1` | P1、1、高、High、Major、重要、Urgent |
| `P2` | P2、2、中、Medium、Normal、一般（**默认值**，无法识别时用它） |
| `P3` | P3、3、低、Low、Minor、Trivial、次要、提示 |

TestRail 数值型 priority_id（1=Low…4=Critical）：4→P0、3→P1、2→P2、1→P3。
「高/High/Critical」类源值落 P0 还是 P1 取决于源体系是否有更高一档：若源中同时存在 Critical 与 High，则 Critical→P0、High→P1；若「高」已是最高档，映射方案默认 P1，并在字段映射确认环节向用户明示、允许改为 P0。

## 用例类型取值 → 平台枚举

| 平台值 | 常见源值 |
|---|---|
| `functional` | 功能、功能测试、Functional、Feature（**默认值**） |
| `interface` | 接口、接口测试、API、Interface |
| `performance` | 性能、压测、Performance、Load、Stress |
| `security` | 安全、Security、渗透 |
| `compatibility` | 兼容、兼容性、Compatibility、跨浏览器、多端 |
| `other` | 其他、Other，以及无法归类的值（归 other 前向用户确认） |

## 状态取值 → 平台枚举

| 平台值 | 常见源值 |
|---|---|
| `draft` | 草稿、待评审、Draft、New、Untested（**默认值**，迁移建议统一用它） |
| `active` | 已评审、生效、正常、Active、Approved、Current |
| `deprecated` | 废弃、作废、失效、Deprecated、Obsolete、Rejected |
