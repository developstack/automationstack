import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * 单一根级 vitest 配置 + `projects`。
 *
 * 为什么不走「每包一个 config + turbo 聚合」：
 * - 被测的都是纯函数，跨包只有两个包，turbo 任务层只会多一层缓存语义与
 *   per-package 的 vitest 安装，收益为负；
 * - `apps/web/vite.config.ts` 挂着 tanstackStart / nitro / tailwind 插件，
 *   测试进程完全不需要（还会拖慢并引入 SSR 转换）。这里用 inline project
 *   配置，vitest 不会去读那份 vite.config.ts，只保留测试真正需要的
 *   `@/` 别名；workspace 包（`@automationstack/*`）靠 pnpm 软链 + package.json
 *   exports 指向 `src/**.ts` 直接解析，无需额外插件。
 */
const resolveFromRoot = (relative: string): string =>
	fileURLToPath(new URL(relative, import.meta.url));

export default defineConfig({
	test: {
		projects: [
			{
				resolve: {
					alias: {
						"@": resolveFromRoot("./apps/web/src"),
					},
				},
				test: {
					// 纯函数，不需要 DOM：保持 node 环境，别为「以后可能要」引入 jsdom。
					environment: "node",
					include: ["src/**/*.test.ts"],
					name: "web",
					root: resolveFromRoot("./apps/web"),
				},
			},
			{
				// models.dev 的解析与缓存层：纯函数 + 一个被 stub 掉的 fetch，
				// 不连库也不连网，所以不需要任何环境变量。
				test: {
					environment: "node",
					include: ["src/**/*.test.ts"],
					name: "ai",
					root: resolveFromRoot("./packages/ai"),
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
				// 只跑 repositories 里的纯函数（如快照 no-op 判定）。它们不 import
				// `../index`（那才是真正连库的地方），所以这里不需要 DATABASE_URL。
				test: {
					environment: "node",
					include: ["src/**/*.test.ts"],
					name: "db",
					root: resolveFromRoot("./packages/db"),
				},
			},
		],
	},
});
