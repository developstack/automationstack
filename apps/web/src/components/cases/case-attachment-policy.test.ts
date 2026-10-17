import { describe, expect, it } from "vitest";

import {
	MAX_CASE_IMAGE_BYTES,
	precheckCaseImage,
} from "@/components/cases/case-attachment-policy";

const file = (type: string, size = 1) =>
	new File([new Uint8Array(size)], "图.png", { type });

describe("precheckCaseImage：上传前在浏览器中检查图片", () => {
	it.each([
		["accepts a PNG", file("image/png"), { ok: true }],
		[
			"names the unsupported type",
			file("image/gif"),
			{
				ok: false,
				reason: "不支持的图片类型（image/gif），仅支持 PNG / JPEG / WebP",
			},
		],
		[
			"rejects a file without a type",
			file(""),
			{ ok: false, reason: "不支持的图片类型，仅支持 PNG / JPEG / WebP" },
		],
		[
			"rejects an image over the size limit",
			file("image/webp", MAX_CASE_IMAGE_BYTES + 1),
			{ ok: false, reason: "图片超过 10MB 上限，请压缩后再粘贴" },
		],
	])("%s", (_name, image, expected) => {
		expect(precheckCaseImage(image)).toEqual(expected);
	});
});
