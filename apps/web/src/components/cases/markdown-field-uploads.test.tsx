import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
	type CaseAttachmentContextValue,
	CaseAttachmentProvider,
} from "@/components/cases/case-attachment-context";
import { buildCaseUploadingRef } from "@/components/cases/case-upload-placeholder";
import { MarkdownFieldUploads } from "@/components/cases/markdown-field-uploads";
import type { CaseUploadJobs } from "@/components/cases/use-case-upload-jobs";

const UPLOADING = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const FAILED = "bbbbbbbb-cccc-4ddd-8eee-ffffffffffff";
const OTHER_FIELD = "cccccccc-dddd-4eee-8fff-000000000000";

const JOBS: CaseUploadJobs = new Map([
	[UPLOADING, { fileName: "登录页.png", progress: 0.45, status: "uploading" }],
	[
		FAILED,
		{
			fileName: "支付页.png",
			reason: "上传到存储失败（HTTP 403）",
			retryable: true,
			status: "failed",
		},
	],
	[OTHER_FIELD, { fileName: "别的字段.png", progress: 0, status: "queued" }],
]);

interface FieldCallbacks {
	onRemoveRef: (token: string) => void;
	onReturnFocus: () => void;
}

function fieldCallbacks(): FieldCallbacks {
	return { onRemoveRef: vi.fn(), onReturnFocus: vi.fn() };
}

function renderUploads(
	text: string,
	jobs: CaseUploadJobs = JOBS,
	field: FieldCallbacks = fieldCallbacks()
) {
	const value: CaseAttachmentContextValue = {
		discardUpload: vi.fn(),
		imageUrls: new Map(),
		retryUpload: vi.fn(),
		uploading: true,
		uploadPasted: null,
		uploads: jobs,
	};
	render(
		<CaseAttachmentProvider value={value}>
			<MarkdownFieldUploads
				onRemoveRef={field.onRemoveRef}
				onReturnFocus={field.onReturnFocus}
				text={text}
			/>
		</CaseAttachmentProvider>
	);
	return value;
}

const RETRY_LABEL = /重试上传/;

const FIELD_TEXT = `步骤一 ${buildCaseUploadingRef(UPLOADING)}\n${buildCaseUploadingRef(FAILED)}`;

describe("MarkdownFieldUploads：字段下方显示本字段图片的上传进度和失败", () => {
	it("上传中的图片显示进度；上传失败的图片显示原因，可以重试或移除，操作后焦点回到编辑区", () => {
		const field = fieldCallbacks();
		const value = renderUploads(FIELD_TEXT, JOBS, field);
		const progress = screen.getByRole("progressbar", {
			name: "登录页.png 上传进度",
		});
		expect(progress.getAttribute("aria-valuenow")).toBe("45");
		expect(progress.textContent).toContain("45%");
		expect(screen.queryByText("别的字段.png")).toBeNull();
		expect(screen.getByText("上传到存储失败（HTTP 403）")).toBeTruthy();

		fireEvent.click(
			screen.getByRole("button", { name: "重试上传 支付页.png" })
		);
		expect(value.retryUpload).toHaveBeenCalledWith(FAILED);

		fireEvent.click(screen.getByRole("button", { name: "移除 支付页.png" }));
		expect(value.discardUpload).toHaveBeenCalledWith(FAILED);
		expect(field.onReturnFocus).toHaveBeenCalledTimes(2);
	});

	it("不能重试的失败只能移除", () => {
		renderUploads(
			buildCaseUploadingRef(FAILED),
			new Map([
				[
					FAILED,
					{
						fileName: "支付页.png",
						reason: "附件存储未配置",
						retryable: false,
						status: "failed",
					},
				],
			])
		);
		expect(
			screen.queryByRole("button", { name: "重试上传 支付页.png" })
		).toBeNull();
		expect(
			screen.getByRole("button", { name: "移除 支付页.png" })
		).toBeTruthy();
	});

	it("字段中没有上传中的图片时不显示任何内容", () => {
		const { container } = render(
			<MarkdownFieldUploads {...fieldCallbacks()} text="纯文字" />
		);
		expect(container.innerHTML).toBe("");
	});

	it("没有上传任务的占位（例如从草稿恢复）显示上传已中断，移除时删掉占位", () => {
		const field = fieldCallbacks();
		const ref = buildCaseUploadingRef(FAILED);
		renderUploads(`看图：${ref}\n${ref}`, new Map(), field);
		expect(screen.getAllByRole("listitem")).toHaveLength(1);
		expect(screen.getByText("上传已中断，请移除后重新粘贴")).toBeTruthy();
		expect(screen.queryByRole("button", { name: RETRY_LABEL })).toBeNull();

		fireEvent.click(screen.getByRole("button", { name: "移除 未完成的图片" }));
		expect(field.onRemoveRef).toHaveBeenCalledWith(FAILED);
	});
});
