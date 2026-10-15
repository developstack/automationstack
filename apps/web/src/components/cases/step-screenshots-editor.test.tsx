import type { CaseStep } from "@automationstack/db/schema/test-cases";
import { fireEvent, render, screen } from "@testing-library/react";
import { toast } from "sonner";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
	type CaseAttachmentContextValue,
	CaseAttachmentProvider,
} from "@/components/cases/case-attachment-context";
import { CaseForm } from "@/components/cases/case-form";
import {
	type CaseFormValues,
	emptyCaseFormValues,
} from "@/components/cases/case-meta";
import { StepsEditor } from "@/components/cases/steps-editor";
import type {
	LocalScreenshot,
	StepScreenshotStore,
} from "@/components/cases/use-step-screenshots";

vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

const SAVED = "11111111-1111-4111-8111-111111111111";
const LOCAL_FAILED = "local:failed";

const png = (name: string) => new File(["x"], name, { type: "image/png" });

function localShot(
	name: string,
	change: Partial<LocalScreenshot> = {}
): LocalScreenshot {
	return {
		attachmentId: null,
		draft: null,
		error: null,
		file: png(name),
		status: "pending",
		url: `blob:${name}`,
		...change,
	};
}

function fakeStore(available = true): StepScreenshotStore {
	return {
		add: vi.fn((files: readonly File[]) =>
			files.map((file) => `local:${file.name}`)
		),
		available,
		clear: vi.fn(),
		discard: vi.fn(),
		progress: null,
		retry: vi.fn(),
		shots: new Map([
			[
				LOCAL_FAILED,
				localShot("坏图.png", { error: "网络中断", status: "failed" }),
			],
		]),
		uploadAll: vi.fn(),
	};
}

function contextValue(store: StepScreenshotStore): CaseAttachmentContextValue {
	return {
		discardUpload: vi.fn(),
		fileNames: new Map([[SAVED, "登录页.png"]]),
		imageUrls: new Map([[SAVED, "https://r2.example/login.png"]]),
		retryUpload: vi.fn(),
		screenshots: store,
		uploading: false,
		uploadPasted: vi.fn(),
		uploads: new Map(),
	};
}

const STEP: CaseStep = {
	expected: "进入工作台",
	id: "s1",
	screenshots: [SAVED, LOCAL_FAILED],
	step: "输入账号密码",
};

function renderSteps(store = fakeStore(), steps: CaseStep[] = [STEP]) {
	const onChange = vi.fn<(steps: CaseStep[]) => void>();
	render(
		<CaseAttachmentProvider value={contextValue(store)}>
			<StepsEditor onChange={onChange} steps={steps} />
		</CaseAttachmentProvider>
	);
	const lastSteps = () => onChange.mock.lastCall?.[0] ?? [];
	return { lastSteps, onChange, store };
}

function fileInput(): HTMLInputElement {
	const input = document.querySelector<HTMLInputElement>('input[type="file"]');
	if (input === null) {
		throw new Error("没有文件选择框");
	}
	return input;
}

beforeEach(() => {
	vi.mocked(toast.error).mockClear();
});

describe("步骤截图：编辑区的「+」、粘贴、缩略图和删除", () => {
	it.each([
		[
			"selects several images",
			[png("a.png"), png("b.png")],
			["local:a.png", "local:b.png"],
			0,
		],
		[
			"rejects an unsupported file with an error and keeps the rest",
			[new File(["x"], "c.gif", { type: "image/gif" }), png("d.png")],
			["local:d.png"],
			1,
		],
	])("「+」%s", (_name, files, added, errors) => {
		const { lastSteps } = renderSteps();
		const add = screen.getByRole("button", { name: "添加截图" });
		expect(fileInput().multiple).toBe(true);
		expect(fileInput().accept).toBe("image/png,image/jpeg,image/webp");
		fireEvent.click(add);
		fireEvent.change(fileInput(), { target: { files } });
		expect(lastSteps()[0]?.screenshots).toEqual([
			...(STEP.screenshots ?? []),
			...added,
		]);
		expect(toast.error).toHaveBeenCalledTimes(errors);
	});

	it.each(["第 1 步操作", "第 1 步预期结果"])(
		"pasting an image into %s adds a screenshot and leaves the text alone",
		(label) => {
			const { lastSteps, onChange } = renderSteps();
			fireEvent.paste(screen.getByLabelText(label), {
				clipboardData: { files: [png("paste.png")] },
			});
			expect(onChange).toHaveBeenCalledTimes(1);
			expect(lastSteps()).toEqual([
				{ ...STEP, screenshots: [SAVED, LOCAL_FAILED, "local:paste.png"] },
			]);
		}
	);

	it.each([
		[SAVED, 0, false],
		[LOCAL_FAILED, 1, true],
	])("deleting %s needs no confirmation", (id, index, discarded) => {
		const { lastSteps, store } = renderSteps();
		const remove = screen.getAllByRole("button", { name: "删除截图" })[index];
		fireEvent.click(remove as HTMLElement);
		expect(lastSteps()[0]?.screenshots).toEqual(
			(STEP.screenshots ?? []).filter((item) => item !== id)
		);
		expect(vi.mocked(store.discard).mock.calls.length > 0).toBe(discarded);
	});

	it("a failed screenshot offers retry and remove", () => {
		const { lastSteps, store } = renderSteps();
		expect(
			screen.getByRole("img", { name: "上传失败：网络中断" })
		).toBeTruthy();
		fireEvent.click(screen.getByRole("button", { name: "重试上传 坏图.png" }));
		expect(store.retry).toHaveBeenCalledWith(LOCAL_FAILED);
		fireEvent.click(screen.getByRole("button", { name: "移除 坏图.png" }));
		expect(lastSteps()[0]?.screenshots).toEqual([SAVED]);
	});

	it("clicking a thumbnail opens the lightbox at that screenshot", () => {
		renderSteps();
		fireEvent.click(
			screen.getByRole("button", { name: "放大查看 登录页.png" })
		);
		expect(screen.getByRole("dialog")).toBeTruthy();
		expect(screen.getByText("1 / 2")).toBeTruthy();
	});

	it("without R2 the 「+」 button is disabled and says why", () => {
		renderSteps(fakeStore(false));
		const add = screen.getByRole("button", { name: "添加截图" });
		expect(add.hasAttribute("disabled")).toBe(true);
		expect(add.getAttribute("aria-describedby")).toBeTruthy();
		expect(screen.getByText("附件存储（R2）未配置，无法添加截图")).toBeTruthy();
	});

	it("an uploading screenshot shows a spinner on its thumbnail", () => {
		const store = fakeStore();
		const uploading = new Map(store.shots);
		uploading.set("local:up", localShot("上传.png", { status: "uploading" }));
		renderSteps({ ...store, shots: uploading }, [
			{ ...STEP, screenshots: ["local:up"] },
		]);
		expect(screen.getByLabelText("上传中")).toBeTruthy();
	});

	it("shows no screenshot strip without a screenshot store", () => {
		render(
			<CaseAttachmentProvider
				value={{ ...contextValue(fakeStore()), screenshots: null }}
			>
				<StepsEditor onChange={vi.fn()} steps={[STEP]} />
			</CaseAttachmentProvider>
		);
		expect(screen.queryByRole("button", { name: "添加截图" })).toBeNull();
	});

	it("an old step without screenshots shows only the 「+」 button", () => {
		renderSteps(fakeStore(), [{ expected: "", id: "s1", step: "" }]);
		expect(screen.queryAllByRole("button", { name: "删除截图" })).toHaveLength(
			0
		);
		expect(screen.getByRole("button", { name: "添加截图" })).toBeTruthy();
	});
});

describe("前置条件：粘贴图片的行为不变", () => {
	it("uploads the pasted image into the text, not into step screenshots", () => {
		const store = fakeStore();
		const value = contextValue(store);
		const values: CaseFormValues = { ...emptyCaseFormValues(), steps: [STEP] };
		render(
			<CaseAttachmentProvider value={value}>
				<CaseForm onChange={vi.fn()} values={values} />
			</CaseAttachmentProvider>
		);
		fireEvent.paste(screen.getByLabelText("前置条件"), {
			clipboardData: { files: [png("pre.png")] },
		});
		expect(value.uploadPasted).toHaveBeenCalledTimes(1);
		expect(store.add).not.toHaveBeenCalled();
	});
});
