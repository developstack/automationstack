/**
 * agent 的日志出口。**全进程只有这一个文件写 console**。
 *
 * 收在一处的理由不是洁癖：节点跑在别人的机器上，出问题时唯一能拿到的东西就是
 * 这些行——它们必须带时间戳（「什么时候断的」是排查的第一个问题），必须
 * 前缀一致（用户会 `grep node-agent`），也必须能在测试里被整个换掉
 * （行为用例断言的是握手与释放，不是往终端上刷字）。
 */

export interface AgentLogger {
	error: (message: string, cause?: unknown) => void;
	info: (message: string) => void;
	warn: (message: string, cause?: unknown) => void;
}

/**
 * `Error` 取 message，别的原样 String——日志里不该出现 `[object Object]`。
 *
 * 还要兜住两种 **message 是空串** 的 Error，否则调用方拼出来的是「连接出错：」
 * 这种半截话（2026-09-01 的 e2e 里 farm 一重启，重连日志就整屏这样）：
 *
 * - `AggregateError` 的 message 默认就是空的。`localhost` 会同时解出 ::1 与
 *   127.0.0.1，两条都被拒时 node 抛的正是它，真正的原因只在 `errors[]` 里；
 * - 别的 Error 也可能被 new 出来时不带 message，退回 `name` 至少还剩一个能查的词。
 */
export function describeError(cause: unknown): string {
	if (!(cause instanceof Error)) {
		return String(cause);
	}
	if (cause instanceof AggregateError) {
		const parts = cause.errors
			.map((inner: unknown) => describeError(inner))
			.filter((part) => part.length > 0);
		if (parts.length > 0) {
			return parts.join("；");
		}
	}
	return cause.message.length > 0 ? cause.message : cause.name;
}

function line(level: string, message: string): string {
	return `${new Date().toISOString()} [node-agent] ${level} ${message}`;
}

export function createConsoleLogger(): AgentLogger {
	return {
		error: (message, cause) => {
			// biome-ignore lint/suspicious/noConsole: 这是 agent 的日志出口本身，见文件头
			console.error(line("ERROR", message), cause ?? "");
		},
		info: (message) => {
			// biome-ignore lint/suspicious/noConsole: 同上
			console.log(line("INFO ", message));
		},
		warn: (message, cause) => {
			// biome-ignore lint/suspicious/noConsole: 同上
			console.warn(line("WARN ", message), cause ?? "");
		},
	};
}
