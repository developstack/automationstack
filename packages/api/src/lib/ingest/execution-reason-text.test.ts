import { expect, test } from "vitest";
import { describeRunWriteRejection } from "./execution-reason-text";

test("五种类型化拒绝各给一句人话，且都点名是哪个任务", () => {
	const locked = describeRunWriteRejection(
		{ kind: "locked", submittedAt: new Date("2026-08-24T00:00:00Z") },
		"v2.3 回归"
	);
	expect(locked).toContain("v2.3 回归");
	expect(locked).toContain("锁定");
	expect(
		describeRunWriteRejection(
			{ kind: "voided", voidedAt: new Date("2026-08-24T00:00:00Z") },
			"v2.3 回归"
		)
	).toBe("测试任务「v2.3 回归」已作废，本轮结论未写入");
	expect(
		describeRunWriteRejection({ kind: "review-pending" }, "v2.3 回归")
	).toBe("测试任务「v2.3 回归」还在待评审，不接受结论");
	expect(
		describeRunWriteRejection(
			{ invalidRunCaseIds: ["rc-a"], kind: "invalid-run-cases" },
			"v2.3 回归"
		)
	).toContain("范围在写入前被改动");
	expect(
		describeRunWriteRejection({ kind: "not-found" }, "v2.3 回归")
	).toContain("已不存在");
});
