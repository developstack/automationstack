import { fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AddProjectMemberForm } from "@/components/project-members/add-project-member-form";
import { OWNER_NOT_ELIGIBLE_HINT } from "@/components/project-members/project-member-meta";
import { renderWithQuery } from "@/test-dom-fixtures";

const PROJECT_ID = "55555555-5555-4555-8555-555555555555";
const CANDIDATES_KEY = ["projectMembers", "listCandidates", PROJECT_ID];

vi.mock("@/utils/orpc", () => ({
	orpc: {
		projectMembers: {
			add: { mutationOptions: (options: object) => options },
			list: { key: () => ["projectMembers", "list"] },
			listCandidates: {
				key: () => ["projectMembers", "listCandidates"],
				queryOptions: () => ({
					queryFn: () => Promise.resolve(CANDIDATES),
					queryKey: CANDIDATES_KEY,
				}),
			},
		},
	},
}));

const CANDIDATES = [
	{ id: "u-bob", platformRole: "member", username: "bob" },
	{ id: "u-carol", platformRole: "project_admin", username: "carol" },
	{ id: "u-dave", platformRole: "admin", username: "dave" },
];

/** 打开选择框，返回各选项的文字 */
async function openOptions(name: string): Promise<string[]> {
	fireEvent.click(screen.getByRole("combobox", { name }));
	const listbox = await screen.findByRole("listbox");
	return within(listbox)
		.getAllByRole("option")
		.map((option) => option.textContent ?? "");
}

/** Base UI 只接受从选项上按下的鼠标点击，所以先按下再点击 */
async function pickAccount(username: string) {
	fireEvent.click(screen.getByRole("combobox", { name: "账号" }));
	const option = await screen.findByRole("option", { name: username });
	fireEvent.pointerDown(option);
	fireEvent.click(option);
}

function renderForm() {
	renderWithQuery(
		<AddProjectMemberForm onClose={vi.fn()} projectId={PROJECT_ID} />,
		[CANDIDATES_KEY, CANDIDATES]
	);
}

describe("AddProjectMemberForm：项目角色只列出能选的角色", () => {
	it("还没选账号：只有「成员」", async () => {
		renderForm();
		expect(await openOptions("项目角色")).toEqual(["成员"]);
	});

	it.each([
		["普通用户：没有「拥有者」，字段下说明原因", "bob", ["成员"], true],
		["项目管理员：有「拥有者」", "carol", ["成员", "拥有者"], false],
		["平台管理员：有「拥有者」", "dave", ["成员", "拥有者"], false],
	])("%s", async (_name, username, options, hint) => {
		renderForm();
		await pickAccount(username);
		expect(await openOptions("项目角色")).toEqual(options);
		expect(screen.queryByText(OWNER_NOT_ELIGIBLE_HINT) !== null).toBe(hint);
	});
});
