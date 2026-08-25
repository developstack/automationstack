# 017 — 修复居中窄列滚动条：五页 main 的滚动容器与内容列分离

> 基线：`682a4de` + 工作区未提交的 011加固–016 改动，不得回滚。
> 用户报告：AI 配置页滚动条出现在特定区域（内容列右缘）而非视口右缘。

## 0. 成因与决策

- **成因**：五页的 main 都是 `mx-auto … max-w-* flex-1 overflow-y-auto` ——
  **居中窄列自身是滚动容器**，滚动条挂在列右缘，宽屏下离视口右缘几百 px。
- **D1 修法**：滚动容器与内容列分离。main 改全宽
  `min-h-0 w-full flex-1 overflow-y-auto`，内层加
  `<div className="mx-auto w-full max-w-* px-4 py-6">` 承载原类名其余部分。
  滚动条回到视口右缘，居中设计、gutter、加载/就绪同壳等既有决策全部不变。
- **D2 五页一起修**（同一 bug 的五个实例；members.tsx 注释本有
  「改一处就得三处一起改」的契约）：`ai-provider.tsx`(max-w-3xl)、
  `api-tokens.tsx`(max-w-4xl)、`members.tsx`(max-w-4xl)、`settings.tsx`
  (max-w-3xl)、`projects/index.tsx`(max-w-5xl)。
- **D3 PageTransition 组件本身不动**（其他页用它不当滚动容器）。
- 各页「加载态与就绪态共用同一份外壳与 main 类名」的既有决策保持：两处
  调用点一起改。

## 1. 任务

对五页做同构修改（以外壳函数为单位，骨架与就绪两个调用点共用同一份壳，
改一处即覆盖两处）：

1. main 常量改为 `"min-h-0 w-full flex-1 overflow-y-auto"`（去掉
   mx-auto / max-w / px-4 / py-6）。
2. PageTransition 的 children 外包一层
   `<div className="mx-auto w-full max-w-<原值> px-4 py-6">{children}</div>`
   （该页原 max-w 照抄）。
3. 每页 main 常量上方的布局注释：保留「居中理由 / w-full 不能省」的既有
   论证，**更新**为两层结构的新事实——滚动条为什么必须贴视口（本 plan 成因）、
   内容列为什么在内层；「三页同理」之类的计数按五页现状改写。
4. 注意各页外壳差异（settings 在项目壳内、projects 列表页有自己的骨架）：
   只动 main 类名与包层，不动壳结构。

## 2. 非目标

- 不动 PageTransition / AppShell / ProjectShell。
- 不动项目内页（执行台 013 已处理；脑图/报告页等有自己的滚动设计）。
- 不改 max-w 数值、不动 px-4 py-6。

## 3. 验收

1. `pnpm check-types` / `pnpm test` 全绿；五文件 `pnpm eslint` 0 error、
   `pnpm check` 无新增。
2. grep：五文件的 main 常量均无 `mx-auto`、无 `max-w`；五处内层 div 均含
   `mx-auto w-full max-w-<原值> px-4 py-6`。
3. dev server（3999 热更新产物）五模块编译通过；页面观感登录墙内无法验，
   如实标注（重点人工验收：宽屏下滚动条贴视口右缘、正文仍居中、
   窄屏行为不变）。

## 4. 风险

- 个别页面 children 不止一个元素 / 有 key 依赖：包层 div 是新父级，
   如遇 React key 警告按常规处理并在回报中说明。
