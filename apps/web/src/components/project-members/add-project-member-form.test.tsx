import { fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AddProjectMemberForm } from "@/components/project-members/add-project-member-form";
import { createQueryWrapper, renderRoutes } from "@/test-dom-fixtures";

const PROJECT_ID = "55555555-5555-4555-8555-555555555555";
const CANDIDATES_KEY = ["projectMembers", "listCandidates", PROJECT_ID];
const NO_CANDIDATE_HINT = /没有可以添加的账号/;

vi.mock("@/utils/orpc", () => ({
	orpc: {
		projectMembers: {
			add: { mutationOptions: (options: object) => options },
			list: { key: () => ["projectMembers", "list"] },
			listCandidates: {
				key: () => ["projectMembers", "listCandidates"],
				queryOptions: () => ({ queryKey: CANDIDATES_KEY }),
			},
		},
	},
}));

const CANDIDATES = [
	{ id: "u-bob", username: "bob" },
	{ id: "u-carol", username: "carol" },
];

async function renderForm(candidates: readonly object[]) {
	const Wrapper = createQueryWrapper([CANDIDATES_KEY, candidates]);
	renderRoutes({
		initialPath: "/",
		routes: {
			"/": () => (
				<Wrapper>
					<AddProjectMemberForm onClose={vi.fn()} projectId={PROJECT_ID} />
				</Wrapper>
			),
		},
	});
	return await screen.findByRole("combobox", { name: "账号" });
}

describe("AddProjectMemberForm", () => {
	it("列出还不在项目里的账号，没有项目角色字段，不显示没有账号的提示", async () => {
		fireEvent.click(await renderForm(CANDIDATES));
		const listbox = await screen.findByRole("listbox");
		const labels = within(listbox)
			.getAllByRole("option")
			.map((option) => option.textContent);

		expect(labels).toEqual([
			"选择一个账号（已在项目里的不再列出）",
			"bob",
			"carol",
		]);
		expect(screen.queryByRole("combobox", { name: "项目角色" })).toBeNull();
		expect(screen.queryByText(NO_CANDIDATE_HINT)).toBeNull();
	});

	it("没有可以添加的账号：说明原因，并链接到「用户」页面；「添加」不可用", async () => {
		const field = await renderForm([]);

		const hint = screen.getByText(NO_CANDIDATE_HINT);
		expect(field.getAttribute("aria-describedby")).toBe(hint.id);
		expect(
			within(hint).getByRole("link", { name: "用户" }).getAttribute("href")
		).toBe("/users");
		expect(
			(screen.getByRole("button", { name: "添加" }) as HTMLButtonElement)
				.disabled
		).toBe(true);
	});
});
