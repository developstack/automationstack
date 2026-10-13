import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
	type CaseAttachmentContextValue,
	CaseAttachmentProvider,
} from "@/components/cases/case-attachment-context";
import { ImageNode } from "@/components/cases/image-node";
import type { CaseUploadJobs } from "@/components/cases/use-case-upload-jobs";

const TOKEN = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const URLS = new Map([[TOKEN, "blob:local"]]);

function renderPending(uploads: CaseUploadJobs) {
	const value: CaseAttachmentContextValue = {
		discardUpload: vi.fn(),
		imageUrls: URLS,
		retryUpload: vi.fn(),
		uploading: false,
		uploadPasted: null,
		uploads,
	};
	render(
		<CaseAttachmentProvider value={value}>
			<ImageNode attachmentId={TOKEN} imageUrls={URLS} pending={true} />
		</CaseAttachmentProvider>
	);
}

describe("ImageNode：预览中粘贴的图片说明上传状态", () => {
	it("上传中的图片说明正在上传", () => {
		renderPending(
			new Map([
				[TOKEN, { fileName: "a.png", progress: 0.3, status: "uploading" }],
			])
		);
		expect(screen.getByRole("img").getAttribute("alt")).toBe(
			"用例插图（上传中）"
		);
	});

	it("上传失败的图片说明上传失败，不再显示为上传中", () => {
		renderPending(
			new Map([
				[
					TOKEN,
					{
						fileName: "a.png",
						reason: "网络中断",
						retryable: true,
						status: "failed",
					},
				],
			])
		);
		expect(screen.getByRole("img").getAttribute("alt")).toBe(
			"用例插图（上传失败）"
		);
	});
});
