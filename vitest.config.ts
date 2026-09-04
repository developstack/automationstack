import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * 单一根级 vitest 配置 + `projects`。
 *
 * 为什么不走「每包一个 config + turbo 聚合」：
 * - 被测的都是纯函数，五个 project 加起来也就这么点，turbo 任务层只会多一层
 *   缓存语义与 per-package 的 vitest 安装，收益为负；
 * - `apps/web/vite.config.ts` 挂着 tanstackStart / nitro / tailwind 插件，
 *   测试进程完全不需要（还会拖慢并引入 SSR 转换）。这里用 inline project
 *   配置，vitest 不会去读那份 vite.config.ts，只保留测试真正需要的
 *   `@/` 别名；workspace 包（`@automationstack/*`）靠 pnpm 软链 + package.json
 *   exports 指向 `src/**.ts` 直接解析，无需额外插件。
 *
 * ⚠️ **删包时必须回来删掉对应的 project。** `root` 指向一个不存在的目录时
 * vitest 不报错，只是那个 project 一条用例都不收——输出里少了一整块，
 * 而退出码仍然是 0。2026-09-03 清掉的 `agent` / `ai` 两块就是这么在 main 上
 * 绿了一段时间的：注释写着四个 project，实际在跑的只有两个。
 * 所以下面这个数是可证的：`pnpm test` 的输出里必须出现 5 个 project 名。
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
				test: {
					environment: "node",
					include: ["src/**/*.test.ts"],
					name: "api",
					root: resolveFromRoot("./packages/api"),
				},
			},
			{
				// server 里所有**不连库**的部分：ingest 的 HTTP 搬运层
				// （四条端点的状态码映射、413 闸门、JSON 解析，测试用 `vi.mock`
				// 把 api 侧的 handler 整个换掉）、MCP 的身份映射、以及实时房间
				// 登记表。共同前提是这条链路上一行 db 都不 import（只 import type
				// 的会在编译期擦除），因此不需要 `DATABASE_URL`。
				// 真去连库、起 WS 的那些文件仍然没有测试。
				test: {
					environment: "node",
					include: ["src/**/*.test.ts"],
					name: "server",
					root: resolveFromRoot("./apps/server"),
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
			{
				// 上报 SDK。零运行时依赖、HTTP 全靠注进去的假 fetch，所以既不连库
				// 也不连网。root 落在 `packages` 而不是具体某个包：SDK 只有
				// `sdk-node` 一个包，但 `sdk-*` 这个 include 让以后再加一个
				// （比如一个只发 CJS 的兼容包）不必再动这份根配置。
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
