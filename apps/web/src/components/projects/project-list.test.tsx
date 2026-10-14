import type { UserRole } from "@automationstack/db/schema/users";
import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ProjectList } from "@/components/projects/project-list";
import { renderWithQuery } from "@/test-dom-fixtures";

const PROJECTS_KEY = ["projects", "list"];
const CLICK_CREATE_HINT = /点击「新建项目」/;
const ASK_OWNER_HINT = /请联系项目 owner/;

const session = vi.hoisted(() => ({ role: "member" as UserRole }));

vi.mock("@/components/auth/use-session", () => ({
	useSession: () => ({
		isPending: false,
		user: { id: "u1", role: session.role, username: "alice" },
	}),
}));
vi.mock("@/components/projects/project-form-dialog", () => ({
	ProjectFormDialog: () => null,
}));
vi.mock("@/components/projects/delete-project-dialog", () => ({
	DeleteProjectDialog: () => null,
}));
vi.mock("@/utils/orpc", () => ({
	orpc: {
		projects: {
			list: {
				queryOptions: () => ({
					queryFn: () => Promise.resolve([]),
					queryKey: PROJECTS_KEY,
				}),
			},
		},
	},
}));

function renderAs(role: UserRole) {
	session.role = role;
	renderWithQuery(<ProjectList />, [PROJECTS_KEY, []]);
}

describe("ProjectList：「新建项目」按钮", () => {
	it.each([
		["admin", "平台管理员"],
		["project_admin", "项目管理员"],
	] as const)("%s（%s）：显示按钮", (role, _label) => {
		renderAs(role);
		expect(screen.getByRole("button", { name: "新建项目" })).toBeDefined();
	});

	it("member（普通用户）：不显示按钮，空状态不提示点击按钮", () => {
		renderAs("member");
		expect(screen.queryByRole("button", { name: "新建项目" })).toBeNull();
		expect(screen.queryByText(CLICK_CREATE_HINT)).toBeNull();
		expect(screen.getByText(ASK_OWNER_HINT)).toBeDefined();
	});
});
