import type { TestCase } from "@automationstack/db/schema/test-cases";
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useCaseEditor } from "@/components/cases/case-detail-body";
import type {
	ScreenshotUploadOutcome,
	StepScreenshotStore,
} from "@/components/cases/use-step-screenshots";

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

const SAVED = "11111111-1111-4111-8111-111111111111";

const TEST_CASE = {
	caseType: "functional",
	currentVersion: 4,
	id: "case-1",
	maintainer: null,
	name: "登录",
	preconditions: null,
	priority: "P2",
	status: "draft",
	steps: [{ expected: "", id: "s1", screenshots: [SAVED], step: "打开首页" }],
	tags: [],
} as unknown as TestCase;

function setup(outcome: ScreenshotUploadOutcome) {
	mutate.mockClear();
	const store = {
		clear: vi.fn(),
		progress: null,
		uploadAll: vi.fn(async () => outcome),
	} as unknown as StepScreenshotStore;
	const hook = renderHook(() => useCaseEditor("case-1", TEST_CASE, store));
	act(() => hook.result.current.startEditing());
	const { form } = hook.result.current;
	if (form === null) {
		throw new Error("没有进入编辑");
	}
	const step = {
		expected: "",
		id: "s1",
		screenshots: [SAVED, "local:a"],
		step: "打开首页",
	};
	act(() => hook.result.current.setForm({ ...form, steps: [step] }));
	return { hook, step, store };
}

async function save(hook: ReturnType<typeof setup>["hook"]) {
	await act(async () => {
		hook.result.current.handleSave();
		await Promise.resolve();
	});
}

describe("useCaseEditor：保存时先上传步骤截图，再保存用例", () => {
	it("saves the case with attachment ids in editor order", async () => {
		const resolved = {
			expected: "",
			id: "s1",
			screenshots: [SAVED, "id-a"],
			step: "打开首页",
		};
		const { hook, step, store } = setup({
			attachments: [],
			kind: "ok",
			steps: [resolved],
		});
		expect(store.uploadAll).not.toHaveBeenCalled();
		await save(hook);
		expect(store.uploadAll).toHaveBeenCalledWith([step]);
		expect(mutate).toHaveBeenCalledOnce();
		expect(mutate.mock.calls[0]?.[0]).toMatchObject({
			expectedVersion: 4,
			id: "case-1",
			patch: { steps: [resolved] },
		});
	});

	it("does not save the case when a screenshot upload fails", async () => {
		const { hook } = setup({ failed: 1, kind: "failed" });
		await save(hook);
		expect(mutate).not.toHaveBeenCalled();
		expect(hook.result.current.form).not.toBeNull();
	});

	it.each([
		["after a save", () => act(() => savedCallback())],
		[
			"when editing stops",
			(hook: ReturnType<typeof setup>["hook"]) =>
				act(() => hook.result.current.stopEditing()),
		],
	])("leaves the form and drops local screenshots %s", (_name, leave) => {
		const { hook, store } = setup({ failed: 1, kind: "failed" });
		leave(hook);
		expect(hook.result.current.form).toBeNull();
		expect(store.clear).toHaveBeenCalled();
	});
});
