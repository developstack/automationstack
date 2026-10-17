import { describe, expect, it } from "vitest";

import {
	caseLevelAttachments,
	type PendingStepUpload,
	type RunAttachmentView,
	stepAttachmentItems,
	takeUploadable,
} from "@/components/test-runs/run-step-attachment-items";

function view(
	id: string,
	stepId: string | null,
	contentType = "image/png"
): RunAttachmentView {
	return {
		attachment: {
			contentType,
			fileName: `${id}.bin`,
			id,
			sizeBytes: 1,
			stepId,
		},
		url: `https://r2.example/${id}`,
	};
}

const LIST = [
	view("a", "s1"),
	view("old", null),
	view("b", "s2", "video/webm"),
	view("c", "s1", "video/mp4"),
];

const pending = (stepId: string, name: string): PendingStepUpload => ({
	id: `p-${name}`,
	kind: "image",
	name,
	stepId,
});

describe("实际附件：按步骤分组", () => {
	it("keeps the upload order of one step, marks recordings as video, and adds the uploads in progress", () => {
		expect(
			stepAttachmentItems(LIST, "s1", [
				pending("s1", "new.png"),
				pending("s2", "x.png"),
			])
		).toEqual([
			{ id: "a", kind: "image", name: "a.bin", url: "https://r2.example/a" },
			{ id: "c", kind: "video", name: "c.bin", url: "https://r2.example/c" },
			{
				id: "p-new.png",
				kind: "image",
				name: "new.png",
				status: "uploading",
				url: null,
			},
		]);
	});

	it("leaves the attachments of the whole case out of every step, and lists them read-only with those of deleted steps", () => {
		expect(stepAttachmentItems(LIST, "s9", [])).toEqual([]);
		expect(
			caseLevelAttachments(LIST, ["s1"]).map((item) => item.attachment.id)
		).toEqual(["old", "b"]);
	});

	it.each([
		[0, 3, 3, 0],
		[7, 3, 2, 1],
		[9, 1, 0, 1],
	])(
		"with %i attachments on the step, %i new files: %i upload and %i are left out",
		(existing, added, uploaded, skipped) => {
			const files = Array.from(
				{ length: added },
				(_unused, index) => new File(["x"], `${index}.png`)
			);
			const result = takeUploadable(files, existing);
			expect([result.accepted.length, result.skipped]).toEqual([
				uploaded,
				skipped,
			]);
		}
	);
});
