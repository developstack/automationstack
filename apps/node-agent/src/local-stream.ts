import { connect } from "node:net";
import type { Mux } from "@automationstack/farm-node-protocol/mux";

import type { AgentLogger } from "./logger";

/**
 * 数据面的节点侧落点：farm 说「给我一条通往本机 9222 的管子」，这里把它接上。
 *
 * **host 写死 127.0.0.1**，这是协议层的硬约束（`control.ts` 的 `openStream`：
 * 允许对端指定 host，就等于让每一台节点变成一个内网跳板——而节点恰恰是装在
 * 办公网深处的机器）。端口也不做白名单：farm 只会开它自己刚从 acquire 应答里
 * 拿到的那两个端口，而那两个端口本来就是这个 agent 自己报上去的。
 *
 * 从 `session.ts` 切出来是被 300 行上限逼的，切口干净：这里不碰会话状态，
 * 只把两个句柄接在一起。
 */
export function attachLocalSocket(input: {
	logger: AgentLogger;
	mux: Mux;
	port: number;
	streamId: number;
}): void {
	const socket = connect(input.port, "127.0.0.1");
	socket.on("error", (error: Error) => {
		// 连不上（浏览器刚崩、端口还没起来）是常规失败：`pipeStreamToSocket` 会把
		// 它转成流上的错误告诉 farm，这里只补一行能定位的日志。
		input.logger.warn(
			`连接本机 127.0.0.1:${input.port} 失败（流 ${input.streamId}）`,
			error.message
		);
	});
	input.mux.attachStream(input.streamId, socket);
}
