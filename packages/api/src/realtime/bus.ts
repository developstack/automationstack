import { EventEmitter } from "node:events";

import type { InvalidateEvent } from "./protocol";

const BUS_EVENT_NAME = "realtime:invalidate";

/**
 * 订阅者上限：正常只有 WS 服务端一个长期订阅者，
 * 放宽到 32 以容纳测试/多 handler 场景并保留泄漏告警能力。
 */
const MAX_BUS_LISTENERS = 32;

export type RealtimeBusListener = (
	projectId: string,
	event: InvalidateEvent
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
}

/** 进程级单例：API 路由与 WS 服务端共用同一实例。 */
export const realtimeBus = new RealtimeBus();
