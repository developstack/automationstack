import type { ProjectMemberView } from "@automationstack/db/repositories/project-members-repository";
import type { ProjectRole } from "@automationstack/db/schema/project-members";
import type { UserRole } from "@automationstack/db/schema/users";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ProjectMembersView } from "@/components/project-members/project-members-view";

const PROJECT_ID = "55555555-5555-4555-8555-555555555555";
const MEMBERS_KEY = ["projectMembers", "list", PROJECT_ID];
const SELF_ID = "11111111-1111-4111-8111-111111111111";
const SUSPENDED_HINT = /项目拥有者的管理权限已暂停/;
const PROMOTE_BLOCKED = "设为拥有者（普通用户不能成为拥有者）";

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

function renderAs(role: UserRole) {
	session.role = role;
	const members = MEMBERS.map((row) =>
		row.userId === SELF_ID ? { ...row, platformRole: role } : row
	);
	const queryClient = new QueryClient();
	queryClient.setQueryData(MEMBERS_KEY, members);
	render(
		<QueryClientProvider client={queryClient}>
			<ProjectMembersView projectId={PROJECT_ID} />
		</QueryClientProvider>
	);
}

function openMenuFor(username: string) {
	fireEvent.click(
		screen.getByRole("button", { name: `成员「${username}」操作` })
	);
}

beforeEach(() => {
	session.role = "member";
});

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
	it("普通用户的「设为拥有者」被禁用，并说明原因", async () => {
		renderAs("project_admin");
		openMenuFor("bob");
		const item = await screen.findByRole("menuitem", { name: PROMOTE_BLOCKED });
		expect(item.getAttribute("aria-disabled")).toBe("true");
	});

	it("项目管理员的「设为拥有者」可以选择", async () => {
		renderAs("project_admin");
		openMenuFor("carol");
		const item = await screen.findByRole("menuitem", { name: "设为拥有者" });
		expect(item.getAttribute("aria-disabled")).not.toBe("true");
	});
});
