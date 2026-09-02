import { createBinaryLookup } from "./local-binaries";
import {
	buildPlan,
	type PlanBinaryOptions,
	type SpawnPlan,
} from "./local-plan";
import {
	createLocalRuntime,
	type LocalProcess,
	type LocalRuntime,
} from "./local-runtime";
import {
	containerIdOf,
	createSlotDir,
	listSlotDirNames,
	profileDirOf,
	readSlotMeta,
	removeSlotDir,
	sessionIdOf,
	slotDirOf,
	writeSlotMeta,
} from "./local-slots";
import type {
	AcquiredSlot,
	AcquireSlotInput,
	ManagedContainer,
	SlotProvider,
} from "./types";

/**
 * `SlotProvider` 的本机进程实现：一条会话 = 一个 Chrome 进程组 + 一个一次性
 * profile 目录（plan §5.6 的「槽位来源」那一层，做法与 §12 里 NodeProvider 的
 * 「每会话独立临时 user-data-dir」同构）。
 *
 * 存在的理由很实在：**开发机上不一定有 Docker**。没有它，一台 macOS 上就跑不了
 * 任何一条真会话，双协议代理 / recorder / finalize 这条链路只能靠单测验——而这
 * 几件事的失效恰恰都在真浏览器上才看得见。
 *
 * ## 与 Docker 实现的三处真实差别
 *
 * 1. **端口不能写死**。容器里 9222 是安全的（一个容器一个网络命名空间），
 *    本机上两条并发会话写死同一个端口就是第二条起不来。所以端口按会话挑，
 *    经 `AcquiredSlot.cdpDebugPort` 交给 caps 注入。
 * 2. **回收是杀进程组，不是删容器**。`detached: true` 建组、`kill(-pid)` 带走
 *    整棵树（chromedriver → Chrome → 渲染进程），细节在 `local-runtime.ts`。
 * 3. **孤儿判据是目录不是 label**，约定与对应关系写在 `local-slots.ts` 的文件头。
 *
 * 「命令行怎么拼」搬去了 `local-plan.ts`（本文件顶到仓库 300 行上限）：那一段是
 * 纯函数，也是「farm 点名的浏览器怎么兑现成一个本机二进制」的落点。
 */

/** 二进制相关的那几项在 `PlanBinaryOptions` 里（拼命令行的那一半也要用）。 */
export interface LocalSlotProviderOptions extends PlanBinaryOptions {
	/** `FARM_LOCAL_HEADLESS`。false = 窗口真的弹出来，本地调试的甜头。 */
	headless: boolean;
	/** 进程与端口的系统调用边界，测试注入用。 */
	runtime?: LocalRuntime;
	/** 槽位根目录，通常是 `<FARM_WORK_DIR>/local-slots`。 */
	slotsRoot: string;
}

interface SlotContext {
	cdpPort: number;
	plan: SpawnPlan;
	process: LocalProcess;
	runtime: LocalRuntime;
	sessionId: string;
	slotDir: string;
}

function buildSlot(ctx: SlotContext): AcquiredSlot {
	return {
		browserArgs: ctx.plan.browserArgs,
		cdpDebugPort: ctx.cdpPort,
		cdpHttpEndpoint: `http://127.0.0.1:${ctx.cdpPort}`,
		containerId: containerIdOf(ctx.sessionId),
		readLogs: () => Promise.resolve(ctx.process.readLogs()),
		// 杀进程组 + 删槽位目录，两步都幂等：reaper 与正常收尾会并发调它
		// （契约 `AcquiredSlot.release`）。
		release: async () => {
			await ctx.runtime.killProcessGroup(ctx.process.pid);
			await removeSlotDir(ctx.slotDir);
		},
		wdEndpoint: ctx.plan.wdEndpoint,
	};
}

/**
 * 目录行里的 `image` 在本地模式下是**哨兵值**，这里一律忽略。
 *
 * 不改 `ensureDefaultBrowser` 的种子逻辑、不改表结构：那一列的语义是「Docker
 * 模式下用哪个镜像」，本地模式没有镜像这个概念，但目录仍然要有行
 * （调度要按 browser+version 选一行，`farm_sessions.image` 也要有东西写）。
 * 让它继续存着 `automationstack-browser-chromium:latest` 并在这里忽略，
 * 比为一个开发模式去动共享 schema 划算得多。
 */
async function acquireSlot(
	input: AcquireSlotInput,
	options: LocalSlotProviderOptions,
	runtime: LocalRuntime
): Promise<AcquiredSlot> {
	const slotDir = slotDirOf(options.slotsRoot, input.sessionId);
	const cdpPort = await runtime.pickFreePort();
	const wdPort =
		input.mode === "webdriver" ? await runtime.pickFreePort() : cdpPort;
	const plan: SpawnPlan = buildPlan(input.mode, {
		// 调度选中的浏览器原样带进来：兑现规则在 `local-browser-pick.ts`，
		// 这里不做任何解释（协议 `rpc.ts`：节点不再自行猜测浏览器）。
		browserName: input.browserName,
		browserVersion: input.browserVersion,
		cdpPort,
		headless: options.headless,
		options,
		profileDir: profileDirOf(slotDir),
		wdPort,
	});
	// 先建目录再起进程：目录带着 meta 一起出现，reaper 在这两步之间扫过来时
	// 看到的是一个「有 sessionId、能在内存注册表里找到」的槽位，不会把它当孤儿。
	await createSlotDir(slotDir, {
		expiresAtEpochSec: input.expiresAtEpochSec,
		mode: input.mode,
		pid: null,
	});
	let child: LocalProcess;
	try {
		child = runtime.spawn({ args: plan.args, command: plan.command });
	} catch (error) {
		// 起不来就把目录带走，别在 work dir 里留一堆空壳（Docker 那边删壳容器
		// 是同一个理由：这类失败会连着发生几十次）。
		await removeSlotDir(slotDir);
		throw error;
	}
	await writeSlotMeta(slotDir, {
		expiresAtEpochSec: input.expiresAtEpochSec,
		mode: input.mode,
		pid: child.pid,
	});
	return buildSlot({
		cdpPort,
		plan,
		process: child,
		runtime,
		sessionId: input.sessionId,
		slotDir,
	});
}

/** 扫槽位目录，映射成与容器同构的 `ManagedContainer`。 */
async function listSlots(
	options: LocalSlotProviderOptions
): Promise<ManagedContainer[]> {
	const names = await listSlotDirNames(options.slotsRoot);
	const rows: ManagedContainer[] = [];
	for (const name of names) {
		// biome-ignore lint/performance/noAwaitInLoops: 串行读几个小文件，并发在这里没有意义
		const meta = await readSlotMeta(slotDirOf(options.slotsRoot, name));
		rows.push({
			containerId: containerIdOf(name),
			// meta 读不出来（缺失 / JSON 坏了 / 字段不对）时两项都置 null——
			// 契约要求 reaper 对这种行「照杀不跳过」，容器 label 写坏时同一条纪律。
			expiresAtEpochSec: meta?.expiresAtEpochSec ?? null,
			sessionId: meta === null ? null : name,
		});
	}
	return rows;
}

/**
 * 按 id 回收一个没有句柄的槽位（reaper 的路径）。
 *
 * pid 从 meta 里读；读不到就只删目录——进程已经不在、或者这个目录压根不是我们
 * 建的，两种情况下「删掉这个目录」都是对的，而抛异常只会让 reaper 每 15 秒
 * 在日志里刷一条没人能处理的错误。
 */
async function releaseSlotById(
	containerId: string,
	options: LocalSlotProviderOptions,
	runtime: LocalRuntime
): Promise<void> {
	const slotDir = slotDirOf(options.slotsRoot, sessionIdOf(containerId));
	const meta = await readSlotMeta(slotDir);
	if (typeof meta?.pid === "number") {
		await runtime.killProcessGroup(meta.pid);
	}
	await removeSlotDir(slotDir);
}

export function createLocalSlotProvider(
	options: LocalSlotProviderOptions
): SlotProvider {
	const runtime = options.runtime ?? createLocalRuntime();
	const resolved: LocalSlotProviderOptions = {
		...options,
		lookup: options.lookup ?? createBinaryLookup(),
	};
	return {
		acquire: (input) => acquireSlot(input, resolved, runtime),
		listManagedContainers: () => listSlots(resolved),
		releaseContainer: (containerId) =>
			releaseSlotById(containerId, resolved, runtime),
	};
}
