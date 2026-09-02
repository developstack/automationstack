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
				// 测试用例生成 agent。整个包零 db / 零 env 依赖，存储与模型配置
				// 全部经端口注入，测试用 in-memory 假实现顶上：既不连库也不连网，
				// 也就不需要任何环境变量。
				test: {
					environment: "node",
					include: ["src/**/*.test.ts"],
					name: "agent",
					root: resolveFromRoot("./packages/agent"),
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
				// 浏览器槽位包（原 apps/farm/src/provider/）。只跑本机进程槽位那份用例：
				// 进程与端口经 `LocalRuntime` 注入、可执行文件查找经 `BinaryLookup` 注入，
				// 假掉的就是这两处；文件系统是真的（「槽位目录即 label」这个约定的全部
				// 价值就在于它落在磁盘上）。整包零 env 读取——env 留在宿主进程侧，
				// 所以这里同样不需要任何环境变量；Docker 那半边要连 daemon，没有测试。
				test: {
					environment: "node",
					include: ["src/**/*.test.ts"],
					name: "browser-slots",
					root: resolveFromRoot("./packages/browser-slots"),
				},
			},
			{
				// farm：**只跑不碰 Docker、不碰库的那些文件**——W3C capabilities 的
				// 提取/剥除/注入（纯函数）、会话状态机与配额闸门、以及收尾流程
				// （provider 与仓储全部经端口注入，测试塞假实现——槽位 provider 的
				// 实现本身已搬去 `packages/browser-slots`，用例跟着走了）。
				// recorder 的 HAR/normalize 纯函数也在这个 project 下。
				// `config.ts` 会读 FARM_* 环境变量，但那一层每个变量都有默认值，
				// 所以这里同样不需要任何环境变量；真要连 daemon 的路径没有测试。
				test: {
					environment: "node",
					include: ["src/**/*.test.ts"],
					name: "farm",
					root: resolveFromRoot("./apps/farm"),
				},
			},
			{
				// farm ↔ node-agent 的线协议与流复用（plan §12）。零 db / 零 env，
				// 对 `ws` 只有类型依赖。**但这组用例会起真 WebSocket 与真 TCP**
				// （都绑 127.0.0.1 的随机端口，不出本机）：这个包唯一有意思的失败
				// 模式——背压、断线时序、多流串音——只在真实 socket 行为下才成立，
				// 假一个 send/on 只能验证我们想象中的 ws。因此它跑得比别的 project
				// 慢几十毫秒，也因此不需要任何环境变量。
				test: {
					environment: "node",
					include: ["src/**/*.test.ts"],
					name: "farm-node-protocol",
					root: resolveFromRoot("./packages/farm-node-protocol"),
				},
			},
			{
				// 实机节点守护进程。零 db / 零 env——`src/config.ts` 刻意不 import
				// `@automationstack/env`，用例给的是一份纯值，所以这个 project
				// 不需要任何环境变量。和上面那组一样，行为用例会起真 WebSocket 与
				// 真 TCP（都绑 127.0.0.1 的随机端口）：agent 唯一有意思的失败模式
				// ——握手时序、隧道接反、断线时没释放槽位——只在真实 socket 下才成立。
				test: {
					environment: "node",
					include: ["src/**/*.test.ts"],
					name: "node-agent",
					root: resolveFromRoot("./apps/node-agent"),
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
