import { createHash, randomUUID } from "node:crypto";

/**
 * 幂等键（§5.2 / §7.2 第 2 条）。
 *
 * 铁律是「一次进程启动生成一个 UUID，重试时**复用**」——重新生成就等于没有幂等。
 * 这里把它拆成两层，因为一次执行可能分成多批发（§5.5 超过 200 条分批），
 * 而 `UNIQUE (projectId, idempotencyKey)` 是**按请求**判的：几批共用一个键的话，
 * 第二批会命中第一批的缓存对账单直接返回，后面的结论一条都写不进去，
 * 而 SDK 看到的是两份「成功」的对账单——正是 §7.2 第 4 条说的那种静默成功。
 *
 * 所以：**一次进程一个 run key，每批的键从 run key 确定性派生**。
 * 确定性是关键——重试第 3 批时重新算一遍，拿到的还是同一个键。
 */

/** UUID 的四个分段边界，用来把 16 字节的摘要摆成 8-4-4-4-12。 */
const UUID_SEGMENT_ENDS = [8, 12, 16, 20, 32] as const;
const UUID_HEX_LENGTH = 32;
const VERSION_NIBBLE_INDEX = 12;
const VARIANT_NIBBLE_INDEX = 16;

/**
 * 读环境变量拿一个跨进程稳定的幂等键；没有就现生成一个。
 *
 * ⚠️ `AS_IDEMPOTENCY_KEY` 是**给 CI 重试用的**，不是日常配置（所以它不违反 D31：
 * 它不是「往哪写」的输入，只是「这是不是同一轮」的标识）。CI 的 retry 是**新进程**，
 * 「一次进程一个 UUID」在那里失效——同一轮被重跑时会当成两轮全新的上报。
 * 把 CI 的 job/attempt id 喂进来，重试才真的复用得上。
 */
export function resolveRunIdempotencyKey(
	env: Record<string, string | undefined>
): string {
	const configured = env.AS_IDEMPOTENCY_KEY?.trim();
	if (configured) {
		// 不校验它是不是 uuid：真不是的话，服务端那条指着字段名的 400 比
		// SDK 自己编的一句「格式不对」更有用（同 §7.2 第 4 条「原样透传」）。
		return configured;
	}
	return randomUUID();
}

/**
 * 从 run key 确定性派生第 `batchIndex` 批的幂等键。
 *
 * 形状是 UUIDv5（name-based，SHA-1）：服务端 `z.uuid()` 只认合法 UUID，
 * 而 v5 恰好就是「从一个名字算出一个 UUID」这件事的标准做法，
 * 不用另发明一套编码。批 0 直接用 run key 本身——最常见的那种执行只有一批，
 * 让它的键就是人在日志里看到的那个 run key，排查时少一层换算。
 */
export function deriveBatchIdempotencyKey(
	runKey: string,
	batchIndex: number
): string {
	if (batchIndex === 0) {
		return runKey;
	}
	const digest = createHash("sha1")
		.update(`${runKey}:${batchIndex}`)
		.digest("hex")
		.slice(0, UUID_HEX_LENGTH);
	return formatAsUuidV5(digest);
}

function formatAsUuidV5(hex: string): string {
	const nibbles = [...hex];
	// 版本位固定成 5、变体位固定成 8：不改这两位算出来的不是合法 UUID，
	// 服务端的 z.uuid() 会直接拒。
	nibbles[VERSION_NIBBLE_INDEX] = "5";
	nibbles[VARIANT_NIBBLE_INDEX] = "8";
	const normalized = nibbles.join("");
	let cursor = 0;
	const segments: string[] = [];
	for (const end of UUID_SEGMENT_ENDS) {
		segments.push(normalized.slice(cursor, end));
		cursor = end;
	}
	return segments.join("-");
}
