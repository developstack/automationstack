import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { CASE_NAME_FIELD_ID } from "@/components/cases/case-form-validation";
import { emptyCaseFormValues } from "@/components/cases/case-meta";
import {
	type CaseCreateMutation,
	type CaseCreateSubmitInput,
	useCaseCreateSubmit,
} from "@/components/cases/use-case-create-submit";
import type { CaseDraftAttachments } from "@/components/cases/use-case-draft-attachments";
import type {
	ScreenshotUploadOutcome,
	StepScreenshotStore,
} from "@/components/cases/use-step-screenshots";

vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

const CASE_ID = "3f2a9c1b-7d4e-4f10-9a2b-1c3d5e7f9a0b";

const TEXT_IMAGE = {
	fileName: "正文.png",
	id: "22222222-2222-4222-8222-222222222222",
	storageKey: "k/text",
};
const SHOT_IMAGE = { fileName: "截图.png", id: "shot-1", storageKey: "k/shot" };
const LOCAL_STEP = {
	expected: "",
	id: "s1",
	screenshots: ["local:a"],
	step: "",
};

function fakeStore(outcome: ScreenshotUploadOutcome) {
	return {
		progress: null,
		uploadAll: vi.fn(async () => outcome),
	} as unknown as StepScreenshotStore;
}

async function submit(hook: ReturnType<typeof setup>["hook"]) {
	await act(async () => {
		hook.result.current.submit();
		await Promise.resolve();
	});
}

function setup(
	name: string,
	screenshots: StepScreenshotStore = fakeStore({
		attachments: [],
		kind: "ok",
		steps: [LOCAL_STEP],
	})
) {
	const mutate = vi.fn();
	const input: CaseCreateSubmitInput = {
		attachments: {
			pending: [TEXT_IMAGE],
			screenshots,
		} as unknown as CaseDraftAttachments,
		caseId: CASE_ID,
		create: { mutate } as unknown as CaseCreateMutation,
		moduleId: "module-1",
		projectId: "project-1",
		values: {
			...emptyCaseFormValues(),
			name,
			preconditions: `![](attachment:${TEXT_IMAGE.id})`,
			steps: [LOCAL_STEP],
		},
	};
	const hook = renderHook(
		(props: CaseCreateSubmitInput) => useCaseCreateSubmit(props),
		{ initialProps: input }
	);
	return { hook, input, mutate };
}

describe("useCaseCreateSubmit：新建用例时名称的错误显示在字段旁边", () => {
	it("名称为空时不创建，给出名称字段的错误，并把焦点移到名称字段", async () => {
		const nameInput = document.createElement("input");
		nameInput.id = CASE_NAME_FIELD_ID;
		document.body.append(nameInput);
		const { hook, mutate } = setup("  ");

		await submit(hook);

		expect(mutate).not.toHaveBeenCalled();
		expect(hook.result.current.nameError).toBe("请填写用例名称");
		expect(document.activeElement).toBe(nameInput);
		nameInput.remove();
	});

	it("填写名称后错误立即消失，不用等到再次提交；再次提交会创建用例", async () => {
		const { hook, input, mutate } = setup("");
		await submit(hook);
		expect(hook.result.current.nameError).toBe("请填写用例名称");

		hook.rerender({ ...input, values: { ...input.values, name: "下单成功" } });
		expect(hook.result.current.nameError).toBeNull();
		expect(mutate).not.toHaveBeenCalled();

		await submit(hook);
		expect(mutate).toHaveBeenCalledOnce();
		expect(mutate.mock.calls[0]?.[0]).toMatchObject({
			id: CASE_ID,
			moduleId: "module-1",
			name: "下单成功",
			projectId: "project-1",
		});
		expect(hook.result.current.nameError).toBeNull();
	});
});

describe("useCaseCreateSubmit：创建前先上传步骤截图", () => {
	it("uploads nothing before the user saves", () => {
		const store = fakeStore({ failed: 1, kind: "failed" });
		setup("下单成功", store);
		expect(store.uploadAll).not.toHaveBeenCalled();
	});

	it("a failed screenshot upload stops the create", async () => {
		const store = fakeStore({ failed: 1, kind: "failed" });
		const { hook, mutate } = setup("下单成功", store);
		await submit(hook);
		expect(store.uploadAll).toHaveBeenCalledWith([LOCAL_STEP]);
		expect(mutate).not.toHaveBeenCalled();
	});

	it("creates the case with attachment ids and the uploaded draft attachments", async () => {
		const resolved = { ...LOCAL_STEP, screenshots: [SHOT_IMAGE.id] };
		const store = fakeStore({
			attachments: [SHOT_IMAGE],
			kind: "ok",
			steps: [resolved],
		});
		const { hook, mutate } = setup("下单成功", store);
		await submit(hook);
		expect(mutate.mock.calls[0]?.[0]).toMatchObject({
			attachments: [TEXT_IMAGE, SHOT_IMAGE],
			steps: [resolved],
		});
	});
});
