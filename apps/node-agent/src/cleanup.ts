import type { NodeBackend } from "@automationstack/farm-node-protocol/control";

import { type AgentLogger, describeError } from "./logger";
import type { ProviderFactory } from "./provider-factory";

/**
 * 启动清扫：把本机上**所有**上一代 agent 留下的槽位清光，然后才拨号。
 *
 * ## 为什么是无条件的、不做任何「这个还活着吗」的判断
 *
 * 槽位的数据面走的是这条 WS 隧道（plan §12）。上一个 agent 进程一死，隧道
 * 必然跟着死；隧道死了，farm 侧那些会话立刻被判 `node_lost`。所以进程刚起来时
 * 在本机看到的每一个槽位，**按定义**都是没人认领的孤儿——不存在「保留一个
 * 还在服务的槽位」这种情形，也就没有任何需要甄别的东西。
 *
 * 反过来说，一旦这里手软（比如「没过期的先留着」），留下的就是一个永远不会有人
 * 来释放的 Chrome 进程：farm 那边的会话早就结束了，reaper 也只会经 RPC 问
 * `listManaged`——而它问到的正是这些。清扫是这条链路上唯一能收掉它们的地方。
 *
 * ## 为什么两种后端用同一个循环
 *
 * `listManagedContainers()` + `releaseContainer(id)` 这一对在契约里就是
 * 「不靠内存、只靠外部世界的真相源」：docker 认 label，local 认槽位目录
 * （`local-slots.ts` 文件头的对应关系）。两边语义逐字同构，所以这里没有分支。
 */
export interface SweepInput {
	backends: NodeBackend[];
	createProvider: ProviderFactory;
	logger: AgentLogger;
}

async function sweepBackend(
	backend: NodeBackend,
	input: SweepInput
): Promise<number> {
	const provider = input.createProvider(backend);
	const managed = await provider.listManagedContainers();
	let released = 0;
	for (const slot of managed) {
		try {
			// biome-ignore lint/performance/noAwaitInLoops: 串行清扫。并发删只会让一台本就不健康的机器更慢，而这一步没人在等
			await provider.releaseContainer(slot.containerId);
			released += 1;
		} catch (error) {
			// 单个清不掉不该拦住启动：剩下的那个由平台侧的对账继续追，
			// 而这台机器现在就该接客。
			input.logger.warn(
				`清扫 ${backend} 槽位 ${slot.containerId} 失败`,
				describeError(error)
			);
		}
	}
	return released;
}

export async function sweepLocalSlots(input: SweepInput): Promise<void> {
	for (const backend of input.backends) {
		try {
			// biome-ignore lint/performance/noAwaitInLoops: 同上，两种后端顺序清
			const released = await sweepBackend(backend, input);
			input.logger.info(
				released === 0
					? `启动清扫：${backend} 后端没有存量槽位`
					: `启动清扫：${backend} 后端清掉 ${released} 个孤儿槽位`
			);
		} catch (error) {
			input.logger.warn(`启动清扫 ${backend} 后端失败`, describeError(error));
		}
	}
}
