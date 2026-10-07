// biome-ignore lint/performance/noBarrelFile: 不是 barrel，是搬走定义后保住的导出面——`buildModuleTree` 那几个纯函数本来就定义在本文件里，搬去 db 之后调用方的导入路径必须保持不变。用 `export *` 而不是具名：这层壳的职责就是「db 那边有什么，这里就有什么」，具名一旦漏同步就会静默少一个导出
export * from "@automationstack/db/module-tree";
