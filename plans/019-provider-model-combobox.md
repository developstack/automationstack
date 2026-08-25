# 019 — AI 配置的 provider/model 选择改 Combobox（单输入框 + 过滤菜单）

> 基线：`682a4de` + 工作区未提交的 011加固–018 + skeleton 底色，不得回滚。
> 用户需求：一个输入框，输入时筛选菜单项；空输入直接显示全部；防抖；
> 「所有的都改一遍」= provider 与 model 两个选择器（都走 CatalogPicker，一次重写全覆盖）。

## 0. 决策记录

- **D1 用 Base UI Combobox 原语**（1.7.0 已内置，`@base-ui/react/combobox`，
  非 experimental）：Root/Input/Positioner/Popup/List/Item/Empty。原注释
  「packages/ui 没有 combobox、方针是不自己新写」的前提已不成立——现在有
  官方原语，本仓库其他 ui 组件（select/chart）同样是 Base UI 薄封装，同构。
- **D2 数据层复用**：服务端过滤 + `useDebouncedValue`（300ms）全部保留；
  combobox 的 `onInputValueChange` 只是把击键交给 keyword，防抖仍在查询层
  ——UI 与请求节奏解耦是既有设计，不动。
- **D3 空输入显示全部**：服务端空关键词本就全量返回，但默认截 50——
  前端查询显式传 `limit: 200`（=MAX_CATALOG_RESULTS，provider 全量 193、
  单 provider 的 model 均 <200，200 即「全部」）。在 provider-catalog-queries
  加常量 `CATALOG_REQUEST_LIMIT = 200`（注释引 catalog-query 的上限），
  两处 useQuery 的 input 都带上。
- **D4 ui 包新增 `combobox.tsx` 薄封装**（对齐 select.tsx 的 data-slot 惯例），
  不做多选/chips 等用不到的部件，只封 Root/Trigger 外观不需要——直接封
  Input/Positioner/Popup/List/Item/Empty/Value 所需的最小集合。
  弹层外观复用 select 的 popup 视觉约定（rounded-md、阴影、popup-transition）。
- **D5 手工填写模式（ManualField）与目录不可用降级完全不动**；
  HintLine（说明/错误/总数提示）保留在控件下方。
- **D6 选中值显示**：非聚焦输入态显示已选项 label；聚焦/清空后显示
  placeholder，用户输入显示击键文本。以 1.7.0 实际 API 为准实现
  （先读 node_modules typings，方案与 013 同款纪律）。

## 1. 任务

### T1 `packages/ui/src/components/combobox.tsx`（新文件）

薄封装 Base UI Combobox 最小集合，data-slot 命名、cn 合并、popup 样式
对齐 select.tsx 的 SelectContent（rounded-md / shadow / popup-transition /
max-h 滚动）。**写之前必须读安装版的 combobox typings 源码**核实：
- Root 的 value/onValueChange/onInputValueChange 签名（单选泛型）；
- Input 受控/非受控形态与 value 展示（ComboboxValue 还是 input 原生）；
- Positioner 的 anchor 对齐参数。
与记忆不符按源码调整，注释记录（013 先例）。

### T2 `provider-catalog-queries.ts`

加 `CATALOG_REQUEST_LIMIT = 200`，`useProviderOptions`/`useModelOptions`
的 input 补 `limit: CATALOG_REQUEST_LIMIT`。头注释的「防抖」描述不变。

### T3 `catalog-picker.tsx` 重写 SearchableSelect → SearchableCombobox

- 用 T1 封装 + T2 数据：输入框即 combobox Input（placeholder=searchLabel、
  aria-label 同 placeholder、id/aria-describedby 接 HintLine）；
- Popup 内 List 渲染 `props.query.options` 的 Item（label 双语段沿用）；
- 空结果：`Combobox.Empty` 显示 emptyHint（加载中显示「正在加载候选…」）；
- 选中 → `props.onValueChange(value)`；击键 → `props.onKeywordChange`；
- 「共 N 项候选 / 已显示前 M 项」提示仍走 HintLine（hintText 函数沿用）；
- withSelected 兜底逻辑保留（关键词过滤后当前选中项补回首位的逻辑仍需要，
  形态按 combobox 实际调整）。
- ManualField、CatalogPicker 的 manual 分派、接口签名尽量不变
  （catalog-fields.tsx 预期零改动；若 combobox 需要 label 而非仅 value，
  在 picker 内部用 withSelected 的结果解析，不改 props）。

### T4 注释同步

- catalog-picker 头注释重写：从「为什么不是 combobox（因为没有原件）」
  改为「combobox + 服务端过滤 + 防抖在查询层」的新事实；
- ui 包 components.json 无需动（没有 registry 依赖）。

## 2. 非目标

- 不动 ManualField / 目录不可用降级 / form 状态机（use-provider-config-form）。
- 不动 Jira 设置等其他 Select 用法。
- 不做多选、chips、分组。

## 3. 验收

1. `pnpm check-types` / `pnpm test` 全绿；触碰文件 `pnpm eslint` 0 error、
   `pnpm check` 无新增。
2. 代码走查：CatalogPicker 的 props 接口未破坏 catalog-fields 调用；
   两处查询都带 limit: 200；防抖仍走 useDebouncedValue。
3. 3999 热更新产物编译通过（combobox 模块与 picker 模块）。
4. 交互观感登录墙内无法验，标注留人工（重点：空输入弹出全部 193 个
   provider 滚动可查、输入 300ms 后过滤、点击赋值、清空重显全部、
   键盘上下选择回车确认）。

## 4. 风险

- Base UI combobox API 与封装假设有出入 → T1 的强制读源码纪律兜底；
  若个别能力（如 input 受控展示选中 label）与预期差异大，允许小幅偏离
  D6 的展示策略，回报里说明。
- 200 条渲染性能：193 个 DOM item 一次性渲染，Base UI popup 内滚动；
  如实测卡顿再补虚拟化（非本次范围）。
