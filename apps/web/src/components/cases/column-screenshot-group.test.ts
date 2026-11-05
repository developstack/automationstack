import { buildCaseAttachmentRef } from "@automationstack/api/lib/case-attachment-ref";
import { describe, expect, it } from "vitest";

import { buildCaseUploadingRef } from "@/components/cases/case-upload-placeholder";
import {
	insertScreenshotEntries,
	planScreenshotAdd,
	replaceScreenshotEntry,
	screenshotMediaItems,
} from "@/components/cases/column-screenshot-group";
import type { CaseUploadJob } from "@/components/cases/use-case-upload-jobs";

const ID_A = "aaaaaaaa-1111-4222-8333-444444444444";
const ID_B = "bbbbbbbb-1111-4222-8333-444444444444";
const TOKEN_1 = "11111111-1111-4111-8111-111111111111";
const TOKEN_2 = "22222222-2222-4222-8222-222222222222";
const UPLOADING_1 = buildCaseUploadingRef(TOKEN_1);
const UPLOADING_2 = buildCaseUploadingRef(TOKEN_2);

const image = (name: string, type = "image/png", size = 1024) =>
	new File([new Uint8Array(size)], name, { type });

describe("insertScreenshotEntries / replaceScreenshotEntry：上传队列写入一组截图", () => {
	it("appends each pasted image as an uploading entry, in order", () => {
		expect(
			insertScreenshotEntries([ID_A], `${UPLOADING_1}\n${UPLOADING_2}`)
		).toEqual([ID_A, UPLOADING_1, UPLOADING_2]);
	});

	it.each([
		[
			"an uploaded image becomes its attachment id in the same place",
			UPLOADING_1,
			buildCaseAttachmentRef(ID_B),
			[ID_A, ID_B, UPLOADING_2],
		],
		["a removed upload leaves the group", UPLOADING_1, "", [ID_A, UPLOADING_2]],
		["a saved screenshot can be removed", ID_A, "", [UPLOADING_1, UPLOADING_2]],
	])("%s", (_name, from, to, expected) => {
		expect(
			replaceScreenshotEntry([ID_A, UPLOADING_1, UPLOADING_2], from, to)
		).toEqual(expected);
	});

	it("returns the same list when the entry is not in the group", () => {
		const entries = [ID_A];
		expect(replaceScreenshotEntry(entries, UPLOADING_1, "")).toBe(entries);
	});
});

describe("planScreenshotAdd：浏览器端先检查类型、大小和每组的数量", () => {
	it.each([
		["accepts images below the limit", 0, [image("a.png")], 1, null],
		[
			"accepts only up to 9 in the group",
			8,
			[image("a.png"), image("b.png")],
			1,
			"每个步骤最多 9 张操作截图，1 张没有加入",
		],
		[
			"rejects a file that is not an image",
			0,
			[image("a.gif", "image/gif")],
			0,
			"a.gif：不支持的图片类型（image/gif），仅支持 PNG / JPEG / WebP",
		],
		[
			"rejects an image above 10 MB",
			0,
			[image("big.png", "image/png", 10 * 1024 * 1024 + 1)],
			0,
			"big.png：图片超过 10MB 上限，请压缩后再粘贴",
		],
	])("%s", (_name, existing, files, acceptedCount, error) => {
		const plan = planScreenshotAdd(files, existing, "操作截图");
		expect(plan.accepted).toHaveLength(acceptedCount);
		expect(plan.error).toBe(error);
	});
});

describe("screenshotMediaItems：一组截图显示为缩略图", () => {
	it("names each item by group and position, and shows the upload state", () => {
		const uploads = new Map<string, CaseUploadJob>([
			[TOKEN_1, { fileName: "a.png", progress: 0.5, status: "uploading" }],
		]);
		const urls = new Map([
			[ID_A, "https://r2.example/a.png"],
			[TOKEN_1, "blob:a"],
		]);
		expect(
			screenshotMediaItems(
				[ID_A, UPLOADING_1, UPLOADING_2],
				"预期截图",
				urls,
				uploads
			)
		).toEqual([
			{
				id: ID_A,
				kind: "image",
				name: "预期截图 1",
				url: "https://r2.example/a.png",
			},
			{
				id: UPLOADING_1,
				kind: "image",
				name: "预期截图 2",
				status: "uploading",
				url: "blob:a",
			},
			// 没有上传任务：例如从草稿恢复，或者上传时页面关闭过
			{
				id: UPLOADING_2,
				kind: "image",
				name: "预期截图 3",
				status: "failed",
				url: null,
			},
		]);
	});
});
