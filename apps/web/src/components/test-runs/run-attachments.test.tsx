import { render, renderHook, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { RunAttachments } from "@/components/test-runs/run-attachments";
import type { RunAttachmentView } from "@/components/test-runs/run-step-attachment-items";
import {
	RunStepAttachmentsProvider,
	useRunStepAttachmentsValue,
} from "@/components/test-runs/run-step-attachments-context";
import { StepAttachmentStorageNotice } from "@/components/test-runs/step-attachment-storage-notice";

const WRITE_CONTROL = /删除|选择文件|上传/;
const STORAGE_NOTICE = /附件存储暂时不可用/;

const mocks = vi.hoisted(() => ({ list: [] as RunAttachmentView[] }));

vi.mock("@/components/test-runs/use-attachment-upload", () => ({
	useAttachmentList: () => ({ data: mocks.list }),
	usePendingStepUploads: () => [],
	useRemoveAttachment: () => ({ mutate: vi.fn() }),
	useUploadStepAttachments: () => ({ mutate: vi.fn() }),
}));

function saved(
	id: string,
	stepId: string | null,
	contentType = "image/png"
): RunAttachmentView {
	return {
		attachment: {
			contentType,
			fileName: `${id}.file`,
			id,
			sizeBytes: 2048,
			stepId,
		},
		url: `https://r2.example/${id}`,
	};
}

beforeEach(() => {
	mocks.list = [];
});

describe("整条用例的附件：只读", () => {
	it("shows the automation and old attachments of the whole case without upload or delete controls", () => {
		mocks.list = [
			saved("auto", null),
			saved("log", null, "text/plain"),
			saved("actual", "s1"),
			saved("deleted", "s9"),
		];
		render(<RunAttachments runCaseId="rc" stepIds={["s1"]} />);
		const section = screen.getByRole("region", { name: "整条用例的附件" });
		expect(
			[...section.querySelectorAll("img")].map((image) =>
				image.getAttribute("alt")
			)
		).toEqual(["auto.file", "deleted.file"]);
		expect(screen.getByText("log.file")).toBeTruthy();
		expect(screen.queryByText("actual.file")).toBeNull();
		expect(screen.queryByRole("button", { name: WRITE_CONTROL })).toBeNull();
		expect(document.querySelector('input[type="file"]')).toBeNull();
	});

	it("shows nothing when the case has only actual attachments of steps", () => {
		mocks.list = [saved("actual", "s1")];
		const { container } = render(
			<RunAttachments runCaseId="rc" stepIds={["s1"]} />
		);
		expect(container.innerHTML).toBe("");
	});
});

describe("实际附件：能不能编辑", () => {
	it.each([
		[true, false, true, false],
		[true, true, false, true],
		[false, false, false, false],
		[false, true, false, false],
	])(
		"editing %s, storage unavailable %s: can edit %s, storage notice %s",
		(editing, storageUnavailable, canEdit, notice) => {
			const { result } = renderHook(() =>
				useRunStepAttachmentsValue({
					editing,
					onStorageUnavailable: vi.fn(),
					runCaseId: "rc",
					storageUnavailable,
				})
			);
			expect(result.current.canEdit).toBe(canEdit);
			render(
				<RunStepAttachmentsProvider value={result.current}>
					<StepAttachmentStorageNotice />
				</RunStepAttachmentsProvider>
			);
			expect(screen.queryByText(STORAGE_NOTICE) !== null).toBe(notice);
		}
	);
});
