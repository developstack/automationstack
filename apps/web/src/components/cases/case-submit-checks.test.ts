import { buildCaseAttachmentRef } from "@automationstack/api/lib/case-attachment-ref";
import { describe, expect, it } from "vitest";
import type { CaseDraftAttachment } from "@/components/cases/case-draft-parse";
import {
	type CaseFormValues,
	emptyCaseFormValues,
} from "@/components/cases/case-meta";
import {
	hasUnfinishedCaseUploads,
	referencedCaseAttachments,
} from "@/components/cases/case-submit-checks";
import { buildCaseUploadingRef } from "@/components/cases/case-upload-placeholder";

const ID_A = "aaaaaaaa-1111-2222-3333-444444444444";
const ID_B = "bbbbbbbb-1111-2222-3333-444444444444";
const TOKEN = "cccccccc-1111-2222-3333-444444444444";

function attachment(id: string): CaseDraftAttachment {
	return { fileName: `${id}.png`, id, storageKey: `test-cases/p/c/${id}.png` };
}

function valuesWith(patch: Partial<CaseFormValues>): CaseFormValues {
	return { ...emptyCaseFormValues(), ...patch };
}

describe("hasUnfinishedCaseUploads", () => {
	it("前置条件里的占位算数", () => {
		expect(
			hasUnfinishedCaseUploads(
				valuesWith({ preconditions: `已登录${buildCaseUploadingRef(TOKEN)}` })
			)
		).toBe(true);
	});

	it("步骤的操作格与预期格都要扫到", () => {
		const inStep = valuesWith({
			steps: [{ expected: "", id: "s1", step: buildCaseUploadingRef(TOKEN) }],
		});
		const inExpected = valuesWith({
			steps: [{ expected: buildCaseUploadingRef(TOKEN), id: "s1", step: "" }],
		});
		expect(hasUnfinishedCaseUploads(inStep)).toBe(true);
		expect(hasUnfinishedCaseUploads(inExpected)).toBe(true);
	});

	it("已经换成 attachment: 的引用不算未完成", () => {
		expect(
			hasUnfinishedCaseUploads(
				valuesWith({ preconditions: buildCaseAttachmentRef(ID_A) })
			)
		).toBe(false);
	});

	it("连问两次答案一致（正则不带 g，不会推进 lastIndex）", () => {
		const values = valuesWith({ preconditions: buildCaseUploadingRef(TOKEN) });
		expect(hasUnfinishedCaseUploads(values)).toBe(true);
		expect(hasUnfinishedCaseUploads(values)).toBe(true);
	});
});

describe("referencedCaseAttachments", () => {
	it("正文里删掉的那张不登记", () => {
		const values = valuesWith({ preconditions: buildCaseAttachmentRef(ID_A) });
		expect(
			referencedCaseAttachments(values, [attachment(ID_A), attachment(ID_B)])
		).toEqual([attachment(ID_A)]);
	});

	it("同一张图在正文里出现多次也只登记一条", () => {
		const ref = buildCaseAttachmentRef(ID_A);
		const values = valuesWith({
			preconditions: `${ref}\n${ref}`,
			steps: [{ expected: ref, id: "s1", step: ref }],
		});
		expect(referencedCaseAttachments(values, [attachment(ID_A)])).toHaveLength(
			1
		);
	});

	it("引用散落在步骤的两个格子里也都认得出来", () => {
		const values = valuesWith({
			steps: [
				{
					expected: buildCaseAttachmentRef(ID_B),
					id: "s1",
					step: buildCaseAttachmentRef(ID_A),
				},
			],
		});
		expect(
			referencedCaseAttachments(values, [attachment(ID_A), attachment(ID_B)])
		).toHaveLength(2);
	});

	it("正文一处引用都没有时返回空清单", () => {
		expect(
			referencedCaseAttachments(valuesWith({ preconditions: "纯文本" }), [
				attachment(ID_A),
			])
		).toEqual([]);
	});
});
