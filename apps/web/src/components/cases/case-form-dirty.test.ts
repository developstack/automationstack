import { describe, expect, it } from "vitest";

import { isCaseFormDirty } from "@/components/cases/case-form-dirty";
import {
	type CaseFormValues,
	emptyCaseFormValues,
} from "@/components/cases/case-meta";

const BASELINE: CaseFormValues = {
	...emptyCaseFormValues(),
	name: "登录",
	steps: [{ expected: "进入首页", id: "s1", step: "输入账号" }],
};

describe("isCaseFormDirty：编辑区有没有没保存的修改", () => {
	it.each<[string, CaseFormValues | null, boolean]>([
		["not editing", null, false],
		["the same values", { ...BASELINE, steps: [...BASELINE.steps] }, false],
		["a changed name", { ...BASELINE, name: "登录成功" }, true],
		[
			"changed step text",
			{
				...BASELINE,
				steps: [{ expected: "进入首页", id: "s1", step: "输入密码" }],
			},
			true,
		],
	])("%s → %s", (_name, values, dirty) => {
		expect(isCaseFormDirty(values, BASELINE)).toBe(dirty);
	});
});
