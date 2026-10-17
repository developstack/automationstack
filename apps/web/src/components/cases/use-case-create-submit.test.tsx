import { buildCaseAttachmentRef } from "@automationstack/api/lib/case-attachment-ref";
import { act, renderHook } from "@testing-library/react";
import { toast } from "sonner";
import { describe, expect, it, vi } from "vitest";

import { CASE_NAME_FIELD_ID } from "@/components/cases/case-form-validation";
import { emptyCaseFormValues } from "@/components/cases/case-meta";
import { buildCaseUploadingRef } from "@/components/cases/case-upload-placeholder";
import {
	type CaseCreateMutation,
	type CaseCreateSubmitInput,
	useCaseCreateMutation,
	useCaseCreateSubmit,
} from "@/components/cases/use-case-create-submit";
import type { CaseDraftAttachments } from "@/components/cases/use-case-draft-attachments";

const CASE_ID = "3f2a9c1b-7d4e-4f10-9a2b-1c3d5e7f9a0b";
const IMAGE = {
	fileName: "登录页.png",
	id: "44444444-4444-4444-8444-444444444444",
	storageKey: "test-cases/p/c/a.png",
};
const UNUSED_IMAGE = { ...IMAGE, id: "55555555-5555-4555-8555-555555555555" };

const createHandlers = vi.hoisted(() => ({
	current: {} as { onCreated?: (id: string) => void; onDuplicate?: () => void },
}));

vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));
vi.mock("@/components/cases/use-case-mutations", () => ({
	useCreateCase: (handlers: typeof createHandlers.current) => {
		createHandlers.current = handlers;
		return { mutate: vi.fn() };
	},
}));

function setup(
	name: string,
	preconditions = "",
	caseId: string | null = CASE_ID
) {
	const mutate = vi.fn();
	const input: CaseCreateSubmitInput = {
		attachments: {
			pending: [IMAGE, UNUSED_IMAGE],
		} as unknown as CaseDraftAttachments,
		caseId,
		create: { mutate } as unknown as CaseCreateMutation,
		moduleId: "module-1",
		projectId: "project-1",
		values: { ...emptyCaseFormValues(), name, preconditions },
	};
	const hook = renderHook(
		(props: CaseCreateSubmitInput) => useCaseCreateSubmit(props),
		{ initialProps: input }
	);
	return { hook, input, mutate };
}

describe("useCaseCreateSubmit：新建用例时名称的错误显示在字段旁边", () => {
	it("名称为空时不创建，给出名称字段的错误，并把焦点移到名称字段", () => {
		const nameInput = document.createElement("input");
		nameInput.id = CASE_NAME_FIELD_ID;
		document.body.append(nameInput);
		const { hook, mutate } = setup("  ");

		act(() => hook.result.current.submit());

		expect(mutate).not.toHaveBeenCalled();
		expect(hook.result.current.nameError).toBe("请填写用例名称");
		expect(document.activeElement).toBe(nameInput);
		nameInput.remove();
	});

	it("填写名称后错误立即消失，不用等到再次提交；再次提交会创建用例", () => {
		const { hook, input, mutate } = setup("");
		act(() => hook.result.current.submit());
		expect(hook.result.current.nameError).toBe("请填写用例名称");

		hook.rerender({ ...input, values: { ...input.values, name: "下单成功" } });
		expect(hook.result.current.nameError).toBeNull();
		expect(mutate).not.toHaveBeenCalled();

		act(() => hook.result.current.submit());
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

describe("useCaseCreateSubmit：创建前的检查和附件", () => {
	it.each([
		["the new case id is not ready", "", null],
		[
			"an image is still uploading",
			buildCaseUploadingRef("66666666-6666-4666-8666-666666666666"),
			CASE_ID,
		],
	])("does not create the case while %s", (_name, preconditions, caseId) => {
		vi.mocked(toast.error).mockClear();
		const { hook, mutate } = setup("下单成功", preconditions, caseId);
		act(() => hook.result.current.submit());
		expect(mutate).not.toHaveBeenCalled();
		expect(vi.mocked(toast.error).mock.calls.length > 0).toBe(caseId !== null);
	});

	it("sends only the uploaded images that the text references", () => {
		const { hook, mutate } = setup(
			"下单成功",
			buildCaseAttachmentRef(IMAGE.id)
		);
		act(() => hook.result.current.submit());
		expect(mutate.mock.calls[0]?.[0]).toMatchObject({ attachments: [IMAGE] });
	});
});

describe("useCaseCreateMutation：创建成功或重复后清掉草稿", () => {
	it.each([
		["created", () => createHandlers.current.onCreated?.(CASE_ID), "onCreated"],
		["a duplicate", () => createHandlers.current.onDuplicate?.(), "onClose"],
	] as const)("forgets the draft after %s", (_name, fire, callback) => {
		const input = { forget: vi.fn(), onClose: vi.fn(), onCreated: vi.fn() };
		renderHook(() => useCaseCreateMutation(input));
		fire();
		expect(input.forget).toHaveBeenCalledOnce();
		expect(input[callback]).toHaveBeenCalledOnce();
	});
});
