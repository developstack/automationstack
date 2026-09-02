import type {
	ManagedContainer,
	SlotProvider,
} from "@automationstack/browser-slots";
import type {
	NodeBackend,
	NodeCapabilities,
} from "@automationstack/farm-node-protocol/capabilities";

import { type BrowserSummary, summarizeBrowsers } from "./source-capability";

/**
 * 「槽位来源」的内存注册表（plan §12）。
 *
 * ## 统一模型：一切槽位来源都是「源」
 *
 * farm 本机那个 `FARM_PROVIDER` 选出来的 provider 不再是特殊路径，它被收编成一个
 * **伪节点**（名字固定 `local`，容量 `FARM_MAX_SESSIONS`）；每台连上来的实机节点
 * 各是一个源，容量是它库里那行的 `maxSlots`。上层（launch / reaper）只面对
 * 复合 provider，一个源都认不出来——这正是 `SlotProvider` 那层抽象的意义。
 *
 * ## 为什么活动数是一个独立计数，而不是「数一下绑了几个容器」
 *
 * 容器 id 要等 `acquire` 回来才有，而 `acquire` 是这条链路上最慢的一步（拉容器 /
 * 起浏览器，秒级）。如果活动数靠容器绑定来数，那么在这几秒里**所有**并发的
 * acquire 看到的都是同一份「谁最空」，于是会一窝蜂扑向同一个源——一台 8 槽的机器
 * 被灌进 8 条会话，另外三台闲着。所以选源时先 `noteAcquire()` 占位（同步、在
 * await 之前），失败再 `noteRelease()` 退回去。
 *
 * ## 这张表与库的关系
 *
 * 库（`farm_nodes`）记的是「借给谁、能借几个」那本账，**不记实时状态**
 * （schema 文件头写死了这一点）。谁在线、谁占了几个槽，只有这里知道；farm 进程
 * 一死，这些事实跟着一起消失，也就不会留下任何虚高的计数。
 */

/**
 * 内建伪节点的名字。它是一个**保留名**：`as:options.node: "local"` 就是点名
 * 「跑在 farm 本机」。管理后台不该允许把一台实机节点也取这个名字，否则点名
 * 到底指谁就成了一个要看谁先连上来的问题。
 */
export const BUILTIN_SOURCE_NAME = "local";

export type SlotSourceKind = "builtin" | "node";

export interface SlotSource {
	/**
	 * 这个源**按哪种后端兑现槽位**。注意它取的是**登记**的那个后端
	 * （内建源看 `FARM_PROVIDER`，实机节点看 `farm_nodes.backend`），而不是
	 * agent 在 hello 里报上来的 `capabilities.backend`——后者是 agent 自己按
	 * 「docker 优先」挑的，两者可以不一致，而下发 image 与否必须跟着**登记**走，
	 * 否则会给一台按 local 借出去的机器发一个它根本不会用的镜像 tag。
	 */
	readonly backend: NodeBackend;
	/**
	 * 这个源上报的浏览器能力（hello 的 `capabilities`）。
	 *
	 * 调度按它筛选（`source-capability.ts`）：local 后端的源以这份清单为真相，
	 * docker 后端的源以镜像库为真相、这份清单只用来给 `/health` 看。
	 * 它的生命周期与连接一致：连接一断源就被摘掉，能力跟着消失，不会留下一份
	 * 「这台机器上有 Chrome 141」的过期断言。
	 *
	 * 仍然可以是 null：源刚登记、能力还没探出来的那一小段窗口。null 与
	 * 「探出来是空清单」不同——前者是「还不知道」，筛选时按 local 后端一律不满足
	 * 处理（宁可报一句人话，也不要把会话送进一台没有浏览器的机器）。
	 */
	readonly capabilities: NodeCapabilities | null;
	/** 同时最多能租出去几个槽位。内建伪节点是 `FARM_MAX_SESSIONS`，节点是库里的 `maxSlots`。 */
	readonly capacity: number;
	readonly kind: SlotSourceKind;
	/** 调度用的键，也是 `as:options.node` 里写的那个名字。内建伪节点恒为 `local`。 */
	readonly name: string;
	/**
	 * 会话行要落的 `farm_sessions.node_id`。**内建伪节点恒为 null**——
	 * 它不是一台注册过的机器，库里没有对应的行，硬编一个假 id 只会让外键炸掉。
	 */
	readonly nodeId: string | null;
	readonly provider: SlotProvider;
	/**
	 * 现场重探这个源的能力。**内建伪节点为 null**：它没有 agent，能力是 farm
	 * 进程启动时自己探的，进程活着期间不会变。
	 *
	 * 放在源上而不是放在某个 nodeId → 连接的旁表里，是因为「能不能重探」与
	 * 「这个源还在不在线」是同一个事实：源被摘掉，这个闭包跟着消失，reaper 就
	 * 自然拿不到它，也就不必再去判断一次连接死没死。
	 */
	readonly refresh: (() => Promise<NodeCapabilities>) | null;
}

/** 一个源当下的占用情况。`/health` 与 `/wd/hub/status` 的容量汇总就是它的数组。 */
export interface SourceUsage {
	active: number;
	backend: NodeBackend;
	/**
	 * 能力摘要（浏览器名 + 各自的版本），给 `/health` 看，也给筛选失败时那句
	 * 「各源能提供什么」当素材。null = 这个源还没报过能力。
	 */
	browsers: BrowserSummary[] | null;
	capacity: number;
	kind: SlotSourceKind;
	name: string;
}

/**
 * 逐源列举的结果。
 *
 * `error` 非 null = **这一轮问不出来**（节点 RPC 超时、daemon 抽风）。它与
 * 「这个源上一个容器都没有」必须分得开：reaper 的槽位核对是「注册表里有、
 * 外部世界里没有 → 判会话消失」，把一次 RPC 失败当成「外部世界里没有」，
 * 就是一台节点卡一下、它上面所有会话被无辜杀光。
 */
export interface SourceListing {
	containers: ManagedContainer[];
	error: string | null;
	source: SlotSource;
}

export interface SourceRegistry {
	/** 登记一个源。同名的先 `remove()` 掉——调用方负责决定要不要挤掉旧的。 */
	add: (source: SlotSource) => void;
	/** 把一个容器 id 认到某个源名下（acquire 时登记，聚合 listManaged 时补登）。 */
	bindContainer: (containerId: string, name: string) => void;
	findByNodeId: (nodeId: string) => SlotSource | undefined;
	get: (name: string) => SlotSource | undefined;
	/** 准入判据：**任一源还有空位**就收（plan §12 的调度那一段）。 */
	hasFreeSlot: () => boolean;
	list: () => SlotSource[];
	/** 占位。选源时在任何 await 之前同步调用，理由见文件头。 */
	noteAcquire: (name: string) => void;
	/** 退位。acquire 失败或槽位释放时调用；未知源名是空操作。 */
	noteRelease: (name: string) => void;
	/** 摘除一个源，连同它的活动计数与容器绑定一起清零（失联语义）。 */
	remove: (name: string) => SlotSource | undefined;
	sourceOfContainer: (containerId: string) => SlotSource | undefined;
	unbindContainer: (containerId: string) => void;
	/**
	 * 换掉一个源的能力清单（重探回来、或 hello 报的后端与登记的不一致时纠正）。
	 * 只换 `capabilities` 一个字段、其余原样搬过去，是为了不碰活动计数与容器绑定——
	 * 那两张表是按源名存的，重建整个源对象会顺手把它们清成 0，等于一次重探顺带
	 * 把这台机器上跑着的会话全变成「没人认领」。未知源名是空操作（源可能刚掉线）。
	 */
	updateCapabilities: (name: string, capabilities: NodeCapabilities) => void;
	usage: () => SourceUsage[];
}

/** 注册表的三张内存表。抽成一个对象，好让下面几个动作能写在函数外面。 */
interface RegistryState {
	/** 源名 → 当前占位数。 */
	active: Map<string, number>;
	/**
	 * containerId → 源名。**全局唯一性是天然的**，不是我们维持出来的：本地槽位是
	 * `local-<uuid>`（见 browser-slots 的 `local-slots.ts`），Docker 容器 id 是
	 * 64 位十六进制，两个字母表在第一个字符上就分开了，uuid 之间又不会撞。
	 * 因此这张表可以是**全局一张**，而不必按源分表再逐表去找。
	 */
	containerSource: Map<string, string>;
	sources: Map<string, SlotSource>;
}

/** 摘除一个源：连同它的占位计数与容器绑定一起清掉（失联语义）。 */
function removeSource(
	state: RegistryState,
	name: string
): SlotSource | undefined {
	const source = state.sources.get(name);
	state.sources.delete(name);
	state.active.delete(name);
	for (const [containerId, owner] of state.containerSource) {
		if (owner === name) {
			state.containerSource.delete(containerId);
		}
	}
	return source;
}

function usageOf(state: RegistryState): SourceUsage[] {
	return [...state.sources.values()].map((source) => ({
		active: state.active.get(source.name) ?? 0,
		backend: source.backend,
		browsers:
			source.capabilities === null
				? null
				: summarizeBrowsers(source.capabilities),
		capacity: source.capacity,
		kind: source.kind,
		name: source.name,
	}));
}

/** 容器 ↔ 来源那三个方法，单拎出来只是为了让注册表构造函数别超长。 */
function containerBinding(state: RegistryState) {
	return {
		bindContainer: (containerId: string, name: string) => {
			if (state.sources.has(name)) {
				state.containerSource.set(containerId, name);
			}
		},
		sourceOfContainer: (containerId: string): SlotSource | undefined => {
			const name = state.containerSource.get(containerId);
			return name === undefined ? undefined : state.sources.get(name);
		},
		unbindContainer: (containerId: string) => {
			state.containerSource.delete(containerId);
		},
	};
}

export function createSourceRegistry(): SourceRegistry {
	const state: RegistryState = {
		active: new Map(),
		containerSource: new Map(),
		sources: new Map(),
	};

	return {
		...containerBinding(state),
		add: (source) => {
			state.sources.set(source.name, source);
			state.active.set(source.name, 0);
		},
		findByNodeId: (nodeId) =>
			[...state.sources.values()].find((source) => source.nodeId === nodeId),
		get: (name) => state.sources.get(name),
		hasFreeSlot: () =>
			[...state.sources.values()].some(
				(source) => (state.active.get(source.name) ?? 0) < source.capacity
			),
		list: () => [...state.sources.values()],
		noteAcquire: (name) => {
			state.active.set(name, (state.active.get(name) ?? 0) + 1);
		},
		noteRelease: (name) => {
			const current = state.active.get(name);
			if (current !== undefined) {
				state.active.set(name, Math.max(0, current - 1));
			}
		},
		remove: (name) => removeSource(state, name),
		updateCapabilities: (name, capabilities) => {
			const source = state.sources.get(name);
			if (source !== undefined) {
				state.sources.set(name, { ...source, capabilities });
			}
		},
		usage: () => usageOf(state),
	};
}
