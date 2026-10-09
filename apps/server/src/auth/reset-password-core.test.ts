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

	it("NEW_PASSWORD 为空字符串时等于未设置", () => {
		expect(planPasswordReset({ ...base, newPassword: "" })).toMatchObject({
			generated: true,
			password: GENERATED,
		});
	});

	it("使用 NEW_PASSWORD，不标记为打印", () => {
		expect(
			planPasswordReset({ ...base, newPassword: "provided-pass" })
		).toMatchObject({ generated: false, password: "provided-pass" });
	});

	it("NEW_PASSWORD 太短：报错，信息中不含该值", () => {
		const plan = planPasswordReset({ ...base, newPassword: "short" });
		expect(plan.kind).toBe("error");
		expect(JSON.stringify(plan)).not.toContain("short");
	});

	it("禁用的账号：同时解除禁用", () => {
		expect(
			planPasswordReset({
				...base,
				user: { ...localUser, disabledAt: new Date("2026-01-01T00:00:00Z") },
			})
		).toMatchObject({ kind: "reset", reenable: true });
	});

	it("账号不存在：报错", () => {
		expect(planPasswordReset({ ...base, user: null })).toEqual({
			kind: "error",
			message: "账号不存在。",
		});
	});

	it("外部账号：报错", () => {
		expect(
			planPasswordReset({
				...base,
				user: { ...localUser, authSource: "casdoor" },
			}).kind
		).toBe("error");
	});

	it("没有用户名或多余参数：只返回用法，不回显参数", () => {
		expect(planPasswordReset({ ...base, args: [] })).toEqual({
			kind: "error",
			message: RESET_PASSWORD_USAGE,
		});
		const plan = planPasswordReset({
			...base,
			args: ["admin", "secret-in-argv"],
		});
		expect(plan).toEqual({ kind: "error", message: RESET_PASSWORD_USAGE });
		expect(JSON.stringify(plan)).not.toContain("secret-in-argv");
	});
});
