import { defineConfig } from "tsdown";

export default defineConfig({
	clean: true,
	deps: {
		// 部署形态是「把 dist/index.mjs 拷到那台机器上」，所以能打进产物的都打进去：
		// - workspace 内的包（browser-slots / farm-node-protocol / env）不发布，
		//   节点机器上的 node_modules 里根本没有它们，必须内联；
		// - `ws` 与 `zod` 都是纯 JS，一并内联，省掉两次安装。
		//
		// **`dockerode` 打不进来**：它经 ssh2 依赖 cpu-features 的原生 .node 文件
		// （`require("../build/Release/cpufeatures.node")`），打包器解析不了。
		// 于是它是产物唯一的外部运行时依赖——README 的「路线 A」为此要求在产物
		// 旁边装一个 dockerode。
		alwaysBundle: [/@automationstack\/.*/, "ws", "zod"],
	},
	entry: "./src/index.ts",
	format: "esm",
	outDir: "./dist",
});
