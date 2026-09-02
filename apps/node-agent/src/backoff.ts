/**
 * 重连退避。**只有这一个纯函数**，所以它能被逐拍断言，而不必让用例真的等 30 秒。
 */

/** 第一次重连等多久。一秒：farm 重启一次通常就在这个量级。 */
export const RECONNECT_BASE_DELAY_MS = 1000;

/**
 * 退避上限。
 *
 * 30 秒不是拍脑袋：平台按 90 秒窗口判节点离线
 * （`packages/api/src/lib/farm-node-online.ts`）。上限压在窗口的三分之一，
 * 意味着一次短暂抖动之后，节点最坏也能在还没被判离线之前接回来。
 * 调大到 60 秒的直接后果是「网络恢复了，但表里那台机器还红着一分钟」。
 */
export const RECONNECT_MAX_DELAY_MS = 30_000;

/** 2^n 的封顶指数。超过它 `delay` 早就被 MAX 夹住了，算下去只会溢出成 Infinity。 */
const MAX_EXPONENT = 20;

/** 抖动占比：一半固定、一半随机。 */
const JITTER_SHARE = 0.5;

/**
 * 第 `attempt` 次重连（从 1 起）该等多久。
 *
 * 抖动只打散**后一半**（`ceiling/2 + rand * ceiling/2`），不是 full jitter：
 * full jitter 会随机出接近 0 的等待，于是 farm 刚重启、还没起完的那几秒里，
 * 每个节点都在贴着它猛拨——退避的意义正是不这么干。留一半固定值保证了
 * 「至少等这么久」，另一半负责让 N 台节点不在同一毫秒撞上来（惊群）。
 *
 * `random` 是参数而不是直接 `Math.random()`：用例要断言的是这条曲线本身，
 * 而不是某一次抽签结果。
 */
export function reconnectDelayMs(
	attempt: number,
	random: () => number = Math.random
): number {
	const exponent = Math.min(Math.max(attempt, 1) - 1, MAX_EXPONENT);
	const ceiling = Math.min(
		RECONNECT_BASE_DELAY_MS * 2 ** exponent,
		RECONNECT_MAX_DELAY_MS
	);
	const fixed = ceiling * JITTER_SHARE;
	return Math.round(fixed + random() * fixed);
}
