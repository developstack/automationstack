import { EventEmitter } from "node:events";

import type { InvalidateEvent } from "./protocol";

const BUS_EVENT_NAME = "realtime:invalidate";

/**
 * 成员被移出项目。**刻意与失效事件分成两个频道**，而不是往
 * `InvalidateEntity` 里加一个 `member`：那个枚举是 API 与 web 端共享的数据
 * 失效协议，web 侧有一张 entity → query key 的映射表，加一项就得改那张表；
 * 而这件事根本不是「某份数据过期了，去重取」，是「这条连接不该再存在了」，
 * 收件人是 WS 服务端而非任何一个 React Query 缓存。混进同一个频道，
 * 每一个订阅方都得先判一次「这条是不是我该管的」。
 */
const MEMBERSHIP_REVOKED_EVENT_NAME = "realtime:membership-revoked";

/**
 * 订阅者上限：正常只有 WS 服务端一个长期订阅者，
 * 放宽到 32 以容纳测试/多 handler 场景并保留泄漏告警能力。
 */
const MAX_BUS_LISTENERS = 32;

export type RealtimeBusListener = (
	projectId: string,
	event: InvalidateEvent
) => void;

export type MembershipRevokedListener = (
	projectId: string,
	userId: string
) => void;

/**
 * 进程内实时事件总线（plan §5）。
 *
 * API 路由在 mutation 成功后调用 `publish(projectId, event)`，
 * WS 服务端启动时 `subscribe(fn)` 一次并把事件 fan-out 给
 * 对应 projectId 房间内的所有客户端。
 *
 * 扩展性说明：本实现基于 Node EventEmitter，仅在单进程内生效。
 * 若未来多实例部署，保持 publish/subscribe 接口不变，
 * 将内部实现替换为 Redis Pub/Sub（publish → PUBLISH channel:projectId，
 * subscribe → PSUBSCRIBE）即可，调用方无需改动。
 */
export class RealtimeBus extends EventEmitter {
	constructor() {
		super();
		this.setMaxListeners(MAX_BUS_LISTENERS);
	}

	publish(projectId: string, event: InvalidateEvent): void {
		this.emit(BUS_EVENT_NAME, projectId, event);
	}

	/** 返回取消订阅函数。 */
	subscribe(listener: RealtimeBusListener): () => void {
		this.on(BUS_EVENT_NAME, listener);
		return () => {
			this.off(BUS_EVENT_NAME, listener);
		};
	}

	/**
	 * 通告「userId 已不再是 projectId 的成员」。
	 *
	 * 这是 `packages/api` 唯一能够反向影响 `apps/server` 的方向——包依赖是
	 * api ← server 的单向，api 不能 import ws 层去关连接，只能沿着这条既有的
	 * 进程内总线发一声，由 WS 服务端自己去踢人。
	 */
	publishMembershipRevoked(projectId: string, userId: string): void {
		this.emit(MEMBERSHIP_REVOKED_EVENT_NAME, projectId, userId);
	}

	/** 返回取消订阅函数。 */
	subscribeMembershipRevoked(listener: MembershipRevokedListener): () => void {
		this.on(MEMBERSHIP_REVOKED_EVENT_NAME, listener);
		return () => {
			this.off(MEMBERSHIP_REVOKED_EVENT_NAME, listener);
		};
	}
}

/** 进程级单例：API 路由与 WS 服务端共用同一实例。 */
export const realtimeBus = new RealtimeBus();
