import { farmConfig } from "./config";
import { finalizeSession } from "./finalize";
import type { FarmDataPlaneDeps } from "./launch";
import {
	type CapabilityRefreshPort,
	refreshRequestedCapabilities,
} from "./nodes/capability-refresh";
import type { SourceListing } from "./nodes/source-registry";

/**
 * 对账与回收（plan §5.6 / D10）。
 *
 * farm 的真相分布在三个地方：内存注册表、Docker 的容器列表、`farm_sessions` 表。
 * 三者在正常路径上一致，在**每一次异常**上都会分叉：进程被 kill -9、容器被 OOM
 * killer 收走、库连不上、release 调用失败。这个模块的全部职责就是把分叉合回去。
 *
 * ## 一条纪律：容器的生死判据必须能只看标签
 *
 * 每个容器上都写着 `as.farm.session` 与 `as.farm.expires_at`。到期回收**只读这两个
 * 标签**，不查库、不查内存——因为最需要回收的时刻恰恰是「库连不上」或「farm 刚
 * 重启，内存里什么都没有」的时刻。判据依赖谁，谁挂了这套兜底就跟着挂。
 *
 * 内存与库只用来做「这条会话还活着吗」的**双向核对**（下面 §reconcile），
 * 那是锦上添花的部分，缺了不会漏掉容器。
 *
 * ## 多源之后：一台节点问不出来，只跳过那一台
 *
 * 槽位现在可能来自内建 provider，也可能来自任意一台在线实机节点（plan §12）。
 * 一台机器的 RPC 超时**只能**让它自己这一轮的核对被跳过——把它当成
 * 「那边的容器都没了」，就是一次网络抖动杀光那台机器上所有正在跑的会话；
 * 把它当成「整轮都别做了」，则是一台坏机器让整个集群的回收停摆。
 * 这条纪律的落点在 `reapDeadSlots`。
 */

/** 巡检周期。计划里 reaper 是 60s 量级；这里取 15s——到期回收的延迟直接等于它。 */
const SWEEP_INTERVAL_MS = 15_000;

const MS_PER_SECOND = 1000;

/** 种子浏览器的版本号。`latest` 表示「镜像 tag 指向哪个版本就是哪个」。 */
const SEED_BROWSER = "chromium";
const SEED_VERSION = "latest";

/** 启动对账把库里残留的活动会话判成这个死因。 */
const REASON_ORPHANED = "orphaned";

export interface FarmControlPort extends CapabilityRefreshPort {
	ensureDefaultBrowser: (input: {
		browser: string;
		image: string;
		isDefault: boolean;
		version: string;
	}) => Promise<unknown>;
	listKillRequestedSessionIds: () => Promise<string[]>;
	markOrphanedRunningSessions: (reason: string) => Promise<string[]>;
}

export interface ReaperDeps extends FarmDataPlaneDeps {
	control: FarmControlPort;
}

/** 强杀一个没有内存句柄的容器。失败只记日志——下一轮巡检还会再遇到它。 */
async function killContainer(
	deps: ReaperDeps,
	containerId: string,
	why: string
): Promise<void> {
	try {
		await deps.provider.releaseContainer(containerId);
		console.warn(`回收容器 ${containerId}：${why}`);
	} catch (error) {
		console.error(`回收容器失败 ${containerId}`, error);
	}
}

/**
 * 启动对账（§5.6）。**必须在开始接受新会话之前跑完**，三步的顺序不能换：
 *
 * 1. 种子浏览器目录——目录空着的话第一条会话会因为「没有默认浏览器」失败，
 *    而那是一个纯粹的部署问题，不该让用户先遇到一次报错。
 * 2. 把库里所有 starting/running/finishing 判成 `failed / orphaned`——它们是上一个
 *    进程留下的，内存里已经没有对应的会话了。仓储那个函数按状态无差别扫全表，
 *    晚一步就会把刚建出来的新会话一起判死（它自己的注释也点名了这一点）。
 * 3. 放掉所有带我们标签的容器——此刻内存注册表必然是空的，所以「不在注册表里」
 *    等于「全部」。它们的浏览器里没有任何人还在操作，留着只是占内存。
 *
 * 库不可用时前两步会抛。这里**不吞**：目录没种上、孤儿没标记就开门收会话，
 * 会让脏数据一直累积下去，起不来比带病起来好。第三步（纯 Docker）单独兜着，
 * 因为它恰恰是库挂了时最该做的事。
 */
export async function runStartupReconcile(deps: ReaperDeps): Promise<void> {
	await deps.control.ensureDefaultBrowser({
		browser: SEED_BROWSER,
		image: farmConfig.browser.defaultImage,
		isDefault: true,
		version: SEED_VERSION,
	});
	const orphaned =
		await deps.control.markOrphanedRunningSessions(REASON_ORPHANED);
	if (orphaned.length > 0) {
		console.warn(`启动对账：${orphaned.length} 条会话被判为孤儿`);
	}
	await releaseUnknownContainers(deps);
}

/** 放掉所有「不在内存注册表里」的托管容器。启动时它就是「全部」。 */
async function releaseUnknownContainers(deps: ReaperDeps): Promise<void> {
	let containers: Awaited<
		ReturnType<typeof deps.provider.listManagedContainers>
	>;
	try {
		containers = await deps.provider.listManagedContainers();
	} catch (error) {
		console.error("列出托管容器失败，本轮跳过容器对账", error);
		return;
	}
	for (const container of containers) {
		const known =
			container.sessionId !== null &&
			deps.registry.get(container.sessionId) !== undefined;
		if (!known) {
			// biome-ignore lint/performance/noAwaitInLoops: 串行删容器——对账不赶时间，别把 daemon 打满
			await killContainer(
				deps,
				container.containerId,
				`没有对应的活动会话（session=${container.sessionId ?? "未知"}）`
			);
		}
	}
}

/**
 * 到期回收：**只看标签**。
 *
 * 它与内存里的寿命计时器是同一条规则的两份实现，故意重复：计时器覆盖「farm 还
 * 活着」的情况，标签覆盖「farm 重启了 / 库挂了 / 那条会话的计时器不知怎么没响」。
 * 少了它，一次进程重启就能让一批容器永远留在宿主机上。
 */
async function reapExpiredContainers(deps: ReaperDeps): Promise<void> {
	const nowSec = Math.floor(Date.now() / MS_PER_SECOND);
	let containers: Awaited<
		ReturnType<typeof deps.provider.listManagedContainers>
	>;
	try {
		containers = await deps.provider.listManagedContainers();
	} catch (error) {
		console.error("列出托管容器失败，本轮跳过到期回收", error);
		return;
	}
	for (const container of containers) {
		const expired =
			container.expiresAtEpochSec !== null &&
			container.expiresAtEpochSec < nowSec;
		if (expired) {
			// biome-ignore lint/performance/noAwaitInLoops: 同上，回收速度不重要，daemon 的平稳更重要
			await killContainer(
				deps,
				container.containerId,
				`已过 as.farm.expires_at（${container.expiresAtEpochSec}）`
			);
			continue;
		}
		// 容器还没到期，但内存里已经没有这条会话了 → 它是上一次收尾漏放的
		// （release 失败、进程中途死掉）。标签给了 sessionId，据此判定。
		const orphan =
			container.sessionId === null ||
			deps.registry.get(container.sessionId) === undefined;
		if (orphan) {
			await killContainer(
				deps,
				container.containerId,
				`内存里没有对应会话（session=${container.sessionId ?? "未知"}）`
			);
		}
	}
}

/** 控制面按下的 kill：库里打了 `kill_requested_at`，这里把它兑现成一次收尾。 */
async function applyKillRequests(deps: ReaperDeps): Promise<void> {
	let ids: string[];
	try {
		ids = await deps.control.listKillRequestedSessionIds();
	} catch (error) {
		console.error("读取 kill 请求失败，本轮跳过", error);
		return;
	}
	for (const id of ids) {
		const session = deps.registry.get(id);
		if (session === undefined) {
			// 不在这台 farm 的内存里：要么已经收完了，要么它属于另一个实例。
			// 两种情况这里都无事可做——容器那一侧由到期/孤儿回收兜底。
			continue;
		}
		// biome-ignore lint/performance/noAwaitInLoops: 逐条兑现 kill，串行收尾不会互相拖慢
		await finalizeSession({
			deps,
			reason: "killed_by_operator",
			session,
			status: "killed",
		});
	}
}

/**
 * 把逐源列举的结果劈成两堆：**问得出来的源上还活着的容器** 与 **本轮哑火的源**。
 *
 * 分开是为了让下面那个判死循环只剩一条判据。合在一起写的话，「这个容器不在
 * alive 里」会同时意味着两件相反的事——容器真的没了，或者那台机器这一轮没回话。
 */
function splitListings(listings: SourceListing[]): {
	alive: Set<string>;
	shaky: Set<string>;
} {
	const alive = new Set<string>();
	const shaky = new Set<string>();
	for (const listing of listings) {
		if (listing.error === null) {
			for (const container of listing.containers) {
				alive.add(container.containerId);
			}
			continue;
		}
		shaky.add(listing.source.name);
		console.error(
			`源 ${listing.source.name} 本轮列举失败，跳过它的槽位核对：${listing.error}`
		);
	}
	return { alive, shaky };
}

/**
 * 内存 → 容器方向的核对：注册表里有、但容器已经没了的会话。
 *
 * 典型成因是容器被宿主机的 OOM killer 收走。不核对的话这条会话会一直占着并发
 * 槽位，直到寿命上限（默认 30 分钟）才被收掉，而它的客户端早就在报错了。
 */
async function reapDeadSlots(deps: ReaperDeps): Promise<void> {
	let listings: Awaited<ReturnType<typeof deps.sources.listManagedBySource>>;
	try {
		listings = await deps.sources.listManagedBySource();
	} catch (error) {
		console.error("列出托管容器失败，本轮跳过槽位核对", error);
		return;
	}
	const { alive, shaky } = splitListings(listings);
	for (const session of deps.registry.list()) {
		const containerId = session.slot?.containerId;
		if (containerId === undefined || alive.has(containerId)) {
			continue;
		}
		const owner = deps.sources.sourceNameOfContainer(containerId);
		// 主人不明（farm 重启后内存里的映射没了）或主人本轮哑火 → 不判。
		// 这个方向的错误代价是不对称的：漏判只是让一条已死的会话多活一轮（15s），
		// 误判则是把一条正跑着的会话当场杀掉，而它的客户端毫无过错。
		if (owner === null || shaky.has(owner)) {
			continue;
		}
		// biome-ignore lint/performance/noAwaitInLoops: 同上，收尾串行做
		await finalizeSession({
			deps,
			reason: "container_vanished",
			session,
			status: "failed",
		});
	}
}

/** 跑一轮巡检。四步之间互不依赖，任何一步失败都不影响其它三步。 */
export async function sweepOnce(deps: ReaperDeps): Promise<void> {
	await applyKillRequests(deps);
	await reapExpiredContainers(deps);
	await reapDeadSlots(deps);
	// 能力重探排在回收之后：它可能一台机器等 60s，而回收是有时限的活
	// （容器过期了就该马上删）。让慢活排在快活后面，慢活拖的只是它自己。
	await refreshRequestedCapabilities(deps);
}

/**
 * 起巡检定时器，返回停它的函数。
 *
 * `unref()` 的理由与会话计时器一样：优雅关停走完之后，不该有一个 15s 的定时器
 * 把进程按在那里。
 */
export function startReaper(deps: ReaperDeps): () => void {
	const timer = setInterval(() => {
		// biome-ignore lint/complexity/noVoid: 定时器回调不能是 async，失败已在 catch 里吞掉
		void sweepOnce(deps).catch((error) => {
			console.error("reaper 巡检失败", error);
		});
	}, SWEEP_INTERVAL_MS).unref();
	return () => clearInterval(timer);
}
