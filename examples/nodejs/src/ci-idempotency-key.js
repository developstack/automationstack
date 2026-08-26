/** biome-ignore-all lint/suspicious/noConsole: 这个入口的全部输出就是那一行 key */

/**
 * 把 CI 的 job/attempt 标识**确定性**地折成一个合法 UUID，喂给 `AS_IDEMPOTENCY_KEY`。
 *
 *   export AS_IDEMPOTENCY_KEY=$(node src/ci-idempotency-key.js "$GITHUB_RUN_ID-$GITHUB_RUN_ATTEMPT")
 *
 * ## 为什么不能直接把 `12345-2` 塞进 AS_IDEMPOTENCY_KEY
 *
 * 服务端那个字段是 `z.uuid()`，不是 UUID 会当场 400。SDK 故意**不**在本地校验它
 * （见 sdk-node/src/idempotency.ts 的注释：服务端那条指着字段名的 400，
 * 比 SDK 自己编一句「格式不对」有用），所以这一步的转换得由调用方做。
 *
 * ## 为什么是 UUIDv5 的形状，而不是随手拼一个
 *
 * 要的性质只有一条：**同样的输入永远得到同样的 UUID**——重试是新进程，
 * 算出来必须还是那一个，否则平台上会多出一份内容一样的执行记录。
 * 「从一个名字算出一个 UUID」正是 v5 的定义，不用另发明一套编码；
 * SDK 内部给分批派生键时用的也是这套形状，两边对得上。
 *
 * ## 为什么要在名字前面加一个 `node:`
 *
 * CI 发给三种语言的 `$GITHUB_RUN_ID-$GITHUB_RUN_ATTEMPT` 是**同一个字符串**。
 * 一条流水线上 Node / Python / Java 各跑一轮自己的测试，两轮共用一个幂等键
 * 就是灾难：第二轮直接命中第一轮的缓存对账单返回，结论一条都没写进去，
 * 而它拿到的是一份「成功」的对账单——绿着，什么都没发生。
 *
 * 不加前缀的话，「两轮不撞」全靠三份示例碰巧用了不同公式：这边摘的是 `name`，
 * Python / Java 那边摘的是 `name:1`。那是**巧合**，不是谁保证过的性质——
 * 哪天有人顺手把这个文件改成直接调 SDK 的 `deriveBatchIdempotencyKey`
 * （它是导出的），公式一对齐，键当场就撞上，而且撞出来的症状是「绿的」。
 * 加上语言前缀，不撞就从巧合变成一条**写下来的**性质：三份示例喂给摘要的
 * 名字前缀各不相同，无论公式怎么演化都不会算出同一个键。
 *
 * 三份示例对同一个输入 `12345-2` 的实测值互不相同（node:/python:/java: 各一个）。
 */

import { createHash } from "node:crypto";

const UUID_HEX_LENGTH = 32;
const VERSION_NIBBLE_INDEX = 12;
const VARIANT_NIBBLE_INDEX = 16;
const UUID_SEGMENT_ENDS = [8, 12, 16, 20, 32];

/**
 * 见文件顶部：CI 给三种语言的 job 标识是同一个字符串，不加区分就可能算出同一个键，
 * 第二轮直接命中第一轮的缓存对账单、一条都写不进去还显示成功。
 */
const LANGUAGE_TAG = "node:";

export function deriveIdempotencyKey(name) {
	const nibbles = [
		...createHash("sha1")
			.update(LANGUAGE_TAG + name)
			.digest("hex")
			.slice(0, UUID_HEX_LENGTH),
	];
	// 版本位固定成 5、变体位固定成 8，否则算出来的不是合法 UUID。
	nibbles[VERSION_NIBBLE_INDEX] = "5";
	nibbles[VARIANT_NIBBLE_INDEX] = "8";
	const hex = nibbles.join("");
	let cursor = 0;
	const segments = [];
	for (const end of UUID_SEGMENT_ENDS) {
		segments.push(hex.slice(cursor, end));
		cursor = end;
	}
	return segments.join("-");
}

// 只在被直接跑起来时充当 CLI；被 import 时什么都不做。
if (import.meta.main) {
	const [, , name] = process.argv;
	if (name) {
		console.log(deriveIdempotencyKey(name));
	} else {
		console.error(
			'用法：node src/ci-idempotency-key.js "<CI 的 job-attempt 标识>"'
		);
		process.exit(1);
	}
}
