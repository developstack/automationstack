import { describe, expect, it } from "vitest";

import {
	type BootstrapAdminInput,
	decideBootstrapAdmin,
} from "./bootstrap-admin-core";

// apps/server/.env.example 中的开发默认值。与 KNOWN_DEV_SECRETS 的一致性由
// packages/env/src/dev-secrets.test.ts 检查。
const DEV_ADMIN_INITIAL_PASSWORD = "dev-only-admin-password";

const PROD_PASSWORD = "a-real-production-secret";

const emptyDatabase: BootstrapAdminInput = {
	existingUserBlocker: null,
	initialPassword: PROD_PASSWORD,
	localLoginAdminCount: 0,
	localLoginEnabled: true,
	production: true,
	username: "admin",
};

describe("decideBootstrapAdmin：生产环境", () => {
	it("空库并且配置了密码：创建，并且第一次登录后必须修改密码", () => {
		expect(decideBootstrapAdmin(emptyDatabase)).toEqual({
			kind: "create",
			mustChangePassword: true,
			password: PROD_PASSWORD,
		});
	});

	it("空库但没有配置密码：拒绝启动", () => {
		const decision = decideBootstrapAdmin({
			...emptyDatabase,
			initialPassword: undefined,
		});
		expect(decision.kind).toBe("fail");
		expect(decision).toHaveProperty(
			"message",
			expect.stringContaining("ADMIN_INITIAL_PASSWORD")
		);
	});

	it("密码等于开发默认值（含大小写不同、首尾空白）：拒绝启动，信息中不含该值", () => {
		for (const initialPassword of [
			DEV_ADMIN_INITIAL_PASSWORD,
			DEV_ADMIN_INITIAL_PASSWORD.toUpperCase(),
			` ${DEV_ADMIN_INITIAL_PASSWORD} `,
		]) {
			const decision = decideBootstrapAdmin({
				...emptyDatabase,
				initialPassword,
			});
			expect(decision.kind).toBe("fail");
			expect(JSON.stringify(decision).toLowerCase()).not.toContain(
				DEV_ADMIN_INITIAL_PASSWORD
			);
		}
	});

	it("用户名被一个不能本地登录的账号占用：拒绝启动，并写明原因", () => {
		const decision = decideBootstrapAdmin({
			...emptyDatabase,
			existingUserBlocker: "external-account",
		});
		expect(decision.kind).toBe("fail");
		expect(decision).toHaveProperty(
			"message",
			expect.stringContaining("不是本地账号")
		);
	});

	it("禁用或没有密码的账号：提示用 reset-password 脚本恢复", () => {
		for (const blocker of ["disabled", "no-password"] as const) {
			const decision = decideBootstrapAdmin({
				...emptyDatabase,
				existingUserBlocker: blocker,
			});
			expect(decision).toHaveProperty(
				"message",
				expect.stringContaining("scripts/reset-password.ts")
			);
		}
	});

	it("不是管理员的账号：提示修改 ADMIN_USERNAME 或在用户管理页面设为管理员，不提示 reset-password", () => {
		const decision = decideBootstrapAdmin({
			...emptyDatabase,
			existingUserBlocker: "not-admin",
		});
		expect(decision).toHaveProperty(
			"message",
			expect.stringContaining("「用户管理」页面把该账号设为平台管理员")
		);
		expect(JSON.stringify(decision)).not.toContain("reset-password");
	});

	it("外部账号：只提示修改 ADMIN_USERNAME，不提示 reset-password", () => {
		const decision = decideBootstrapAdmin({
			...emptyDatabase,
			existingUserBlocker: "external-account",
		});
		expect(decision).toHaveProperty(
			"message",
			expect.stringContaining("请修改 ADMIN_USERNAME。")
		);
		expect(JSON.stringify(decision)).not.toContain("reset-password");
	});

	it("失败信息不含密码", () => {
		const decision = decideBootstrapAdmin({
			...emptyDatabase,
			existingUserBlocker: "disabled",
		});
		expect(JSON.stringify(decision)).not.toContain(PROD_PASSWORD);
	});
});

describe("decideBootstrapAdmin：已有管理员或本地登录关闭", () => {
	it("已有本地登录管理员：什么都不做，也不检查密码", () => {
		expect(
			decideBootstrapAdmin({
				...emptyDatabase,
				initialPassword: DEV_ADMIN_INITIAL_PASSWORD,
				localLoginAdminCount: 1,
			})
		).toEqual({ kind: "skip", reason: "admin-exists" });
		expect(
			decideBootstrapAdmin({
				...emptyDatabase,
				initialPassword: undefined,
				localLoginAdminCount: 2,
			})
		).toEqual({ kind: "skip", reason: "admin-exists" });
	});

	it("本地登录关闭：什么都不做", () => {
		expect(
			decideBootstrapAdmin({
				...emptyDatabase,
				initialPassword: undefined,
				localLoginEnabled: false,
			})
		).toEqual({ kind: "skip", reason: "local-login-disabled" });
	});
});

describe("decideBootstrapAdmin：非生产环境", () => {
	const devDatabase: BootstrapAdminInput = {
		...emptyDatabase,
		initialPassword: DEV_ADMIN_INITIAL_PASSWORD,
		production: false,
	};

	it("可以使用开发默认值，并且不强制修改密码", () => {
		expect(decideBootstrapAdmin(devDatabase)).toEqual({
			kind: "create",
			mustChangePassword: false,
			password: DEV_ADMIN_INITIAL_PASSWORD,
		});
	});

	it("没有配置密码：只警告并跳过，不让开发服务崩溃", () => {
		expect(
			decideBootstrapAdmin({ ...devDatabase, initialPassword: undefined }).kind
		).toBe("warn");
	});

	it("用户名被占用：只警告并跳过", () => {
		expect(
			decideBootstrapAdmin({ ...devDatabase, existingUserBlocker: "not-admin" })
				.kind
		).toBe("warn");
	});
});
