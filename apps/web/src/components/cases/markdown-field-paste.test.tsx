import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
	type CaseAttachmentContextValue,
	CaseAttachmentProvider,
} from "@/components/cases/case-attachment-context";
import { buildCaseUploadingRef } from "@/components/cases/case-upload-placeholder";
import { MarkdownField } from "@/components/cases/markdown-field";

const TOKEN = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const OTHER_TOKEN = "cccccccc-dddd-4eee-8fff-000000000000";
const ATTACHMENT_REF = "![](attachment:bbbbbbbb-cccc-4ddd-8eee-ffffffffffff)";
const PNG = new File(["x"], "登录页.png", { type: "image/png" });
const TEXT_FILE = new File(["x"], "说明.txt", { type: "text/plain" });

function renderField(
	value: string,
	attachments: Partial<CaseAttachmentContextValue>
) {
	const onChange = vi.fn();
	const context: CaseAttachmentContextValue = {
		discardUpload: vi.fn(),
		imageUrls: new Map(),
		retryUpload: vi.fn(),
		uploading: false,
		uploadPasted: null,
		uploads: new Map(),
		...attachments,
	};
	render(
		<CaseAttachmentProvider value={context}>
			<MarkdownField
				ariaLabel="前置条件"
				onChange={onChange}
				placeholder="前置条件"
				value={value}
			/>
		</CaseAttachmentProvider>
	);
	const textarea = screen.getByRole("textbox", { name: "前置条件" });
	return { onChange, textarea };
}

const paste = (target: HTMLElement, file: File) =>
	fireEvent.paste(target, { clipboardData: { files: [file] } });

describe("MarkdownField：粘贴的图片上传后写入文字", () => {
	it("writes the upload placeholder at the caret, then replaces it with the attachment", () => {
		const placeholder = buildCaseUploadingRef(TOKEN);
		const uploadPasted = vi.fn<
			NonNullable<CaseAttachmentContextValue["uploadPasted"]>
		>((_files, target) => {
			target.insert(` ${placeholder}`);
			target.replace(placeholder, ATTACHMENT_REF);
		});
		const { onChange, textarea } = renderField("已登录", { uploadPasted });
		(textarea as HTMLTextAreaElement).setSelectionRange(3, 3);
		expect(paste(textarea, PNG)).toBe(false);
		expect(uploadPasted.mock.calls[0]?.[0]).toEqual([PNG]);
		expect(onChange.mock.calls.map(([text]) => text)).toEqual([
			`已登录 ${placeholder}`,
			`已登录 ${ATTACHMENT_REF}`,
		]);
	});

	it.each([
		["a paste without images", TEXT_FILE, vi.fn()],
		["images when the storage is not configured", PNG, null],
	])("leaves %s to the browser", (_name, file, uploadPasted) => {
		const { onChange, textarea } = renderField("已登录", { uploadPasted });
		expect(paste(textarea, file)).toBe(true);
		expect(onChange).not.toHaveBeenCalled();
	});

	it("removes upload placeholders from the text and returns focus to the field", () => {
		const failed = buildCaseUploadingRef(TOKEN);
		const interrupted = buildCaseUploadingRef(OTHER_TOKEN);
		const discardUpload = vi.fn();
		const { onChange, textarea } = renderField(
			`已登录${failed}${interrupted}`,
			{
				discardUpload,
				uploads: new Map([
					[
						TOKEN,
						{
							fileName: "登录页.png",
							reason: "网络中断",
							retryable: false,
							status: "failed",
						},
					],
				]),
			}
		);
		const focus = vi.spyOn(textarea, "focus");
		fireEvent.click(screen.getByRole("button", { name: "移除 登录页.png" }));
		expect(discardUpload).toHaveBeenCalledWith(TOKEN);
		expect(focus).toHaveBeenCalled();
		fireEvent.click(screen.getByRole("button", { name: "移除 未完成的图片" }));
		expect(onChange).toHaveBeenCalledWith(`已登录${failed}`);
	});
});
