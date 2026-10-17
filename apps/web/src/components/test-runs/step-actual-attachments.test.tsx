import type { CaseStep } from "@automationstack/db/schema/test-cases";
import type { TestRunStepResult } from "@automationstack/db/schema/test-runs";
import {
	fireEvent,
	render,
	screen,
	waitFor,
	within,
} from "@testing-library/react";
import { toast } from "sonner";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RunAttachmentView } from "@/components/test-runs/run-step-attachment-items";
import {
	RunStepAttachmentsProvider,
	type RunStepAttachmentsValue,
} from "@/components/test-runs/run-step-attachments-context";
import { RunStepCard } from "@/components/test-runs/run-step-card";

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const STEP: CaseStep = { expected: "进入工作台", id: "s2", step: "登录" };
const ADD = "给第 2 步添加实际附件";
const ACTUAL_FIELD = /实际结果/;
const THUMB_NAME = /^查看/;
const PNG = new File(["x"], "超时.png", { type: "image/png" });

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
			sizeBytes: 1,
			stepId,
		},
		url: `https://r2.example/${id}`,
	};
}

function renderStep(
	overrides: Partial<RunStepAttachmentsValue> = {},
	editing = true,
	/** null 表示步骤还没有判定。 */
	result: TestRunStepResult | null = "failed"
) {
	const value: RunStepAttachmentsValue = {
		canEdit: editing,
		list: [
			saved("shot", "s2"),
			saved("rec", "s2", "video/webm"),
			saved("other", "s1"),
			saved("old", null),
		],
		pending: [],
		remove: vi.fn(),
		storageUnavailable: false,
		upload: vi.fn(),
		...overrides,
	};
	render(
		<RunStepAttachmentsProvider value={value}>
			<RunStepCard
				actualResult=""
				editing={editing}
				imageUrls={new Map()}
				index={1}
				onActualResultChange={vi.fn()}
				onPick={vi.fn()}
				result={result ?? undefined}
				step={STEP}
			/>
		</RunStepAttachmentsProvider>
	);
	return value;
}

const strip = () => screen.getByRole("list", { name: "第 2 步实际附件" });
const column = () => screen.getByRole("region", { name: ACTUAL_FIELD });
const filesOf = (...files: File[]) => ({ files, types: ["Files"] });

beforeEach(() => {
	vi.clearAllMocks();
});

describe("实际结果一栏中的实际附件", () => {
	it.each([
		["editing", true],
		["read-only (also submitted or voided)", false],
	])(
		"shows only the actual attachments of this step, recordings with a play preview, when %s",
		(_mode, editing) => {
			renderStep({}, editing);
			const thumbs = within(strip()).getAllByRole("button", {
				name: THUMB_NAME,
			});
			expect(thumbs.map((thumb) => thumb.getAttribute("aria-label"))).toEqual([
				"查看shot.file",
				"查看rec.file",
			]);
			expect(strip().querySelector("video")?.getAttribute("src")).toBe(
				"https://r2.example/rec"
			);
			expect(screen.queryByRole("button", { name: ADD }) !== null).toBe(
				editing
			);
		}
	);

	it("does not add actual attachments to a step without a verdict, but still shows the saved ones", () => {
		const value = renderStep({}, true, null);
		expect(screen.queryByRole("button", { name: ADD })).toBeNull();
		fireEvent.drop(column(), { dataTransfer: filesOf(PNG) });
		expect(value.upload).not.toHaveBeenCalled();
		expect(
			within(strip()).getAllByRole("button", { name: THUMB_NAME })
		).toHaveLength(2);
	});

	it.each([
		[
			"the 「+」 button",
			() =>
				fireEvent.change(
					document.querySelector('input[type="file"]') as HTMLInputElement,
					{ target: { files: [PNG] } }
				),
		],
		[
			"a paste into the actual result box",
			() =>
				fireEvent.paste(screen.getByRole("textbox", { name: ACTUAL_FIELD }), {
					clipboardData: filesOf(PNG),
				}),
		],
		[
			"a drop onto the actual result column",
			() => fireEvent.drop(column(), { dataTransfer: filesOf(PNG) }),
		],
	])("uploads files to this step from %s", (_source, add) => {
		const value = renderStep();
		add();
		expect(value.upload).toHaveBeenCalledWith({ files: [PNG], stepId: "s2" });
	});

	it("accepts recordings in the file picker", () => {
		renderStep();
		expect(
			document.querySelector('input[type="file"]')?.getAttribute("accept")
		).toContain("video/webm");
	});

	it.each([
		["read-only", { canEdit: false }],
		["storage is not configured", { canEdit: false, storageUnavailable: true }],
	])(
		"ignores pasted and dropped files when %s, keeps the text paste, and stops the browser from opening a dropped file",
		(_name, overrides) => {
			const value = renderStep(overrides);
			const pasted = fireEvent.paste(
				screen.getByRole("textbox", { name: ACTUAL_FIELD }),
				{ clipboardData: filesOf(PNG) }
			);
			const dropped = fireEvent.drop(column(), {
				dataTransfer: filesOf(PNG),
			});
			expect(pasted).toBe(true);
			expect(dropped).toBe(false);
			expect(value.upload).not.toHaveBeenCalled();
			expect(screen.queryByRole("button", { name: ADD })).toBeNull();
		}
	);

	it("leaves a dragged text to the text box", () => {
		renderStep();
		const dropped = fireEvent.drop(column(), {
			dataTransfer: { files: [], types: ["text/plain"] },
		});
		expect(dropped).toBe(true);
	});

	it("does not upload a file in a format that is not allowed, and does not count it toward the maximum", () => {
		const list = Array.from({ length: 8 }, (_unused, index) =>
			saved(`s${index}`, "s2")
		);
		const value = renderStep({ list });
		const gif = new File(["x"], "动图.gif", { type: "image/gif" });
		fireEvent.drop(column(), { dataTransfer: filesOf(gif, PNG) });
		expect(value.upload).toHaveBeenCalledWith({ files: [PNG], stepId: "s2" });
		expect(toast.error).toHaveBeenCalledTimes(1);
		expect(vi.mocked(toast.error).mock.calls[0]?.[0]).toContain("动图.gif");
	});

	it("uploads only up to 9 actual attachments on a step and tells how many files were left out", () => {
		const list = Array.from({ length: 7 }, (_unused, index) =>
			saved(`s${index}`, "s2")
		);
		const value = renderStep({
			list,
			pending: [{ id: "p", kind: "image", name: "p.png", stepId: "s2" }],
		});
		const files = ["a", "b", "c"].map(
			(name) => new File(["x"], `${name}.png`, { type: "image/png" })
		);
		fireEvent.drop(column(), { dataTransfer: filesOf(...files) });
		expect(value.upload).toHaveBeenCalledWith({
			files: [files[0]],
			stepId: "s2",
		});
		expect(toast.error).toHaveBeenCalledWith(
			"一个步骤最多 9 个实际附件，2 个文件没有上传"
		);
	});

	it("hides the 「+」 button when a step has 9 actual attachments", () => {
		renderStep({
			list: Array.from({ length: 9 }, (_unused, index) =>
				saved(`s${index}`, "s2")
			),
		});
		expect(screen.queryByRole("button", { name: ADD })).toBeNull();
	});

	it("removes one actual attachment after a confirm in the lightbox", async () => {
		const value = renderStep();
		fireEvent.click(
			within(strip()).getByRole("button", { name: "查看rec.file" })
		);
		fireEvent.click(screen.getByRole("button", { name: "删除这个实际附件" }));
		expect(value.remove).not.toHaveBeenCalled();
		const confirm = await screen.findByRole("alertdialog");
		fireEvent.click(within(confirm).getByRole("button", { name: "删除" }));
		await waitFor(() => expect(value.remove).toHaveBeenCalledWith("rec"));
	});

	it("has no delete action in the lightbox when read-only", () => {
		renderStep({}, false);
		fireEvent.click(
			within(strip()).getByRole("button", { name: "查看shot.file" })
		);
		expect(screen.getByRole("dialog")).toBeTruthy();
		expect(
			screen.queryByRole("button", { name: "删除这个实际附件" })
		).toBeNull();
	});
});
