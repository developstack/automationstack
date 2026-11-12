import type { EditorView } from "@codemirror/view";
import { act, renderHook } from "@testing-library/react";
import type { FocusEvent } from "react";
import { describe, expect, it } from "vitest";

import {
	type FieldFocusLoss,
	useFieldActivation,
} from "@/components/cases/use-markdown-field-activation";

const focusEvent = {
	target: { selectionStart: 0, value: "" },
} as unknown as FocusEvent<HTMLTextAreaElement>;

const view = {} as EditorView;

function startEditing() {
	const hook = renderHook(() => useFieldActivation());
	act(() => hook.result.current.handleFocus(focusEvent));
	expect(hook.result.current.editing).toBe(true);
	return hook;
}

describe("useFieldActivation：textarea 换成编辑器时的焦点", () => {
	it.each<[string, FieldFocusLoss, boolean, boolean]>([
		["编辑器还没有显示时，焦点丢失不退出编辑", "lost", false, true],
		["编辑器还没有显示时，用户把焦点移走就退出编辑", "moved", false, false],
		["编辑器显示后，焦点丢失退出编辑", "lost", true, false],
		["编辑器显示后，用户把焦点移走就退出编辑", "moved", true, false],
	])("%s", (_name, loss, editorShown, stillEditing) => {
		const { result } = startEditing();
		if (editorShown) {
			act(() => result.current.handleEditorView(view));
		}
		act(() => result.current.handleFocusOut(loss));
		expect(result.current.editing).toBe(stillEditing);
	});

	it("编辑器关闭（view 为 null）不结束等待：再次进入编辑时仍然等待编辑器", () => {
		const { result } = startEditing();
		act(() => result.current.handleEditorView(null));
		act(() => result.current.handleFocusOut("lost"));
		expect(result.current.editing).toBe(true);
	});
});
