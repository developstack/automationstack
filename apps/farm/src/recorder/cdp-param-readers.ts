/**
 * CDP 帧里那点宽类型取值：读字段、以及把 params 断言成归一化层要的形状。
 *
 * 从 `client.ts` 拆出来：那份文件到了 435 行、越过了仓库 300 行的上限
 * （scripts/check-file-rules.js）。切在这里而不是别处，是因为 client 侧拆出来的
 * 几个文件（浏览器端点、事件分流、会话搬运）都要用它们，放在依赖图最底下才不会
 * 让那几个模块互相 import。
 */

export const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value);

export const readString = (
	source: Record<string, unknown>,
	key: string
): string | undefined => {
	const value = source[key];
	return typeof value === "string" ? value : undefined;
};

/**
 * CDP 帧的 params 是 `Record<string, unknown>`，而归一化层要的是具体形状。
 * 形状由 CDP 协议保证，所以在这一个边界上断言一次；归一化层内部对可选字段
 * 仍然做兜底（`?? ""` / `?? []`），坏数据最多让某个字段变空，不会炸。
 */
export const asParams = <T>(params: Record<string, unknown>): T =>
	params as unknown as T;
