/**
 * 模块树的纯函数搬去了 `@automationstack/db/module-tree`。
 *
 * 搬家的理由：`packages/db/src/agent-adapters/` 里的 `CaseCatalog` 适配器要用
 * `buildModuleTree` 拼模块大纲，而 db **不能反向依赖 api**（api 依赖 db，
 * 反过来就成环）。这些函数本来就只是对 db 模块行的纯装配，落在 db 更合适。
 *
 * 这里保留再导出：`apps/web` / `apps/server` 里十余处
 * `from "@automationstack/api/lib/module-tree"` 的 import 路径一处都不用改。
 */
// biome-ignore lint/performance/noBarrelFile: 不是 barrel，是搬走定义后保住的导出面——`buildModuleTree` 那几个纯函数本来就定义在本文件里，搬去 db 只因为 db 侧的 CaseCatalog 适配器要用它而 db 不能反向依赖 api，调用方的导入路径必须保持不变。用 `export *` 而不是具名：这层壳的职责就是「db 那边有什么，这里就有什么」，具名一旦漏同步就会静默少一个导出
export * from "@automationstack/db/module-tree";
