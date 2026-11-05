import { buildCaseAttachmentRef } from "@automationstack/api/lib/case-attachment-ref";
import type { CaseStep } from "@automationstack/db/schema/test-cases";
import {
	fireEvent,
	render,
	screen,
	waitFor,
	within,
} from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
	type CaseAttachmentContextValue,
	CaseAttachmentProvider,
} from "@/components/cases/case-attachment-context";
import { buildCaseUploadingRef } from "@/components/cases/case-upload-placeholder";
import { StepsEditor } from "@/components/cases/steps-editor";

const SHOT_A = "aaaaaaaa-1111-4222-8333-444444444444";
const SHOT_B = "bbbbbbbb-1111-4222-8333-444444444444";
const UPLOADED = "cccccccc-1111-4222-8333-444444444444";
const TOKEN = "11111111-1111-4111-8111-111111111111";
const PNG = new File(["x"], "登录页.png", { type: "image/png" });

const REMOVE_BUTTON = /移除/;

const shot = (n: number) =>
	`dddddddd-1111-4222-8333-${String(n).padStart(12, "0")}`;

type UploadPasted = NonNullable<CaseAttachmentContextValue["uploadPasted"]>;

/** 模拟上传队列：插入占位，然后上传成功，占位换成附件引用。 */
const uploadThenSucceed: UploadPasted = (_files, target) => {
	const placeholder = buildCaseUploadingRef(TOKEN);
	target.insert(placeholder);
	target.replace(placeholder, buildCaseAttachmentRef(UPLOADED));
};

function renderEditor(
	step: Partial<CaseStep> = {},
	attachments: Partial<CaseAttachmentContextValue> = {}
) {
	const onChange = vi.fn<(steps: CaseStep[]) => void>();
	const uploadPasted = vi.fn<UploadPasted>(uploadThenSucceed);
	const context: CaseAttachmentContextValue = {
		discardUpload: vi.fn(),
		imageUrls: new Map(),
		retryUpload: vi.fn(),
		uploading: false,
		uploadPasted,
		uploads: new Map(),
		...attachments,
	};
	render(
		<CaseAttachmentProvider value={context}>
			<StepsEditor
				onChange={onChange}
				steps={[{ expected: "进入工作台", id: "s1", step: "登录", ...step }]}
			/>
		</CaseAttachmentProvider>
	);
	const lastStep = () => onChange.mock.lastCall?.[0][0];
	return { context, lastStep, onChange, uploadPasted };
}

const strip = (name: string) => screen.getByRole("list", { name });

describe("步骤编辑：操作截图和预期截图", () => {
	it.each([
		["第 1 步操作", "actionScreenshots", "expectedScreenshots"],
		["第 1 步预期结果", "expectedScreenshots", "actionScreenshots"],
	] as const)(
		"an image pasted into 「%s」 goes to %s, and the text does not change",
		(field, group, otherGroup) => {
			const { lastStep, uploadPasted } = renderEditor({
				[group]: [SHOT_A],
			});
			fireEvent.paste(screen.getByLabelText(field), {
				clipboardData: { files: [PNG] },
			});
			expect(uploadPasted.mock.calls[0]?.[0]).toEqual([PNG]);
			expect(lastStep()).toEqual({
				expected: "进入工作台",
				id: "s1",
				step: "登录",
				[group]: [SHOT_A, UPLOADED],
			});
			expect(lastStep()?.[otherGroup]).toBeUndefined();
		}
	);

	it.each([
		["第 1 步操作截图", "给第 1 步添加操作截图", "actionScreenshots"],
		["第 1 步预期截图", "给第 1 步添加预期截图", "expectedScreenshots"],
	] as const)(
		"the strip 「%s」 ends with a + button that adds the chosen images",
		(name, button, group) => {
			const { lastStep } = renderEditor();
			const add = within(strip(name)).getByRole("button", { name: button });
			expect(add).toBeTruthy();
			const input = strip(name).querySelector(
				"input[type=file]"
			) as HTMLInputElement;
			fireEvent.change(input, { target: { files: [PNG] } });
			expect(lastStep()?.[group]).toEqual([UPLOADED]);
		}
	);

	it.each([
		[
			"the group is full",
			{
				actionScreenshots: Array.from({ length: 9 }, (_, index) => shot(index)),
			},
			{},
		],
		["the storage is not configured", {}, { uploadPasted: null }],
	])("hides the + button when %s", (_name, step, attachments) => {
		renderEditor(step, attachments);
		expect(
			screen.queryByRole("button", { name: "给第 1 步添加操作截图" })
		).toBeNull();
	});

	it("removes one screenshot after a confirm in the lightbox", async () => {
		const { lastStep, onChange } = renderEditor({
			actionScreenshots: [SHOT_A, SHOT_B],
		});
		fireEvent.click(screen.getByRole("button", { name: "查看操作截图 2" }));
		fireEvent.click(screen.getByRole("button", { name: "删除这张截图" }));
		expect(onChange).not.toHaveBeenCalled();
		const confirm = await screen.findByRole("alertdialog");
		fireEvent.click(within(confirm).getByRole("button", { name: "删除" }));
		await waitFor(() =>
			expect(lastStep()?.actionScreenshots).toEqual([SHOT_A])
		);
	});

	it("keeps the screenshot when the confirm is cancelled", async () => {
		const { onChange } = renderEditor({ expectedScreenshots: [SHOT_A] });
		fireEvent.click(screen.getByRole("button", { name: "查看预期截图 1" }));
		fireEvent.click(screen.getByRole("button", { name: "删除这张截图" }));
		const confirm = await screen.findByRole("alertdialog");
		fireEvent.click(within(confirm).getByRole("button", { name: "取消" }));
		await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
		expect(onChange).not.toHaveBeenCalled();
	});

	it("lists an interrupted upload under the strip, and 移除 takes it out of the group", () => {
		const { lastStep } = renderEditor({
			actionScreenshots: [SHOT_A, buildCaseUploadingRef(TOKEN)],
		});
		expect(screen.getByText("未完成的图片")).toBeTruthy();
		expect(
			screen.getByRole("button", { name: "查看操作截图 2（上传失败）" })
		).toBeTruthy();
		fireEvent.click(screen.getByRole("button", { name: REMOVE_BUTTON }));
		expect(lastStep()?.actionScreenshots).toEqual([SHOT_A]);
	});
});
