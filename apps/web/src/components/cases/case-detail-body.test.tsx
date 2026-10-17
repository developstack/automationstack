import type { TestCase } from "@automationstack/db/schema/test-cases";
import { act, renderHook } from "@testing-library/react";
import { toast } from "sonner";
import { describe, expect, it, vi } from "vitest";

import { useCaseEditor } from "@/components/cases/case-detail-body";
import { buildCaseUploadingRef } from "@/components/cases/case-upload-placeholder";

const mutate = vi.fn();
let savedCallback: () => void = () => undefined;

vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));
vi.mock("@/components/cases/use-case-mutations", () => ({
	caseSaveBaseVersion: (loaded: number) => loaded,
	useUpdateCase: (onSaved: () => void) => {
		savedCallback = onSaved;
		return {
			clearConflict: vi.fn(),
			conflict: null,
			mutation: { isPending: false, mutate },
		};
	},
}));

const UPLOAD_TOKEN = "22222222-2222-4222-8222-222222222222";

const TEST_CASE = {
	caseType: "functional",
	currentVersion: 4,
	id: "case-1",
	maintainer: null,
	name: "登录",
	preconditions: null,
	priority: "P2",
	status: "draft",
	steps: [{ expected: "", id: "s1", step: "打开首页" }],
	tags: [],
} as unknown as TestCase;

function setup(stepText: string, name = "登录") {
	mutate.mockClear();
	const hook = renderHook(() => useCaseEditor("case-1", TEST_CASE));
	act(() => hook.result.current.startEditing());
	const { form } = hook.result.current;
	if (form === null) {
		throw new Error("没有进入编辑");
	}
	const step = { expected: "进入首页", id: "s1", step: stepText };
	act(() => hook.result.current.setForm({ ...form, name, steps: [step] }));
	return { hook, step };
}

describe("useCaseEditor：保存编辑区", () => {
	it("saves the edited steps against the loaded version", () => {
		const { hook, step } = setup("打开首页并登录");
		act(() => hook.result.current.handleSave());
		expect(mutate).toHaveBeenCalledOnce();
		expect(mutate.mock.calls[0]?.[0]).toMatchObject({
			expectedVersion: 4,
			id: "case-1",
			patch: { steps: [step] },
		});
	});

	it("does not save while an image in the text is uploading", () => {
		const { hook } = setup(`打开首页 ${buildCaseUploadingRef(UPLOAD_TOKEN)}`);
		act(() => hook.result.current.handleSave());
		expect(mutate).not.toHaveBeenCalled();
		expect(toast.error).toHaveBeenCalled();
		expect(hook.result.current.form).not.toBeNull();
	});

	it("does nothing before editing starts", () => {
		mutate.mockClear();
		const hook = renderHook(() => useCaseEditor("case-1", TEST_CASE));
		act(() => hook.result.current.handleSave());
		expect(mutate).not.toHaveBeenCalled();
	});

	it("does not save a case without a name", () => {
		const { hook } = setup("打开首页", " ");
		act(() => hook.result.current.handleSave());
		expect(mutate).not.toHaveBeenCalled();
		expect(hook.result.current.nameError).not.toBeNull();
	});

	it.each([
		["after a save", () => act(() => savedCallback())],
		[
			"when editing stops",
			(hook: ReturnType<typeof setup>["hook"]) =>
				act(() => hook.result.current.stopEditing()),
		],
	])("leaves the form %s", (_name, leave) => {
		const { hook } = setup("打开首页");
		leave(hook);
		expect(hook.result.current.form).toBeNull();
	});
});

describe("useCaseEditor：编辑中用例被他人修改", () => {
	it("载入了新版本（例如有人在表格中改了状态）：保存时仍用开始编辑时的版本，由服务端返回保存冲突", async () => {
		mutate.mockClear();
		const hook = renderHook(
			({ testCase }: { testCase: TestCase }) =>
				useCaseEditor("case-1", testCase),
			{ initialProps: { testCase: TEST_CASE } }
		);
		act(() => hook.result.current.startEditing());
		hook.rerender({
			testCase: { ...TEST_CASE, currentVersion: 5, status: "deprecated" },
		});
		await act(async () => {
			hook.result.current.handleSave();
			await Promise.resolve();
		});
		expect(mutate.mock.calls[0]?.[0]).toMatchObject({ expectedVersion: 4 });
	});
});
