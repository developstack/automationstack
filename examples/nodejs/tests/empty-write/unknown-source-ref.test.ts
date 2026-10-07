import assert from "node:assert/strict";
import test from "node:test";

import { hasNoWrites } from "@automationstack/sdk";

test("[AUTO-DOES-NOT-EXIST-999] writtenTo 为空是 SDK 唯一据以报错的信号", () => {
	assert.equal(
		hasNoWrites({
			executionId: "8f0d6a1e-2c34-4b55-9a70-1de2f3c45678",
			outOfScope: [],
			skippedManual: [],
			unmatchedCases: [],
			writtenTo: [],
		}),
		true
	);
	assert.equal(
		hasNoWrites({
			executionId: "8f0d6a1e-2c34-4b55-9a70-1de2f3c45678",
			outOfScope: [],
			skippedManual: [],
			unmatchedCases: [],
			writtenTo: [{ runId: "r1", runName: "回归", updated: 1 }],
		}),
		false
	);
});
