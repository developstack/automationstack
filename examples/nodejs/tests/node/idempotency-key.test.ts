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
	assert.equal(deriveBatchIdempotencyKey(RUN_KEY, 0), RUN_KEY);

	assert.equal(
		deriveBatchIdempotencyKey(RUN_KEY, 3),
		deriveBatchIdempotencyKey(RUN_KEY, 3)
	);

	const keys = [0, 1, 2, 3, 4].map((index) =>
		deriveBatchIdempotencyKey(RUN_KEY, index)
	);
	assert.equal(new Set(keys).size, keys.length);

	for (const key of keys) {
		assert.match(key, UUID_PATTERN);
	}
});

test("[AUTO-SEARCH-005] 语言前缀保证三种语言算不出同一个幂等键", () => {
	const ciJobId = "12345-2";

	const node = deriveIdempotencyKey(ciJobId);
	const python = deriveBatchIdempotencyKey(`python:${ciJobId}`, 1);
	const java = deriveBatchIdempotencyKey(`java:${ciJobId}`, 1);

	assert.equal(new Set([node, python, java]).size, 3);

	assert.equal(LANGUAGE_TAG, "node:");

	assert.equal(deriveIdempotencyKey(ciJobId), node);
	assert.match(node, UUID_PATTERN);
});
