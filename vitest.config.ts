import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const resolveFromRoot = (relative: string): string =>
	fileURLToPath(new URL(relative, import.meta.url));

const webAlias = { "@": resolveFromRoot("./apps/web/src") };

export default defineConfig({
	test: {
		projects: [
			{
				resolve: { alias: webAlias },
				test: {
					environment: "node",
					include: ["src/**/*.test.ts"],
					name: "web",
					root: resolveFromRoot("./apps/web"),
				},
			},
			{
				// 组件测试（.test.tsx）需要 DOM。vitest 4 没有按文件选环境的配置，所以单独建项目
				resolve: { alias: webAlias },
				test: {
					environment: "jsdom",
					include: ["src/**/*.test.tsx"],
					name: "web-dom",
					root: resolveFromRoot("./apps/web"),
					setupFiles: ["./vitest-setup-dom.ts"],
				},
			},
			{
				test: {
					environment: "node",
					include: ["src/**/*.test.ts"],
					name: "api",
					root: resolveFromRoot("./packages/api"),
				},
			},
			{
				test: {
					environment: "node",
					include: ["src/**/*.test.ts"],
					name: "server",
					root: resolveFromRoot("./apps/server"),
				},
			},
			{
				test: {
					environment: "node",
					include: ["src/**/*.test.ts"],
					name: "db",
					root: resolveFromRoot("./packages/db"),
				},
			},
			{
				test: {
					environment: "node",
					include: ["src/**/*.test.ts"],
					name: "ui",
					root: resolveFromRoot("./packages/ui"),
				},
			},
			{
				test: {
					environment: "node",
					include: ["src/**/*.test.ts"],
					name: "env",
					root: resolveFromRoot("./packages/env"),
				},
			},
			{
				test: {
					environment: "node",
					include: ["sdk-*/src/**/*.test.ts"],
					name: "sdk",
					root: resolveFromRoot("./packages"),
				},
			},
		],
	},
});
