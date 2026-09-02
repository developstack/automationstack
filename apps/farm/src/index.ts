import { Server as HttpServer } from "node:http";
import {
	ensureDefaultBrowser,
	findBrowserByNameVersion,
	findDefaultBrowser,
	listBrowsers,
} from "@automationstack/db/repositories/farm-browser-repository";
import {
	listRefreshRequestedNodeIds,
	saveNodeCapabilities,
} from "@automationstack/db/repositories/farm-node-capability-repository";
import {
	findNodeByToken,
	touchNodeLastSeen,
} from "@automationstack/db/repositories/farm-node-repository";
import { insertArtifact } from "@automationstack/db/repositories/farm-session-artifact-repository";
import {
	createSession,
	listKillRequestedSessionIds,
	markOrphanedRunningSessions,
	updateSessionStatus,
} from "@automationstack/db/repositories/farm-session-repository";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { logger } from "hono/logger";

import { createCdpUpgradeHandler } from "./cdp/proxy";
import { farmConfig } from "./config";
import { finalizeSession } from "./finalize";
import {
	probeBuiltinCapabilities,
	registerBuiltinSource,
} from "./nodes/builtin-source";
import { createCompositeProvider } from "./nodes/composite-provider";
import {
	createNodeUpgradeHandler,
	NODE_CONNECT_PATH,
} from "./nodes/node-connect";
import {
	BUILTIN_SOURCE_NAME,
	createSourceRegistry,
} from "./nodes/source-registry";
import { type ReaperDeps, runStartupReconcile, startReaper } from "./reaper";
import { collectRecorderArtifacts, startRecorder } from "./recorder/index";
import { createSessionRegistry } from "./scheduler";
import { createArtifactStorage, registerLocalArtifactRoutes } from "./storage";
import { registerWebDriverRoutes } from "./wd/proxy";

const app = new Hono();

app.use(logger());

/**
 * ⚠️ 注册顺序是有约束的，别按字母序或「觉得顺眼」重排：
 *
 * 1. **WS 升级（`/cdp`）必须排在 cors 之前**。cors 中间件会改写响应头，
 *    与 101 Switching Protocols 的升级响应冲突——`apps/server/src/index.ts`
 *    的 `/ws` 是同一处坑，farm 沿用同一模式。
 * 2. WebDriver 数据面（`/wd/hub/*`）排在 cors 之后即可：它是纯 HTTP，
 *    而且客户端是 selenium driver（不是浏览器），本来也不吃 CORS。
 * 3. `/health` 放最后，是给 compose healthcheck 与 CI 启动测试用的
 *    「进程还活着」探针，不做任何依赖探测（daemon 挂了不该让容器被重启掉，
 *    那只会把正在收尾的会话一起干掉）。
 *
 * 数据面本身（`cdp/proxy.ts`、`wd/proxy.ts`）不在这个文件里实现，
 * 这里只负责按上面的顺序把它们挂进来。
 */

/**
 * 槽位来源注册表 + 复合 provider（plan §12）。
 *
 * `FARM_PROVIDER` 选出来的那个 provider 在 `nodes/builtin-source.ts` 里被
 * **收编成一个伪节点**（名字 `local`，容量 `FARM_MAX_SESSIONS`），和每台连上来的
 * 实机节点平级。从这一行往下，整个进程里只剩一个 `SlotProvider`——`composite`。
 */
const sources = createSourceRegistry();
registerBuiltinSource(sources);
const composite = createCompositeProvider(sources);

const registry = createSessionRegistry({
	// 上限不再是一个数：任一源还有空位就收（`nodes/pick-source.ts` 负责挑哪个）。
	hasFreeSlot: () => sources.hasFreeSlot(),
});

const storage = createArtifactStorage();

/**
 * 依赖包在这里组装一次，两条数据面 + reaper 共用同一份。
 *
 * 仓储函数是**逐个点名**引入的，不是把整个模块传进去：这样每个 port 接口就是一份
 * 显式的「farm 用到了库的哪几个能力」清单，单测里替换它们也不需要 mock 整个
 * `@automationstack/db`（那会把 drizzle 连同连接池一起拖进测试进程）。
 */
const deps: ReaperDeps = {
	artifacts: { insertArtifact },
	browsers: { findBrowserByNameVersion, findDefaultBrowser },
	collectRecorderArtifacts,
	control: {
		ensureDefaultBrowser,
		listKillRequestedSessionIds,
		listRefreshRequestedNodeIds,
		markOrphanedRunningSessions,
		saveNodeCapabilities,
	},
	provider: composite,
	registry,
	sessionRows: { createSession },
	sessions: { updateSessionStatus },
	sources: composite,
	startRecorder,
	storage,
};

// [1] CDP WS 升级（plan §5.4）。处理器在下面 server 建好之后挂到 `upgrade` 事件上——
//     刻意不走 hono 中间件，理由写在 `cdp/proxy.ts` 的文件头。
const handleCdpUpgrade = createCdpUpgradeHandler(deps);

// [1b] 实机节点接入（plan §12）。同一个 `upgrade` 事件上按路径分派，见下面的注册处。
const handleNodeUpgrade = createNodeUpgradeHandler({
	lifecycle: deps,
	nodes: { findNodeByToken, saveNodeCapabilities, touchNodeLastSeen },
	sources,
});

// [2] CORS：farm 的调用方是测试脚本而非浏览器，v1 先不装 cors 中间件。
//     哪天接入指南页要从浏览器直接打 farm（比如在线试连），再补在这个位置——
//     位置本身是这段注释存在的理由。

// [3] WebDriver 数据面（plan §5.3）。
registerWebDriverRoutes(app, deps);

// 本地存储模式下才有的产物读取口（无鉴权，只在开发机上存在，见 `storage.ts`）。
if (storage.mode === "local") {
	registerLocalArtifactRoutes(app);
}

// [4] 探针。`activeSessions` 是内存注册表的大小——它同时也是配额的分母，
//     所以这个数字与「farm 还肯不肯收新会话」是同一份真相。
app.get("/health", (c) =>
	c.json({
		activeSessions: registry.size(),
		// 各源的占用（内建伪节点 + 在线实机节点）。`activeSessions` 仍是会话数，
		// 两者不必相等：一条会话对应一个槽位，但槽位分布在哪个源上要看这张表。
		sources: sources.usage(),
		status: "ok",
	})
);

const server = serve(
	{
		fetch: app.fetch,
		port: farmConfig.server.port,
	},
	(info) => {
		console.log(
			`Farm is running on http://localhost:${info.port}（provider=${farmConfig.provider}）`
		);
	}
);

/**
 * `serve()` 的返回类型是 http / http2 / http2-secure 三种 Server 的联合，
 * 只有第一种有我们要的 `upgrade` 事件语义。这里显式收窄而不是断言：
 * 哪天有人把 farm 切到 http2，这个分支会安静地不挂 WS——那时应该炸，不该静默。
 */
if (server instanceof HttpServer) {
	// 两个升级处理器共用一个事件：各自都会把「不是我的路径」回成显式 4xx，
	// 所以必须先按路径分派，否则节点连接会被 CDP 那个处理器 404 掉。
	server.on("upgrade", (request, socket, head) => {
		const [path] = (request.url ?? "/").split("?");
		if (path === NODE_CONNECT_PATH) {
			handleNodeUpgrade(request, socket, head);
			return;
		}
		handleCdpUpgrade(request, socket, head);
	});
} else {
	throw new Error("farm 需要 HTTP/1.1 服务器来处理 CDP 的 WebSocket 升级");
}

/**
 * 启动对账 → 开闸 → 起巡检。**开闸在对账之后**：
 * `markOrphanedRunningSessions` 按状态无差别扫全表，早开闸一步就会把刚建出来的
 * 新会话一起判成孤儿（那个仓储函数自己的注释也点名了这一点）。
 *
 * 对账失败就不开闸：进程活着但一条会话也收不了，`/health` 仍然回 ok（它是
 * 「进程还在」的探针），而 `GET /wd/hub/status` 会明确回 `ready: false`——
 * 那才是「这台 farm 能不能干活」的判据。
 */
let stopReaper: (() => void) | null = null;

runStartupReconcile(deps)
	.then(async () => {
		// 内建源的能力在开闸之前填好：docker 模式要读库，所以只能等到这里
		// （`builtin-source.ts` 里那段 null 窗口的注释）。
		sources.updateCapabilities(
			BUILTIN_SOURCE_NAME,
			await probeBuiltinCapabilities({ listBrowsers })
		);
		registry.openIntake();
		stopReaper = startReaper(deps);
		console.log("Farm 启动对账完成，开始接受会话");
	})
	.catch((error: unknown) => {
		console.error("Farm 启动对账失败，将不接受任何会话", error);
	});

/** 关停时留给存量会话走完 finalize 的时间。超过就强杀，容器不能留在宿主机上。 */
const SHUTDOWN_GRACE_MS = 10_000;

let shuttingDown = false;

/**
 * 优雅关停（plan §5.6，节奏与 `apps/server/src/jobs/boss.ts` 一致）：
 * 停止接受新会话 → 关监听 → 给存量会话 10s 走 finalize → 强杀余量。
 *
 * 强杀那一步不能省：finalize 卡住的常见原因恰恰是容器已经半死（截图超时、
 * 日志读不出来），而那种容器最需要被删掉。这里直接按 id 删，不走
 * `AcquiredSlot.release()`——那条路径要先等 finalize 让出句柄。
 */
async function shutdown(signal: string): Promise<void> {
	console.log(`收到 ${signal}，正在退出…`);
	registry.closeIntake();
	stopReaper?.();
	server.close();

	const pending = registry.list();
	if (pending.length > 0) {
		console.log(
			`等待 ${pending.length} 条会话收尾（最多 ${SHUTDOWN_GRACE_MS}ms）`
		);
		await Promise.race([
			Promise.all(
				pending.map((session) =>
					finalizeSession({
						deps,
						reason: "farm_shutdown",
						session,
						status: "killed",
					})
				)
			),
			new Promise((resolve) => setTimeout(resolve, SHUTDOWN_GRACE_MS)),
		]);
	}
	for (const session of registry.list()) {
		const containerId = session.slot?.containerId;
		if (containerId !== undefined) {
			// biome-ignore lint/performance/noAwaitInLoops: 关停期串行删容器——并发删只会让本就不健康的 daemon 更慢
			await composite
				.releaseContainer(containerId)
				.catch((error: unknown) =>
					console.error(`关停时强杀容器失败 ${containerId}`, error)
				);
		}
	}
	process.exit(0);
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
	process.on(signal, () => {
		if (shuttingDown) {
			// 第二次信号 = 「别等了」，立刻走人（与 apps/server 同一约定）。
			process.exit(1);
		}
		shuttingDown = true;
		// biome-ignore lint/complexity/noVoid: 信号处理器不能是 async，void 标记这里刻意不返回 Promise
		void shutdown(signal);
	});
}
