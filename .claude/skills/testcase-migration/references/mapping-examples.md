# 迁移映射示例（mapping-examples）

三个端到端示例：源片段 → 字段映射 → MCP 工具调用序列 → 结果。工具入参/返回的权威契约见 SKILL.md「工具契约（与实现对齐）」一节；下文示例中的返回值为节选示意（`created`/`skipped`/`errors` 实际都是**数组**，此处只写条数）。

---

## 示例 1：Excel 平铺表

### 源片段（`登录模块用例.xlsx`，sheet「登录」）

| 行号 | 模块 | 用例名称 | 前置条件 | 步骤 | 预期结果 | 优先级 | 维护人 |
|---|---|---|---|---|---|---|---|
| 2 | 登录/账号密码登录 | 正确账号密码登录成功 | 已注册账号 test01 | 1. 打开登录页\n2. 输入正确账号密码\n3. 点击登录 | 1. 页面正常展示\n2. 无报错提示\n3. 跳转首页并展示昵称 | 高 | 张三 |
| 3 | 登录/账号密码登录 | 密码错误提示 | 已注册账号 test01 | 1. 打开登录页\n2. 输入正确账号+错误密码\n3. 点击登录 | 3. 提示「账号或密码错误」 | 中 | 张三 |

### 映射方案（向用户确认后执行）

- 模块列 `登录/账号密码登录` → 按 `/` 拆分为路径 `["登录", "账号密码登录"]`
- 步骤/预期按编号 `1.`/`2.`/`3.` 对齐拆分；预期缺号的步骤 expected 置空字符串
- 优先级：高→P1、中→P2（本表无「致命/最高」档，「高」即最高档，已与用户确认取 P1）
- sourceRef = `登录模块用例.xlsx#登录!row:<行号>`（多 sheet 时带 sheet 名）

### 工具调用序列

```
1. testcase-platform:list_projects                          → 用户选择复用项目「商城平台」(projectId: pj-uuid)
2. testcase-platform:get_module_tree { projectId }          → 树中尚无「登录」分支
3. testcase-platform:ensure_module_path { projectId, path: ["登录", "账号密码登录"] }
                                          → { moduleId: md-uuid }（缺失层级已创建）
4. testcase-platform:import_test_cases {
     projectId,
     onDuplicate: "skip",
     cases: [
       {
         moduleId: "md-uuid",
         name: "正确账号密码登录成功",
         preconditions: "已注册账号 test01",
         priority: "P1",
         maintainer: "张三",
         sourceRef: "登录模块用例.xlsx#登录!row:2",
         steps: [
           { "id": "<uuid>", "step": "打开登录页", "expected": "页面正常展示" },
           { "id": "<uuid>", "step": "输入正确账号密码", "expected": "无报错提示" },
           { "id": "<uuid>", "step": "点击登录", "expected": "跳转首页并展示昵称" }
         ]
       },
       {
         moduleId: "md-uuid",
         name: "密码错误提示",
         preconditions: "已注册账号 test01",
         priority: "P2",
         maintainer: "张三",
         sourceRef: "登录模块用例.xlsx#登录!row:3",
         steps: [
           { "id": "<uuid>", "step": "打开登录页", "expected": "" },
           { "id": "<uuid>", "step": "输入正确账号+错误密码", "expected": "" },
           { "id": "<uuid>", "step": "点击登录", "expected": "提示「账号或密码错误」" }
         ]
       }
     ]
   }                                       → created 2 条（action: "created", version: 1）、skipped 0、errors 0
5. testcase-platform:search_cases { projectId, keyword: "密码错误" }   → 抽查命中，字段正确
```

### 重跑（幂等验证）

同一文件再次导入、`onDuplicate: "skip"` → created 0、**skipped 2**（每条带 `existingCaseId`）、errors 0。

---

## 示例 2：XMind 层级脑图

### 源结构（`购物车.xmind`）

```
购物车（根）
├── 加购
│   ├── 商品详情页加购
│   │   ├── [P0] 普通商品加购成功
│   │   └── [P2] 库存不足时加购
│   └── 列表页快捷加购
└── 结算
    └── [P1] 勾选多商品合并结算
        ├── 前置：购物车已有3件商品
        ├── 步骤1：全选商品 → 底部合计金额正确
        └── 步骤2：点击结算 → 跳转订单确认页
```

### 启发式映射（向用户确认后执行）

- 叶子前的祖先链 = 模块路径；根节点「购物车」作为一级模块（若用户希望根=项目名则跳过根，确认时给出两种方案）
- 判定「用例节点」：带优先级标记（`[P0]`/优先级图标）、或其子节点形如 前置/步骤/预期 → 该节点是用例，其下子节点解析为 preconditions/steps
- 「列表页快捷加购」无子用例且无用例特征 → 只建模块（空模块也建，保留结构）
- 步骤节点 `步骤N：<step> → <expected>` 按 `→`（或「预期：」子节点）拆 step/expected
- sourceRef = `购物车.xmind#<根到该用例的节点路径>`（如 `购物车.xmind#购物车/加购/商品详情页加购/普通商品加购成功`）；XMind 文件内若可取到稳定节点 id 则优先用 id

### 工具调用序列（要点）

```
1. testcase-platform:list_projects → 复用或 testcase-platform:create_project { name: "商城平台" }
2. testcase-platform:get_module_tree { projectId }
3. testcase-platform:ensure_module_path { projectId, path: ["购物车", "加购", "商品详情页加购"] } → md-1
   testcase-platform:ensure_module_path { projectId, path: ["购物车", "加购", "列表页快捷加购"] } → md-2（仅建模块）
   testcase-platform:ensure_module_path { projectId, path: ["购物车", "结算"] } → md-3
4. testcase-platform:import_test_cases { projectId, onDuplicate: "skip", cases: [
     { moduleId: md-1, name: "普通商品加购成功", priority: "P0",
       sourceRef: "购物车.xmind#购物车/加购/商品详情页加购/普通商品加购成功", steps: [...] },
     { moduleId: md-1, name: "库存不足时加购", priority: "P2", sourceRef: "...", steps: [...] },
     { moduleId: md-3, name: "勾选多商品合并结算", priority: "P1",
       preconditions: "购物车已有3件商品",
       sourceRef: "购物车.xmind#购物车/结算/勾选多商品合并结算",
       steps: [
         { "id": "<uuid>", "step": "全选商品", "expected": "底部合计金额正确" },
         { "id": "<uuid>", "step": "点击结算", "expected": "跳转订单确认页" }
       ] }
   ] } → created 3 条、skipped 0、errors 0
5. testcase-platform:search_cases { projectId, keyword: "结算" } 抽查
```

---

## 示例 3：TestRail CSV 导出

### 源片段（`testrail-export.csv`）

```csv
ID,Title,Section,Priority,Type,Preconditions,Steps,Expected Result
C101,"Verify login with valid credentials","Auth > Login",Critical,Functional,"User test01 exists","1. Open login page
2. Enter valid credentials
3. Click Login","User lands on dashboard"
C102,"API returns 401 for expired token","Auth > Token",High,API,"Token expired","1. Call /api/me with expired token","Response is 401 with error body"
```

### 映射方案（向用户确认后执行）

- `Section` 按 ` > ` 拆模块路径：`["Auth", "Login"]`、`["Auth", "Token"]`
- Priority：源体系同时存在 Critical 与 High → Critical→P0、High→P1（TestRail 数值 priority_id 见 source-formats.md）
- Type：Functional→functional、API→interface
- `Steps` 多行整体拆步骤；`Expected Result` 为整体预期（未按步编号）→ 挂到最后一步的 expected，其余步 expected 为空（方案在确认环节明示）
- sourceRef = `testrail#<ID>`（源自带稳定 ID，优先于行号）

### 工具调用序列（要点）

```
1. testcase-platform:list_projects → 选定 projectId
2. testcase-platform:get_module_tree { projectId }
3. testcase-platform:ensure_module_path { projectId, path: ["Auth", "Login"] } → md-a
   testcase-platform:ensure_module_path { projectId, path: ["Auth", "Token"] } → md-b
4. testcase-platform:import_test_cases { projectId, onDuplicate: "skip", cases: [
     { moduleId: md-a, name: "Verify login with valid credentials",
       priority: "P0", caseType: "functional",
       preconditions: "User test01 exists", sourceRef: "testrail#C101",
       steps: [
         { "id": "<uuid>", "step": "Open login page", "expected": "" },
         { "id": "<uuid>", "step": "Enter valid credentials", "expected": "" },
         { "id": "<uuid>", "step": "Click Login", "expected": "User lands on dashboard" }
       ] },
     { moduleId: md-b, name: "API returns 401 for expired token",
       priority: "P1", caseType: "interface",
       preconditions: "Token expired", sourceRef: "testrail#C102",
       steps: [
         { "id": "<uuid>", "step": "Call /api/me with expired token",
           "expected": "Response is 401 with error body" }
       ] }
   ] } → created 2 条、skipped 0、errors 0
5. testcase-platform:search_cases { projectId, keyword: "401" } 抽查
```

### 部分失败示例

**先分清两类失败（详见 SKILL.md「部分失败处理」）：**

- **整批拒绝只发生在批参数层面**：`projectId` 非 uuid、`onDuplicate` 取值非法、`cases` 为空或 >50 条 → `BAD_REQUEST: Input validation failed`，一条都不入库。
- **单行不满足 schema 只影响该行**：如某行缺 Title（`name` 为空），该行落入 `errors[]`，其余行照常入库，`message` 会指出违规字段。
- 执行阶段的逐条失败同样只影响该行，例如 `moduleId` 不属于该 projectId：

```jsonc
{
  "created": [ /* 41 条 */ ],
  "skipped": [ /* 7 条 */ ],
  "errors":  [ { "index": 12, "name": "…", "sourceRef": "testrail#C214",
                 "message": "moduleId 不存在或不属于该项目" },
               { "index": 30, "name": "", "sourceRef": "testrail#C233",
                 "message": "入参校验失败：name: Too small: expected string to have >=1 characters" } ]
}
```

`index` 是**该批次内的 0 起下标**，不是 CSV 行号——按自己维护的「批次内下标 → 源 ID/行号」映射反查后再报给用户。修复源数据后用同一 sourceRef 规则、`onDuplicate: "skip"` 重跑，已成功的 41 条被 skip，只补导修复的行。
