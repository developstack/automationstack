import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const resolveFromRoot = (relative: string): string =>
	fileURLToPath(new URL(relative, import.meta.url));

const webAlias = { "@": resolveFromRoot("./apps/web/src") };
// web 的模块加载时会校验 VITE_SERVER_URL（packages/env/src/web.ts）。CI 没有 apps/web/.env，
// 所以没有配置时给测试一个地址。Vite 在加载配置时收集 VITE_ 变量，所以要在这里设置，
// 写在项目的 test.env 中只会进入测试进程的 process.env，packages/env 读不到
process.env.VITE_SERVER_URL ??= "http://localhost:3000";

export default defineConfig({
	test: {
		coverage: {
			exclude: ["**/*.test.{ts,tsx}", "**/*.d.ts"],
			include: ["apps/*/src/**/*.{ts,tsx}", "packages/*/src/**/*.{ts,tsx}"],
			provider: "v8",
			reporter: ["text-summary", "json-summary"],
		},
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
				// Cloudflare Worker（#63）。测试用模拟的 R2 bucket 和 Cache，在 node 环境中执行
				test: {
					environment: "node",
					include: ["src/**/*.test.ts"],
					name: "image-worker",
					root: resolveFromRoot("./apps/image-worker"),
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
