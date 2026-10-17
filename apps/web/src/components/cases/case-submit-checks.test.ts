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

const UPLOADING = buildCaseUploadingRef(TOKEN);

function valuesWith(patch: Partial<CaseFormValues>): CaseFormValues {
	return { ...emptyCaseFormValues(), ...patch };
}

function stepWith(cells: {
	actionScreenshots?: string[];
	expected?: string;
	expectedScreenshots?: string[];
	step?: string;
}) {
	return { expected: "", id: "s1", step: "", ...cells };
}

describe("hasUnfinishedCaseUploads", () => {
	it.each([
		["前置条件里的占位算数", { preconditions: `已登录${UPLOADING}` }, true],
		[
			"步骤操作格里的占位算数",
			{ steps: [stepWith({ step: UPLOADING })] },
			true,
		],
		[
			"步骤预期格里的占位算数",
			{ steps: [stepWith({ expected: UPLOADING })] },
			true,
		],
		[
			"操作截图里上传中的图片算数",
			{ steps: [stepWith({ actionScreenshots: [ID_A, UPLOADING] })] },
			true,
		],
		[
			"预期截图里上传中的图片算数",
			{ steps: [stepWith({ expectedScreenshots: [UPLOADING] })] },
			true,
		],
		[
			"截图都上传完成时不算未完成",
			{
				steps: [
					stepWith({ actionScreenshots: [ID_A], expectedScreenshots: [ID_B] }),
				],
			},
			false,
		],
		[
			"已经换成 attachment: 的引用不算未完成",
			{ preconditions: buildCaseAttachmentRef(ID_A) },
			false,
		],
	])("%s", (_name, patch, unfinished) => {
		expect(hasUnfinishedCaseUploads(valuesWith(patch))).toBe(unfinished);
	});

	it("连问两次答案一致（正则不带 g，不会推进 lastIndex）", () => {
		const values = valuesWith({ preconditions: UPLOADING });
		expect(hasUnfinishedCaseUploads(values)).toBe(true);
		expect(hasUnfinishedCaseUploads(values)).toBe(true);
	});
});

describe("referencedCaseAttachments", () => {
	const both = [attachment(ID_A), attachment(ID_B)];
	const refA = buildCaseAttachmentRef(ID_A);
	const refB = buildCaseAttachmentRef(ID_B);

	it.each([
		["正文里删掉的那张不登记", { preconditions: refA }, [attachment(ID_A)]],
		[
			"同一张图在正文里出现多次也只登记一条",
			{
				preconditions: `${refA}\n${refA}`,
				steps: [stepWith({ expected: refA, step: refA })],
			},
			[attachment(ID_A)],
		],
		[
			"引用散落在步骤的两个格子里也都认得出来",
			{ steps: [stepWith({ expected: refB, step: refA })] },
			both,
		],
		[
			"操作截图和预期截图中的图片也登记",
			{
				steps: [
					stepWith({ actionScreenshots: [ID_A], expectedScreenshots: [ID_B] }),
				],
			},
			both,
		],
		["正文一处引用都没有时返回空清单", { preconditions: "纯文本" }, []],
	])("%s", (_name, patch, expected) => {
		expect(referencedCaseAttachments(valuesWith(patch), both)).toEqual(
			expected
		);
	});
});
