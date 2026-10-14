import type { User } from "@automationstack/db/schema/users";
import { call, ORPCError } from "@orpc/server";
import { describe, expect, it, vi } from "vitest";

import { protectedProcedure } from "../index";
import { callContext, testUser } from "../test-fixtures";
import {
	isBlockedByPasswordChange,
	isPasswordChangeExempt,
	PASSWORD_CHANGE_REQUIRED,
	PASSWORD_CHANGE_REQUIRED_STATUS,
} from "./password-change-gate";

vi.mock("@automationstack/db/repositories/project-members-repository", () => ({
	getProjectRole: vi.fn(),
}));

const baseUser = testUser();
const mustChange = testUser({ mustChangePassword: true });

const probe = protectedProcedure.handler(() => "ok");

function callAs(user: User | null, path: string[]) {
	return call(probe, undefined, { context: callContext(user), path });
}

describe("isPasswordChangeExempt", () => {
	it.each([
		["auth", "me"],
		["auth", "logout"],
		["auth", "changePassword"],
	])("%s.%s 豁免", (...path) => {
		expect(isPasswordChangeExempt(path)).toBe(true);
	});

	it.each([
		["auth", "login"],
		["projects", "list"],
		["users", "resetPassword"],
		["changePassword"],
	])("%s 不豁免", (...path) => {
		expect(isPasswordChangeExempt(path)).toBe(false);
	});
});

describe("isBlockedByPasswordChange", () => {
	it("不需要修改密码时，什么接口都不拦", () => {
		expect(isBlockedByPasswordChange(baseUser, ["projects", "list"])).toBe(
			false
		);
	});

	it("需要修改密码时，只放行豁免接口", () => {
		expect(isBlockedByPasswordChange(mustChange, ["projects", "list"])).toBe(
			true
		);
		expect(
			isBlockedByPasswordChange(mustChange, ["auth", "changePassword"])
		).toBe(false);
	});
});

describe("requireUser：必须修改密码的闸门", () => {
	it("普通用户正常通过", async () => {
		await expect(callAs(baseUser, ["projects", "list"])).resolves.toBe("ok");
	});

	it("必须修改密码的用户调用其他接口：专用错误码，HTTP 403", async () => {
		const result = callAs(mustChange, ["projects", "list"]);
		await expect(result).rejects.toBeInstanceOf(ORPCError);
		await expect(result).rejects.toMatchObject({
			code: PASSWORD_CHANGE_REQUIRED,
			status: PASSWORD_CHANGE_REQUIRED_STATUS,
		});
	});

	it("必须修改密码的用户可以调用 auth.changePassword", async () => {
		await expect(callAs(mustChange, ["auth", "changePassword"])).resolves.toBe(
			"ok"
		);
	});

	it("未登录时仍然是 UNAUTHORIZED，不是修改密码错误", async () => {
		await expect(callAs(null, ["projects", "list"])).rejects.toMatchObject({
			code: "UNAUTHORIZED",
		});
	});
});
