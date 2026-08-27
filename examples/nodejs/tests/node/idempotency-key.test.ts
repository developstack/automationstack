/**
 * 被测对象：SDK 的**分批幂等键派生**，以及这份示例自己那条「语言前缀」性质。
 *
 * ⚠️ 同上：这个文件里没有一行提到上报。
 */

import assert from "node:assert/strict";
import test from "node:test";

import { deriveBatchIdempotencyKey } from "@automationstack/sdk";

import {
	deriveIdempotencyKey,
	LANGUAGE_TAG,
} from "../../src/ci-idempotency-key.ts";

const UUID_PATTERN =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const RUN_KEY = "9f1d5a0c-4b2e-4a77-9c31-0a5b7d2e6f80";

test("[AUTO-REPORT-004] 分批派生：第 0 批复用 run key，其余批确定性且互不相同", () => {
	// 最常见的执行只有一批，让它的键就是人在日志里看到的那个 run key，
	// 排查时少一层换算。
	assert.equal(deriveBatchIdempotencyKey(RUN_KEY, 0), RUN_KEY);

	// 确定性：重试第 3 批时重新算一遍，拿到的必须还是同一个键。
	// 不确定就等于没有幂等——CI 一重试，平台上就多一份内容一样的执行记录。
	assert.equal(
		deriveBatchIdempotencyKey(RUN_KEY, 3),
		deriveBatchIdempotencyKey(RUN_KEY, 3)
	);

	// 互不相同：几批共用一个键的话，第二批会命中第一批的缓存对账单直接返回，
	// 后面的结论一条都写不进去，而 SDK 看到的是两份「成功」的对账单。
	const keys = [0, 1, 2, 3, 4].map((index) =>
		deriveBatchIdempotencyKey(RUN_KEY, index)
	);
	assert.equal(new Set(keys).size, keys.length);

	// 每一个都得是合法 UUID，否则服务端的 z.uuid() 直接 400。
	for (const key of keys) {
		assert.match(key, UUID_PATTERN);
	}
});

test("[AUTO-SEARCH-005] 语言前缀保证三种语言算不出同一个幂等键", () => {
	// CI 发给三种语言的 $GITHUB_RUN_ID-$GITHUB_RUN_ATTEMPT 是**同一个字符串**。
	const ciJobId = "12345-2";

	// Python 与 Java 那两份示例的公式是 `deriveBatchIdempotencyKey(前缀 + name, 1)`
	// （examples/python/src/ci_idempotency_key.py、
	//   examples/jdk/.../CiIdempotencyKey.java 里就是这么写的），
	// 所以在这里可以用 SDK 导出的同一个函数把它们算出来，逐个比。
	const node = deriveIdempotencyKey(ciJobId);
	const python = deriveBatchIdempotencyKey(`python:${ciJobId}`, 1);
	const java = deriveBatchIdempotencyKey(`java:${ciJobId}`, 1);

	// 两两不同。撞上的后果是：第二轮直接命中第一轮的缓存对账单原样返回，
	// 结论一条都写不进去，而它拿到的是一份「成功」的对账单——绿着，什么都没发生。
	assert.equal(new Set([node, python, java]).size, 3);

	// 而且它是**被写下来的**性质，不是巧合：前缀不同 → 喂给摘要的名字必不相同。
	// 哪天有人顺手把 src/ci-idempotency-key.ts 改成直接调 SDK 的派生函数，
	// 公式一对齐、前缀要是也丢了，键当场就撞上，这条会先红。
	assert.equal(LANGUAGE_TAG, "node:");

	// 确定性：重试是新进程，算出来必须还是那一个。
	assert.equal(deriveIdempotencyKey(ciJobId), node);
	assert.match(node, UUID_PATTERN);
});
