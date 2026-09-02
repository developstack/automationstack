import type { LiveSession } from "./session";

/**
 * 会话注册表与配额闸门（plan §5.2 / D6 / D11）。
 *
 * ## 闸门数的是「还有没有源有空位」，不是「会话数够不够」
 *
 * 多源之后（plan §12）「上限」不再是一个数：内建伪节点有 `FARM_MAX_SESSIONS`
 * 个槽位，每台在线节点各有自己的 `maxSlots`。所以这里收一个 `hasFreeSlot` 端口，
 * 由复合源那侧（`nodes/source-registry.ts`）回答**任一源还有空位吗**。
 *
 * 端口而不是直接依赖注册表，是为了让这个文件继续不认识节点、不认识 provider——
 * 它测起来只需要一个返回 true/false 的函数。
 *
 * ## 为什么闸门数的是内存而不是库
 *
 * `farm_sessions` 里的 `running` 只意味着「最后一次写入时它在跑」：farm 被
 * kill -9 之后那些行会一直挂到下次启动对账。拿它当配额，一次崩溃就能把平台
 * 锁死到有人手工清库为止。真相在这张 Map 里——它与容器同生共死，进程没了
 * 两者一起没，不会留下任何虚高的计数。`countActiveSessions()` 那个仓储函数的
 * 注释也是这么写的：它服务的是控制面的容量展示，不是闸门。
 *
 * ## 为什么超限是拒绝而不是排队（D11）
 *
 * selenium 的 new session 超时很短，排队意味着客户端在一个它自己都不知道
 * 有多长的队列里等，然后拿到一个语义不明的超时错误。直接 503 + `Retry-After`
 * 至少是一句客户端读得懂的话，重试逻辑归它自己。
 */

/** 超限时告诉客户端多久后再来。10s ≈ 一条会话收尾 + 一个容器起来的量级。 */
export const RETRY_AFTER_SECONDS = 10;

export type AdmissionDecision =
	| { kind: "accepted" }
	| { kind: "rejected"; message: string; retryAfterSeconds: number };

export interface SessionRegistry {
	/** 配额 + 进闸判定。**取到 `accepted` 之后必须尽快 `register`**，见下。 */
	admit: () => AdmissionDecision;
	/** 停止接受新会话。启动对账未完成、以及优雅关停期间都处于这个状态。 */
	closeIntake: () => void;
	get: (id: string) => LiveSession | undefined;
	list: () => LiveSession[];
	openIntake: () => void;
	register: (session: LiveSession) => void;
	remove: (id: string) => void;
	size: () => number;
}

export interface SessionRegistryOptions {
	/**
	 * 现在还有没有可用槽位。**每次 admit 都现问一次**：节点会中途上线/掉线，
	 * 容量不是一个能在建注册表时就定下来的常数。
	 */
	hasFreeSlot: () => boolean;
}

export function createSessionRegistry(
	options: SessionRegistryOptions
): SessionRegistry {
	const sessions = new Map<string, LiveSession>();
	let accepting = false;

	return {
		/**
		 * ⚠️ `admit()` 与 `register()` 之间有一个窗口，两个并发的 create-session
		 * 可能都拿到 `accepted`，于是短暂地超配一个槽位。
		 *
		 * 这是**刻意接受**的：把它做严要么加一个占位条目（那就得为「占位失败要
		 * 回滚」再写一套清理），要么上锁（Node 单线程里的锁只能是一个 Promise
		 * 队列，把 create-session 串行化，而它最慢的那一步是拉容器）。
		 * 超配的代价是多一个容器，几秒后随收尾自然消失；防它的代价是一条新的
		 * 出错路径。所以调用方的义务是：拿到 accepted 之后**先 register 再去
		 * await 任何东西**，把窗口压到同步代码的长度。
		 */
		admit: () => {
			if (!accepting) {
				return {
					kind: "rejected",
					message: "farm 当前不接受新会话（正在启动对账或正在关停）",
					retryAfterSeconds: RETRY_AFTER_SECONDS,
				};
			}
			if (!options.hasFreeSlot()) {
				return {
					kind: "rejected",
					message: "所有槽位来源都已用满（内建容量与在线节点），请稍后重试",
					retryAfterSeconds: RETRY_AFTER_SECONDS,
				};
			}
			return { kind: "accepted" };
		},
		closeIntake: () => {
			accepting = false;
		},
		get: (id) => sessions.get(id),
		list: () => [...sessions.values()],
		openIntake: () => {
			accepting = true;
		},
		register: (session) => {
			sessions.set(session.id, session);
		},
		remove: (id) => {
			sessions.delete(id);
		},
		size: () => sessions.size,
	};
}
