import { describe, expect, it } from "vitest";

import {
	planPasswordReset,
	RESET_PASSWORD_USAGE,
	type ResetPasswordInput,
} from "./reset-password-core";

const GENERATED = "generated-password-xyz";

const localUser = {
	authSource: "local" as const,
	disabledAt: null,
	id: "33333333-3333-4333-8333-333333333333",
	username: "admin",
};

const base: ResetPasswordInput = {
	args: ["admin"],
	generatePassword: () => GENERATED,
	newPassword: undefined,
	user: localUser,
};

describe("planPasswordReset", () => {
	it("没有 NEW_PASSWORD：生成随机密码，并标记为需要打印", () => {
		expect(planPasswordReset(base)).toEqual({
			generated: true,
			kind: "reset",
			password: GENERATED,
			reenable: false,
			userId: localUser.id,
			username: "admin",
		});
	});

	it.each([
		[
			"NEW_PASSWORD 为空字符串时等于未设置",
			{ newPassword: "" },
			{ generated: true, password: GENERATED },
		],
		[
			"使用 NEW_PASSWORD，不标记为打印",
			{ newPassword: "provided-pass" },
			{ generated: false, password: "provided-pass" },
		],
		[
			"禁用的账号：同时解除禁用",
			{ user: { ...localUser, disabledAt: new Date("2026-01-01T00:00:00Z") } },
			{ reenable: true },
		],
	] as const)("%s", (_name, overrides, expected) => {
		expect(planPasswordReset({ ...base, ...overrides })).toMatchObject({
			kind: "reset",
			...expected,
		});
	});

	it.each([
		[
			"NEW_PASSWORD 太短：报错，信息中不含该值",
			{ newPassword: "short" },
			expect.any(String),
			["short"],
		],
		["账号不存在：报错", { user: null }, "账号不存在。", []],
		[
			"外部账号：报错",
			{ user: { ...localUser, authSource: "casdoor" as const } },
			expect.any(String),
			[],
		],
		["没有用户名：只返回用法", { args: [] }, RESET_PASSWORD_USAGE, []],
		[
			"多余参数：只返回用法，不回显参数",
			{ args: ["admin", "secret-in-argv"] },
			RESET_PASSWORD_USAGE,
			["secret-in-argv"],
		],
	])("%s", (_name, overrides, message, mustNotLeak) => {
		const plan = planPasswordReset({ ...base, ...overrides });
		expect(plan).toEqual({ kind: "error", message });
		for (const value of mustNotLeak) {
			expect(JSON.stringify(plan)).not.toContain(value);
		}
	});
});
