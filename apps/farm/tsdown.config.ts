import { defineConfig } from "tsdown";

export default defineConfig({
	clean: true,
	deps: {
		// workspace 内的包不发布、也不进运行镜像的 node_modules 解析路径，
		// 一律打进产物里（与 apps/server 同一份配置）。
		alwaysBundle: [/@automationstack\/.*/],
	},
	entry: "./src/index.ts",
	format: "esm",
	outDir: "./dist",
});
