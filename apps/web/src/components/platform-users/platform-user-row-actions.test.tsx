import type { PublicUser, UserRole } from "@automationstack/db/schema/users";
import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { PlatformUserRowActions } from "@/components/platform-users/platform-user-row-actions";
import { openMenuItems } from "@/test-dom-fixtures";

vi.mock("@/components/platform-users/manage-user-projects-dialog", () => ({
	ManageUserProjectsDialog: () => null,
}));
vi.mock("@/components/platform-users/platform-user-confirm-dialog", () => ({
	PlatformUserConfirmDialog: () => null,
}));
vi.mock("@/components/platform-users/reset-password-dialog", () => ({
	ResetPasswordDialog: () => null,
}));
vi.mock("@/components/platform-users/use-platform-user-actions", () => ({
	usePlatformUserActions: () => ({ open: vi.fn() }),
}));

function user(role: UserRole, disabledAt: Date | null): PublicUser {
	return {
		createdAt: new Date("2026-01-01T00:00:00Z"),
		disabledAt,
		hasPassword: true,
		id: "66666666-6666-4666-8666-666666666666",
		mustChangePassword: false,
		role,
		username: "dave",
	};
}

describe("PlatformUserRowActions：菜单里只有能用的操作", () => {
	it.each<[string, PublicUser, string[]]>([
		[
			"普通用户：可以设为管理员",
			user("member", null),
			["管理项目归属", "重置密码", "设为管理员", "停用"],
		],
		[
			"管理员：可以设为普通用户",
			user("admin", null),
			["管理项目归属", "重置密码", "设为普通用户", "停用"],
		],
		[
			"已停用的用户：「恢复」代替「停用」",
			user("member", new Date("2026-02-01T00:00:00Z")),
			["管理项目归属", "重置密码", "设为管理员", "恢复"],
		],
	])("%s", async (_name, row, items) => {
		render(<PlatformUserRowActions projects={[]} user={row} />);
		expect(await openMenuItems("用户「dave」操作")).toEqual(items);
	});
});
