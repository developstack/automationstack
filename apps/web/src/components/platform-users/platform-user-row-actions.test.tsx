import type { AuthSource, PublicUser } from "@automationstack/db/schema/users";
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

function user(authSource: AuthSource, disabledAt: Date | null): PublicUser {
	return {
		authSource,
		createdAt: new Date("2026-01-01T00:00:00Z"),
		disabledAt,
		id: "66666666-6666-4666-8666-666666666666",
		mustChangePassword: false,
		role: "member",
		username: "dave",
	};
}

describe("PlatformUserRowActions：菜单里只有能用的操作", () => {
	it.each<[string, PublicUser, string[]]>([
		[
			"本地用户：可以做账号操作",
			user("local", null),
			["管理项目归属", "重置密码", "设为项目管理员", "设为平台管理员", "停用"],
		],
		[
			"已停用的本地用户：「恢复」代替「停用」",
			user("local", new Date("2026-02-01T00:00:00Z")),
			["管理项目归属", "重置密码", "设为项目管理员", "设为平台管理员", "恢复"],
		],
		[
			"Casdoor 用户：菜单里没有账号操作，只能管理项目归属",
			user("casdoor", null),
			["管理项目归属"],
		],
	])("%s", async (_name, row, items) => {
		render(<PlatformUserRowActions projects={[]} user={row} />);
		expect(await openMenuItems("用户「dave」操作")).toEqual(items);
	});
});
