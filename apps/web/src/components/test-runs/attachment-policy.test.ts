import { describe, expect, it } from "vitest";

import {
	MAX_ATTACHMENT_BYTES,
	precheckAttachment,
} from "@/components/test-runs/attachment-policy";

function fileOf(type: string, size = 1024): File {
	const file = new File(["x"], "a", { type });
	Object.defineProperty(file, "size", { value: size });
	return file;
}

describe("实际附件上传前的检查", () => {
	it.each([
		["image/png", "screenshot"],
		["image/jpeg", "screenshot"],
		["image/webp", "screenshot"],
		["video/mp4", "video"],
		["video/webm", "video"],
	])("accepts %s as %s", (type, kind) => {
		expect(precheckAttachment(fileOf(type))).toEqual({
			contentType: type,
			kind,
			ok: true,
		});
	});

	it.each([
		["a text log", fileOf("text/plain")],
		["a GIF image", fileOf("image/gif")],
		["a file without a type", fileOf("")],
		["a file larger than 20 MB", fileOf("image/png", MAX_ATTACHMENT_BYTES + 1)],
	])("rejects %s", (_name, file) => {
		expect(precheckAttachment(file).ok).toBe(false);
	});
});
