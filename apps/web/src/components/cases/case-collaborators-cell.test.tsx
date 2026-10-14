import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CaseCollaboratorsCell } from "@/components/cases/case-collaborators-cell";

const alice = { clientId: "tab-a", name: "alice" };
const bob = { clientId: "tab-b", name: "bob" };

const avatars = (container: HTMLElement) => [
	...container.querySelectorAll<HTMLElement>("[data-collaborator]"),
];

describe("CaseCollaboratorsCell：用例列表的协作者头像", () => {
	it("没有协作者时显示占位符", () => {
		const { container } = render(
			<CaseCollaboratorsCell collaborators={undefined} />
		);
		expect(container.textContent).toBe("—");
		expect(avatars(container)).toHaveLength(0);
	});

	it("头像按钮的名称说明谁在编辑、谁在查看；头像淡入，正在编辑的头像带标记", () => {
		const { container } = render(
			<CaseCollaboratorsCell
				collaborators={{ editors: [alice], viewers: [bob] }}
			/>
		);
		expect(
			screen.getByRole("button", { name: "alice 正在编辑；bob 正在查看" })
		).toBeDefined();
		const [editor, viewer] = avatars(container);
		for (const avatar of [editor, viewer]) {
			expect(avatar?.className).toContain("fade-in-0");
		}
		expect(editor?.dataset.collaborator).toBe("editing");
		expect(viewer?.dataset.collaborator).toBe("viewing");
	});

	it("超过 3 人时显示「+N」，它也淡入", () => {
		const others = ["c", "d"].map((name) => ({ clientId: name, name }));
		const { container } = render(
			<CaseCollaboratorsCell
				collaborators={{ editors: [alice], viewers: [bob, ...others] }}
			/>
		);
		expect(avatars(container)).toHaveLength(3);
		expect(screen.getByText("+1").className).toContain("fade-in-0");
	});
});
