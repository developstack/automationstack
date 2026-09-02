import type {
	AcquiredSlot,
	SlotProvider,
} from "@automationstack/browser-slots";
import type { NodeBackend } from "@automationstack/farm-node-protocol/capabilities";
import type {
	AcquireParams,
	AcquireResult,
} from "@automationstack/farm-node-protocol/rpc";

import { type AgentLogger, describeError } from "./logger";
import { acquireResultOf } from "./slot-mapping";

/**
 * `containerId → AcquiredSlot` 的句柄表，以及所有对它的操作。
 *
 * 表是必需的而不是冗余：契约里 `release` / `readLogs` 挂在 `AcquiredSlot` 上
 * （「我拉起的，我来放」），只有 `releaseContainer` 走 id。丢了句柄就读不到那条
 * 会话的浏览器日志。
 *
 * 与 `slot-service.ts` 的分工：那边是**协议**（校验入参、校验出参、按 method 分发），
 * 这边是**状态**。切在这里是被 300 行上限逼的，但切口是干净的——这个文件里
 * 一行 zod 都没有，那个文件里一行 `Map` 操作都没有。
 */

const SECOND_MS = 1000;

/** local 后端的占位镜像串。`LocalProvider` 忽略这个字段，它只是为了不传空串。 */
const LOCAL_NO_IMAGE = "(local)";

interface SlotEntry {
	expiryTimer: NodeJS.Timeout;
	slot: AcquiredSlot;
}

export interface SlotTable {
	/** 本节点被登记成的后端（helloAck 那一刻定下的）。只用来判「没镜像行不行」。 */
	backend: NodeBackend;
	logger: AgentLogger;
	maxSlots: number;
	/** 正在 acquire、还没进表的槽位数。并发上限要连它一起算，见 `acquireSlot`。 */
	pendingAcquires: number;
	provider: SlotProvider;
	slots: Map<string, SlotEntry>;
}

export function createSlotTable(input: {
	backend: NodeBackend;
	logger: AgentLogger;
	maxSlots: number;
	provider: SlotProvider;
}): SlotTable {
	return {
		backend: input.backend,
		logger: input.logger,
		maxSlots: input.maxSlots,
		pendingAcquires: 0,
		provider: input.provider,
		slots: new Map(),
	};
}

function takeEntry(table: SlotTable, containerId: string): SlotEntry | null {
	const entry = table.slots.get(containerId);
	if (entry === undefined) {
		return null;
	}
	clearTimeout(entry.expiryTimer);
	table.slots.delete(containerId);
	return entry;
}

async function expireSlot(
	table: SlotTable,
	containerId: string
): Promise<void> {
	const entry = takeEntry(table, containerId);
	if (entry === null) {
		return;
	}
	// 这条路径存在的全部意义是**网络分区自救**（plan §12「两级各自强制」）：
	// farm 的 reaper 要经这条 WS 才够得着这个槽位，连不上时就只剩节点自己的计时。
	table.logger.warn(`槽位 ${containerId} 到期，本地强制释放`);
	await entry.slot.release().catch((error: unknown) => {
		table.logger.warn(`到期释放 ${containerId} 失败`, describeError(error));
	});
}

function scheduleExpiry(
	table: SlotTable,
	containerId: string,
	expiresAtEpochSec: number
): NodeJS.Timeout {
	const delay = Math.max(expiresAtEpochSec * SECOND_MS - Date.now(), 0);
	const timer = setTimeout(() => {
		// biome-ignore lint/complexity/noVoid: 定时器回调不能是 async，失败已在 expireSlot 内部落日志
		void expireSlot(table, containerId);
	}, delay);
	// unref：一个待触发的到期计时不该成为「进程为什么退不掉」的答案。
	timer.unref();
	return timer;
}

/**
 * 进表。端口解不出来时**先把槽位放掉再抛**：那一刻浏览器已经起来了，
 * 直接抛等于在节点上留一个 farm 永远不知道其存在的进程。
 */
function register(
	table: SlotTable,
	slot: AcquiredSlot,
	expiresAtEpochSec: number
): AcquireResult {
	let result: AcquireResult;
	try {
		result = acquireResultOf(slot);
	} catch (error) {
		// biome-ignore lint/complexity/noVoid: 收尾是尽力而为，真正要往上抛的是下面那个 error
		void slot.release().catch(() => undefined);
		throw error;
	}
	table.slots.set(slot.containerId, {
		expiryTimer: scheduleExpiry(table, slot.containerId, expiresAtEpochSec),
		slot,
	});
	return result;
}

/**
 * **并发上限自守**。farm 也会按 maxSlots 调度，节点这一道是「两级强制」的另一半：
 * farm 的账可能因为一次断线/重启而与真相错开，而机器上跑得下几个浏览器
 * 是节点自己最清楚的事。
 *
 * 分母要把**在途的 acquire** 算进去：farm 完全可能把两条 call 一起发下来，
 * 只看 `slots.size` 的话两条都能过闸——`await provider.acquire` 期间表还是空的。
 */
/**
 * 下发的镜像落地。
 *
 * **原样透传**：真相源是 farm 库里的 `farm_browsers.image`，farm 已经在 acquire
 * 参数里下发（`rpc.ts` 的 `image`）。节点这边再按命名约定拼一次就是第二真相源，
 * 两者一旦分叉，症状是这台机器上一句 `No such image`。
 *
 * **null 是合法的**：local 后端的浏览器来自本机探测，farm 那边镜像库里未必有
 * 对应的行，所以它下发 null。`LocalProvider` 按契约忽略这个字段，给它一个占位串
 * 与给它任何别的串没有区别——但 docker 后端收到 null 是真的干不了活，那时必须
 * 当场说人话，而不是把一个空串交给 dockerode，换回一句 `invalid reference format`。
 */
function imageOf(table: SlotTable, params: AcquireParams): string {
	if (params.image !== null) {
		return params.image;
	}
	if (table.backend === "docker") {
		throw new Error(
			`farm 没有为 ${params.sessionId} 下发镜像，但本节点登记为 docker 后端——docker 后端必须有镜像才能起槽位（检查 farm 的浏览器目录里有没有 ${params.browserName} ${params.browserVersion ?? ""} 这一行）`
		);
	}
	return LOCAL_NO_IMAGE;
}

export async function acquireSlot(
	table: SlotTable,
	params: AcquireParams
): Promise<AcquireResult> {
	const active = table.slots.size + table.pendingAcquires;
	if (active >= table.maxSlots) {
		throw new Error(
			`节点槽位已满（${active}/${table.maxSlots}），拒绝 ${params.sessionId}`
		);
	}
	table.pendingAcquires += 1;
	try {
		const slot = await table.provider.acquire({
			// 浏览器**也**原样透传，理由与镜像同构：调度已经按节点上报的能力筛过
			// 一轮，选择结果由 farm 下发（`rpc.ts` 的 `acquireParams`）。节点这边
			// 再猜一次就是第二份规则，分叉的那天没有一侧会报错。
			browserName: params.browserName,
			browserVersion: params.browserVersion,
			expiresAtEpochSec: params.expiresAtEpochSec,
			image: imageOf(table, params),
			mode: params.mode,
			sessionId: params.sessionId,
		});
		return register(table, slot, params.expiresAtEpochSec);
	} finally {
		table.pendingAcquires -= 1;
	}
}

/**
 * 有句柄的释放。**查不到句柄按幂等处理**（回 null 而不是报错）：契约明写
 * `release` 必须幂等，farm 的 reaper 与正常收尾会撞车，重试一次是常态；
 * 在这里报错只会让一条其实已经收干净的会话带着一句吓人的失败原因归档。
 */
export async function releaseSlot(
	table: SlotTable,
	containerId: string
): Promise<null> {
	const entry = takeEntry(table, containerId);
	if (entry === null) {
		table.logger.warn(`release 的槽位 ${containerId} 不在句柄表里，按幂等处理`);
		return null;
	}
	await entry.slot.release();
	return null;
}

/** 没句柄的释放（reaper 的路径）。顺手把可能存在的句柄摘掉，别留一条已死的表项。 */
export async function releaseSlotById(
	table: SlotTable,
	containerId: string
): Promise<null> {
	takeEntry(table, containerId);
	await table.provider.releaseContainer(containerId);
	return null;
}

export function readSlotLogs(
	table: SlotTable,
	containerId: string
): Promise<{ logs: string }> {
	const entry = table.slots.get(containerId);
	if (entry === undefined) {
		// 读日志只能靠句柄（契约里 `readLogs` 挂在 `AcquiredSlot` 上）。查不到就是
		// 查不到，这里不能像 release 那样装作成功——那会让一个空日志产物落库。
		return Promise.reject(
			new Error(`槽位 ${containerId} 不在本节点的句柄表里，读不到它的日志`)
		);
	}
	return entry.slot.readLogs().then((logs) => ({ logs }));
}

/** 断线与关停时清空整张表。**不抛**：调用方在收尾路径上，没有别的招。 */
export async function releaseAllSlots(
	table: SlotTable,
	reason: string
): Promise<void> {
	const entries = [...table.slots.values()];
	table.slots.clear();
	if (entries.length === 0) {
		return;
	}
	table.logger.warn(`释放 ${entries.length} 个活动槽位：${reason}`);
	for (const entry of entries) {
		clearTimeout(entry.expiryTimer);
		// biome-ignore lint/performance/noAwaitInLoops: 收尾期串行释放，理由同 cleanup.ts
		await entry.slot.release().catch((error: unknown) => {
			table.logger.warn(
				`释放 ${entry.slot.containerId} 失败`,
				describeError(error)
			);
		});
	}
}
