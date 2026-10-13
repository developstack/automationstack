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

const CASE_ID = "3f2a9c1b-7d4e-4f10-9a2b-1c3d5e7f9a0b";

function setup(name: string) {
	const mutate = vi.fn();
	const input: CaseCreateSubmitInput = {
		attachments: { pending: [] } as unknown as CaseDraftAttachments,
		caseId: CASE_ID,
		create: { mutate } as unknown as CaseCreateMutation,
		moduleId: "module-1",
		projectId: "project-1",
		values: { ...emptyCaseFormValues(), name },
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

	it("填写名称后再次提交会创建用例，错误消失", () => {
		const { hook, input, mutate } = setup("");
		act(() => hook.result.current.submit());

		hook.rerender({ ...input, values: { ...input.values, name: "下单成功" } });
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

	it("填写名称后错误立即消失，不用等到再次提交", () => {
		const { hook, input, mutate } = setup("");
		act(() => hook.result.current.submit());
		expect(hook.result.current.nameError).toBe("请填写用例名称");

		hook.rerender({ ...input, values: { ...input.values, name: "支" } });

		expect(hook.result.current.nameError).toBeNull();
		expect(mutate).not.toHaveBeenCalled();
	});
});
