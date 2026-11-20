import { describe, expect, it } from "vitest";

import { submitterLabel } from "@/components/reports/report-list-meta";

describe("submitterLabel", () => {
	it.each([
		["没有提交人：系统自动提交", null, null, "系统自动提交"],
		["有提交人：显示用户名", "u1", "alice", "alice"],
		["有 id 没有名称：账号已删除", "u1", null, "已删除的账号"],
	])("%s", (_name, id, name, label) => {
		expect(submitterLabel(id, name)).toBe(label);
	});
});
