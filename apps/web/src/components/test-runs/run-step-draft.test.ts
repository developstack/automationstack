import { describe, expect, it } from "vitest";

import { parseRunStepDraft } from "@/components/test-runs/run-step-draft";

describe("parseRunStepDraft：本机暂存的分步判定", () => {
	it.each([
		["actualResults", { actualResults: { s1: "页面正常", s2: 3 } }],
		["comments（#78 之前的草稿）", { comments: { s1: "页面正常" } }],
	])("reads the actual results from the %s key", (_key, texts) => {
		const raw = JSON.stringify({
			caseVersion: 2,
			judged: { s1: "passed", s2: "maybe" },
			savedAt: 5,
			...texts,
		});
		expect(parseRunStepDraft(raw)).toEqual({
			actualResults: { s1: "页面正常" },
			caseVersion: 2,
			judged: { s1: "passed" },
			savedAt: 5,
		});
	});

	it.each([
		["no draft", null],
		["text that is not JSON", "{"],
		["a draft without a case version", '{"judged":{}}'],
	])("returns null for %s", (_name, raw) => {
		expect(parseRunStepDraft(raw)).toBeNull();
	});
});
