import { describe, expect, it } from "vitest";

import { rejectedWriteMessage, runLockMessage } from "./test-run-errors";

const AT = new Date("2026-08-10T03:00:00Z");
const LOCKED = "该测试任务已提交并锁定，不可修改";
const VOIDED = "测试任务已作废，不能修改";

describe("runLockMessage：缺陷操作前的写锁检查", () => {
	it.each([
		["可写", { submittedAt: null, voidedAt: null }, null],
		["已提交", { submittedAt: AT, voidedAt: null }, LOCKED],
		["已作废", { submittedAt: null, voidedAt: AT }, VOIDED],
	])("%s", (_name, run, expected) => {
		expect(runLockMessage(run)).toBe(expected);
	});
});

describe("rejectedWriteMessage：写入被拒时的提示", () => {
	it.each([
		[{ kind: "voided", voidedAt: AT } as const, VOIDED],
		[{ kind: "locked", submittedAt: AT } as const, LOCKED],
	])("%o", (rejection, expected) => {
		expect(rejectedWriteMessage(rejection)).toBe(expected);
	});
});
