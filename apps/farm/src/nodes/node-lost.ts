import { finalizeSession, type SessionLifecycleDeps } from "../finalize";

/**
 * 节点失联之后的收尾（plan §12：WS 一断，那台机器上正在跑的会话立刻判死）。
 *
 * ## 为什么没有宽限期
 *
 * 因为断掉的**就是数据面本身**。这条 WS 不只是心跳通道，客户端的每一个
 * WebDriver 命令、每一帧 CDP 消息都在它上面走（`node-tunnel.ts`）。它一断，
 * 那些会话在物理上已经不可能继续——留着它们只会让客户端对着一个必然超时的
 * 连接干等，同时占着并发槽位。
 *
 * 这与容器后端「容器消失了才判死」是同一条规则的两种形态：判据都是
 * **通往浏览器的那条路还在不在**。
 *
 * ## 重连之后那台机器上的残留由谁收
 *
 * 由 agent 自己。它重连前先自查一遍本机的槽位目录，把没人认领的清掉，再报到
 * （plan §12 的 agent 侧纪律）。farm 这侧因此不需要为「等它回来」保留任何状态——
 * 保留了反而危险：farm 记着的那份槽位表在重连之后必然是过期的。
 */

/** 落进 `status_reason` 的死因。与 reaper 的 `container_vanished` 平级。 */
export const NODE_LOST_REASON = "node_lost";

export interface TerminateNodeSessionsInput {
	deps: SessionLifecycleDeps;
	/** 这个容器 id 是不是跑在刚失联的那台机器上。 */
	ownsContainer: (containerId: string) => boolean;
}

/**
 * 把失联节点上的会话全部送进**与 reaper 超时同一条**收尾流水线，返回收了几条。
 *
 * 只认已经拿到槽位的会话：还卡在 `acquire` 里的那些，它们的 RPC 会随连接断开
 * 一起 reject（mux 的 `handleDisconnect` 保证在途 call 不会静默挂起），
 * 于是走的是 launch 自己的失败清理路径，不该在这里重复收一次。
 */
export async function terminateNodeSessions(
	input: TerminateNodeSessionsInput
): Promise<number> {
	const doomed = input.deps.registry.list().filter((session) => {
		const containerId = session.slot?.containerId;
		return containerId !== undefined && input.ownsContainer(containerId);
	});
	for (const session of doomed) {
		// biome-ignore lint/performance/noAwaitInLoops: 与 reaper 一致，收尾串行做，别把库和存储一次打满
		await finalizeSession({
			deps: input.deps,
			reason: NODE_LOST_REASON,
			session,
			status: "failed",
		});
	}
	return doomed.length;
}
