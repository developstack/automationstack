import type { ProjectMemberView } from "@automationstack/db/repositories/project-members-repository";
import type { ProjectRole } from "@automationstack/db/schema/project-members";
import type { UserRole } from "@automationstack/db/schema/users";
import { screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { ProjectMembersView } from "@/components/project-members/project-members-view";
import { openMenuItems, renderWithQuery } from "@/test-dom-fixtures";

const PROJECT_ID = "55555555-5555-4555-8555-555555555555";
const MEMBERS_KEY = ["projectMembers", "list", PROJECT_ID];
const SELF_ID = "11111111-1111-4111-8111-111111111111";
const SUSPENDED_HINT = /项目拥有者的管理权限已暂停/;

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
	role: ProjectRole,
	platformRole: UserRole
): ProjectMemberView {
	return {
		createdAt: new Date("2026-01-01T00:00:00Z"),
		disabledAt: null,
		platformRole,
		role,
		userId,
		username,
	};
}

/** 本人是项目 owner；另有一个普通用户和一个项目管理员是项目成员。 */
const MEMBERS = [
	member(SELF_ID, "alice", "owner", "project_admin"),
	member("22222222-2222-4222-8222-222222222222", "bob", "member", "member"),
	member(
		"33333333-3333-4333-8333-333333333333",
		"carol",
		"member",
		"project_admin"
	),
];

/** 第二个拥有者 */
const DAVE = member(
	"44444444-4444-4444-8444-444444444444",
	"dave",
	"owner",
	"project_admin"
);

function renderAs(role: UserRole, extra: ProjectMemberView[] = []) {
	session.role = role;
	const members = [...MEMBERS, ...extra].map((row) =>
		row.userId === SELF_ID ? { ...row, platformRole: role } : row
	);
	renderWithQuery(<ProjectMembersView projectId={PROJECT_ID} />, [
		MEMBERS_KEY,
		members,
	]);
}

describe("ProjectMembersView：管理项目必须是项目 owner，并且平台角色至少是项目管理员", () => {
	it("项目管理员 + 项目 owner：可以添加成员", () => {
		renderAs("project_admin");
		expect(screen.getByRole("button", { name: "添加成员" })).toBeDefined();
		expect(screen.queryByText(SUSPENDED_HINT)).toBeNull();
	});

	it("降级为普通用户的项目 owner：没有管理控件，看到暂停说明和标记", () => {
		renderAs("member");
		expect(screen.queryByRole("button", { name: "添加成员" })).toBeNull();
		expect(
			screen.queryByRole("button", { name: "成员「bob」操作" })
		).toBeNull();
		expect(screen.getByText(SUSPENDED_HINT)).toBeDefined();
		expect(screen.getByText("拥有者（管理权限已暂停）")).toBeDefined();
	});
});

describe("ProjectMembersView：不能把普通用户设为项目拥有者", () => {
	it.each([
		["普通用户：菜单里没有「设为拥有者」", "bob", ["移出项目"]],
		["项目管理员：菜单里有「设为拥有者」", "carol", ["设为拥有者", "移出项目"]],
	])("%s", async (_name, username, items) => {
		renderAs("project_admin");
		expect(await openMenuItems(`成员「${username}」操作`)).toEqual(items);
	});
});

describe("ProjectMembersView：不能降级或移出最后一个拥有者，不能移出自己", () => {
	it("本人是唯一的拥有者：没有能用的操作，不显示操作按钮", () => {
		renderAs("project_admin");
		expect(
			screen.queryByRole("button", { name: "成员「alice」操作" })
		).toBeNull();
	});

	it.each([
		["另有拥有者时本人：只能设为成员", "alice", ["设为成员"]],
		["另一个拥有者：设为成员、移出项目", "dave", ["设为成员", "移出项目"]],
	])("%s", async (_name, username, items) => {
		renderAs("project_admin", [DAVE]);
		expect(await openMenuItems(`成员「${username}」操作`)).toEqual(items);
	});
});
