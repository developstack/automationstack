import {
	type AcquiredSlot,
	type AcquireSlotInput,
	type ManagedContainer,
	parseImageBrowser,
	type SlotProvider,
} from "@automationstack/browser-slots";
import type { NodeCapabilities } from "@automationstack/farm-node-protocol/capabilities";

import { pickSource } from "./pick-source";
import type { BrowserRequirement } from "./source-capability";
import type {
	SlotSource,
	SourceListing,
	SourceRegistry,
	SourceUsage,
} from "./source-registry";

/**
 * 复合槽位来源：把「内建伪节点 + 所有在线实机节点」包成**一个** `SlotProvider`
 * （plan §12）。
 *
 * ## 为什么它在 apps/farm 而不在 browser-slots
 *
 * 因为它认识节点注册表。browser-slots 里那两个实现各自是一个自足的后端，
 * 谁都不知道「还有别的源」这回事；而选源是 farm 的调度职责——哪台机器在线、
 * 谁占了几个槽、`as:options.node` 点了谁，全是 farm 的运行时事实。
 *
 * ## 它对上层的承诺
 *
 * launch 与 reaper 只拿到这一个 provider，**看不见源**。会话跑在容器里还是跑在
 * 一台北京的台式机上，对它们没有任何区别——这是整条实机节点方案能不动数据面
 * 就落地的原因。例外是三个额外方法（都不在 `SlotProvider` 里）：
 * `listManagedBySource` 与 `sourceNameOfContainer` 让 reaper 能分辨
 * 「这个源上没有」和「这个源问不出来」，`nodeIdOfContainer` 让会话行能回填
 * `node_id`。
 */

export interface CompositeSlotProvider extends SlotProvider {
	/**
	 * 逐源列举，**保留每个源自己的成败**。
	 *
	 * reaper 必须用这个而不是 `listManagedContainers()`：后者会把失败的源静默略过，
	 * 于是那个源上的会话看起来「容器消失了」，一次 RPC 超时就变成一片会话被判死。
	 */
	listManagedBySource: () => Promise<SourceListing[]>;
	/** 这个槽位跑在哪个节点上（内建伪节点与未知容器都回 null）。 */
	nodeIdOfContainer: (containerId: string) => string | null;
	/**
	 * 现场重探某个节点的能力，并把结果换进注册表。返回 null = 这个节点当下不在线
	 * （注册表里没有它的源），调用方据此**保留库里的重探标记**，等它连回来再说。
	 */
	refreshNodeCapabilities: (nodeId: string) => Promise<NodeCapabilities | null>;
	/** 这个槽位属于哪个源；未知容器回 null（reaper 据此把失败限制在一个源内）。 */
	sourceNameOfContainer: (containerId: string) => string | null;
	/** 各源当下的占用，供 `/health` 与 `/wd/hub/status` 汇总。 */
	usage: () => SourceUsage[];
}

/** 包一层 release：内层放完之后，把注册表里的占位与容器绑定一起收掉。 */
function wrapSlot(
	slot: AcquiredSlot,
	source: SlotSource,
	registry: SourceRegistry
): AcquiredSlot {
	let released = false;
	return {
		...slot,
		release: async () => {
			if (released) {
				return;
			}
			released = true;
			try {
				await slot.release();
			} finally {
				// 放在 finally：底层 release 失败（节点半路掉线）时槽位其实已经没了，
				// 计数却还占着，那台机器会被永久判成「满」。
				registry.noteRelease(source.name);
				registry.unbindContainer(slot.containerId);
			}
		},
	};
}

async function listOneSource(source: SlotSource): Promise<SourceListing> {
	try {
		const containers = await source.provider.listManagedContainers();
		return { containers, error: null, source };
	} catch (error) {
		return {
			containers: [],
			error: error instanceof Error ? error.message : String(error),
			source,
		};
	}
}

/**
 * 容器 id 在这个源上找不到主人时的兜底：**挨个源试一遍**。
 *
 * 之所以敢这么干，是因为 `releaseContainer` 按契约是幂等的，而且各后端对
 * 「不认识的 id」的处理都是无事发生（Docker 是 404 当成功，local 是目录不存在）。
 * 会走到这里的只有一种东西：farm 重启前留下的孤儿容器——它的映射在内存里，
 * 而内存跟着上一个进程一起没了。为它维护一张持久化的映射表，代价远大于
 * 每次多打几个必然极快返回的 RPC。
 */
async function releaseEverywhere(
	sources: SlotSource[],
	containerId: string
): Promise<void> {
	let lastError: unknown = null;
	let succeeded = false;
	for (const source of sources) {
		try {
			// biome-ignore lint/performance/noAwaitInLoops: 挨个源试正是这里的意义，并发发出去只会白白打扰其它节点
			await source.provider.releaseContainer(containerId);
			succeeded = true;
		} catch (error) {
			lastError = error;
		}
	}
	if (!succeeded && lastError !== null) {
		throw lastError;
	}
}

/** 逐源列举 + 补登容器归属。 */
async function listAll(registry: SourceRegistry): Promise<SourceListing[]> {
	const listings = await Promise.all(registry.list().map(listOneSource));
	for (const listing of listings) {
		for (const container of listing.containers) {
			// 补登映射：farm 重启后内存是空的，但外部世界里的容器还在。
			registry.bindContainer(container.containerId, listing.source.name);
		}
	}
	return listings;
}

/**
 * 这次请求要的浏览器。
 *
 * `browserName` 缺省时回落到从镜像 tag 里反解——与 `node-provider.ts` 的兜底
 * 逐字同一条规则。缺省只发生在内建源的老调用路径上（`AcquireSlotInput` 里
 * 这个字段至今是可选的），但筛选不能因为「上游没填」就退化成「谁都行」，
 * 那等于在最需要判据的路径上把闸门关掉。
 */
function requirementOf(input: AcquireSlotInput): BrowserRequirement {
	if (input.browserName !== undefined && input.browserName !== "") {
		return {
			browserName: input.browserName,
			browserVersion: input.browserVersion ?? null,
		};
	}
	return parseImageBrowser(input.image);
}

/**
 * 重探一个节点的能力。
 *
 * 探不出来（RPC 超时 / 半路掉线）**照原样抛**，而不是回 null：null 的语义被
 * 「不在线」占了，混进来就会让调用方把一次超时当成「这台机器没连上来」，
 * 于是那次重探请求被悄悄放弃、库里的标记也一并清掉。
 */
async function refreshOne(
	registry: SourceRegistry,
	nodeId: string
): Promise<NodeCapabilities | null> {
	const source = registry.findByNodeId(nodeId);
	if (source === undefined || source.refresh === null) {
		return null;
	}
	const capabilities = await source.refresh();
	registry.updateCapabilities(source.name, capabilities);
	return capabilities;
}

/** 选源 → 同步占位 → 真取 → 记住容器归属。 */
async function acquireOne(
	registry: SourceRegistry,
	input: AcquireSlotInput
): Promise<AcquiredSlot> {
	const picked = pickSource(
		registry.usage(),
		input.nodeHint,
		requirementOf(input)
	);
	if (!picked.ok) {
		// 这句话会一路原样端到 WebDriver / CDP 客户端面前，见 pick-source.ts。
		throw new Error(picked.message);
	}
	const source = registry.get(picked.name);
	if (source === undefined) {
		throw new Error(`槽位来源「${picked.name}」在选中后即离线，请重试。`);
	}
	// 占位必须在 await 之前（同步），否则并发的 acquire 会一窝蜂扑向同一个源。
	registry.noteAcquire(source.name);
	try {
		const slot = await source.provider.acquire(input);
		registry.bindContainer(slot.containerId, source.name);
		return wrapSlot(slot, source, registry);
	} catch (error) {
		registry.noteRelease(source.name);
		throw error;
	}
}

export function createCompositeProvider(
	registry: SourceRegistry
): CompositeSlotProvider {
	const listManagedBySource = (): Promise<SourceListing[]> => listAll(registry);

	return {
		acquire: (input) => acquireOne(registry, input),
		listManagedBySource,
		/**
		 * 只把**问得出来**的源摊平。这里略过失败的源永远是安全的：这个方法的
		 * 唯一用途是「谁还活着」，少报一个只会让某个容器多活一轮，
		 * 而多报一个会让活着的会话被判死。
		 */
		listManagedContainers: async (): Promise<ManagedContainer[]> => {
			const listings = await listManagedBySource();
			return listings.flatMap((listing) => listing.containers);
		},
		nodeIdOfContainer: (containerId) =>
			registry.sourceOfContainer(containerId)?.nodeId ?? null,
		refreshNodeCapabilities: (nodeId) => refreshOne(registry, nodeId),
		releaseContainer: async (containerId: string): Promise<void> => {
			const owner = registry.sourceOfContainer(containerId);
			if (owner === undefined) {
				await releaseEverywhere(registry.list(), containerId);
				return;
			}
			try {
				await owner.provider.releaseContainer(containerId);
			} finally {
				registry.unbindContainer(containerId);
			}
		},
		sourceNameOfContainer: (containerId) =>
			registry.sourceOfContainer(containerId)?.name ?? null,
		usage: () => registry.usage(),
	};
}
