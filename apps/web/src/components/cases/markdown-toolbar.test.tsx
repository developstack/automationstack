import { EditorSelection, EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { MarkdownToolbar } from "@/components/cases/markdown-toolbar";

let view: EditorView | null = null;

function createView(doc: string): EditorView {
	view = new EditorView({
		parent: document.body,
		state: EditorState.create({
			doc,
			selection: EditorSelection.range(0, doc.length),
		}),
	});
	return view;
}

afterEach(() => {
	view?.destroy();
	view = null;
});

describe("MarkdownToolbar：格式按钮和键盘焦点", () => {
	it("只有一个按钮在 Tab 顺序中，左右方向键跨过分组移动焦点", () => {
		render(<MarkdownToolbar view={createView("登录")} />);
		const buttons = screen.getAllByRole("button");
		expect(buttons.map((button) => button.tabIndex)).toEqual([
			0, -1, -1, -1, -1,
		]);

		buttons[0]?.focus();
		fireEvent.keyDown(buttons[0] as HTMLElement, { key: "ArrowLeft" });
		expect(document.activeElement).toBe(buttons[4]);
		fireEvent.keyDown(buttons[4] as HTMLElement, { key: "ArrowRight" });
		expect(document.activeElement).toBe(buttons[0]);
	});

	it("按钮有可见的提示，点击「加粗」包住选中的文字", () => {
		const editor = createView("登录");
		render(<MarkdownToolbar view={editor} />);
		const bold = screen.getByRole("button", { name: "加粗" });
		expect(bold.getAttribute("title")).toBe("加粗");
		fireEvent.click(bold);
		expect(editor.state.doc.toString()).toBe("**登录**");
	});

	it("没有附件上传时提示只写 Markdown", () => {
		render(<MarkdownToolbar view={createView("")} />);
		expect(screen.getByRole("toolbar").textContent).toContain("Markdown");
		expect(screen.getByRole("toolbar").textContent).not.toContain("可粘贴图片");
	});
});
