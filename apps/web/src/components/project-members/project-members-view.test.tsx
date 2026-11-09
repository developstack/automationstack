import type { ProjectMemberView } from "@automationstack/db/repositories/project-members-repository";
import type { UserRole } from "@automationstack/db/schema/users";
import { screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { ProjectMembersView } from "@/components/project-members/project-members-view";
import { openMenuItems, renderWithQuery } from "@/test-dom-fixtures";

const PROJECT_ID = "55555555-5555-4555-8555-555555555555";
const MEMBERS_KEY = ["projectMembers", "list", PROJECT_ID];
const SELF_ID = "11111111-1111-4111-8111-111111111111";
const ASK_ADMIN_HINT = /请联系管理员/;

const session = vi.hoisted(() => ({ role: "member" as UserRole }));

vi.mock("@/components/auth/use-session", () => ({
	useCurrentUser: () => ({ id: SELF_ID, role: session.role }),
	useSession: () => ({
		isPending: false,
		user: { id: SELF_ID, role: session.role, username: "alice" },
	}),
}));
vi.mock("@/components/layout/page-transition", () => ({
	PageTransition: ({ children }: { children: ReactNode }) => (
		<div>{children}</div>
	),
}));
vi.mock("@/components/project-members/add-project-member-dialog", () => ({
	AddProjectMemberDialog: () => null,
}));
vi.mock("@/components/project-members/project-member-confirm-dialog", () => ({
	ProjectMemberConfirmDialog: () => null,
}));
vi.mock("@/components/project-members/use-project-member-actions", () => ({
	useProjectMemberActions: () => ({ open: vi.fn() }),
}));
vi.mock("@/utils/orpc", () => ({
	orpc: {
		projectMembers: {
			list: {
				queryOptions: () => ({
					queryFn: () => Promise.resolve([]),
					queryKey: MEMBERS_KEY,
				}),
			},
		},
	},
}));

function member(
	userId: string,
	username: string,
	platformRole: UserRole
): ProjectMemberView {
	return {
		createdAt: new Date("2026-01-01T00:00:00Z"),
		disabledAt: null,
		platformRole,
		userId,
		username,
	};
}

/** 本人、一个普通用户和另一个管理员是项目成员。 */
const MEMBERS = [
	member(SELF_ID, "alice", "member"),
	member("22222222-2222-4222-8222-222222222222", "bob", "member"),
	member("33333333-3333-4333-8333-333333333333", "carol", "admin"),
];

function renderAs(role: UserRole) {
	session.role = role;
	const members = MEMBERS.map((row) =>
		row.userId === SELF_ID ? { ...row, platformRole: role } : row
	);
	renderWithQuery(<ProjectMembersView projectId={PROJECT_ID} />, [
		MEMBERS_KEY,
		members,
	]);
}

describe("ProjectMembersView：只有管理员能管理项目成员", () => {
	it("管理员：可以添加成员，可以移出别人，不能移出自己", async () => {
		renderAs("admin");
		expect(screen.getByRole("button", { name: "添加成员" })).toBeDefined();
		expect(
			screen.queryByRole("button", { name: "成员「alice」操作" })
		).toBeNull();
		expect(await openMenuItems("成员「bob」操作")).toEqual(["移出项目"]);
	});

	it("普通用户：没有添加按钮和操作菜单，看到联系管理员的说明", () => {
		renderAs("member");
		expect(screen.queryByRole("button", { name: "添加成员" })).toBeNull();
		expect(
			screen.queryByRole("button", { name: "成员「bob」操作" })
		).toBeNull();
		expect(screen.getByText(ASK_ADMIN_HINT)).toBeDefined();
	});

	it("角色列：管理员显示「管理员」，其他人显示「成员」", () => {
		renderAs("member");
		const table = within(screen.getByRole("table"));
		expect(table.getAllByText("成员")).toHaveLength(2);
		expect(table.getAllByText("管理员")).toHaveLength(1);
	});
});
