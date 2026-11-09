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
	production: true,
	username: "admin",
};

function decide(overrides: Partial<BootstrapAdminInput>) {
	return decideBootstrapAdmin({ ...emptyDatabase, ...overrides });
}

describe("decideBootstrapAdmin：生产环境", () => {
	it("空库并且配置了密码：创建，并且第一次登录后必须修改密码", () => {
		expect(decide({})).toEqual({
			kind: "create",
			mustChangePassword: true,
			password: PROD_PASSWORD,
		});
	});

	it("空库但没有配置密码：拒绝启动", () => {
		const decision = decide({ initialPassword: undefined });
		expect(decision.kind).toBe("fail");
		expect(decision).toHaveProperty(
			"message",
			expect.stringContaining("ADMIN_INITIAL_PASSWORD")
		);
	});

	it.each([
		DEV_ADMIN_INITIAL_PASSWORD,
		DEV_ADMIN_INITIAL_PASSWORD.toUpperCase(),
		` ${DEV_ADMIN_INITIAL_PASSWORD} `,
	])(
		"密码等于开发默认值（%j）：拒绝启动，信息中不含该值",
		(initialPassword) => {
			const decision = decide({ initialPassword });
			expect(decision.kind).toBe("fail");
			expect(JSON.stringify(decision).toLowerCase()).not.toContain(
				DEV_ADMIN_INITIAL_PASSWORD
			);
		}
	);

	// reset-password 脚本不能把普通用户提升为管理员，所以只对前两种提示它
	it.each([
		["disabled", "scripts/reset-password.ts", true],
		["no-password", "scripts/reset-password.ts", true],
		["not-admin", "数据库中把该账号的 role 改为 admin", false],
	] as const)(
		"用户名被 %s 账号占用：拒绝启动，写明「%s」，信息不含密码",
		(existingUserBlocker, hint, suggestsResetPassword) => {
			const decision = decide({ existingUserBlocker });
			const serialized = JSON.stringify(decision);
			expect(decision.kind).toBe("fail");
			expect(decision).toHaveProperty("message", expect.stringContaining(hint));
			expect(serialized.includes("reset-password")).toBe(suggestsResetPassword);
			expect(serialized).not.toContain(PROD_PASSWORD);
		}
	);
});

describe("decideBootstrapAdmin：已有管理员或本地登录关闭", () => {
	it.each([
		[
			"已有本地登录管理员：什么都不做，也不检查密码",
			{ initialPassword: DEV_ADMIN_INITIAL_PASSWORD, localLoginAdminCount: 1 },
			"admin-exists",
		],
		[
			"已有多个本地登录管理员，没有配置密码：什么都不做",
			{ initialPassword: undefined, localLoginAdminCount: 2 },
			"admin-exists",
		],
	] as const)("%s", (_name, overrides, reason) => {
		expect(decide(overrides)).toEqual({ kind: "skip", reason });
	});
});

describe("decideBootstrapAdmin：非生产环境", () => {
	const dev = {
		initialPassword: DEV_ADMIN_INITIAL_PASSWORD,
		production: false,
	};

	it("可以使用开发默认值，并且不强制修改密码", () => {
		expect(decide(dev)).toEqual({
			kind: "create",
			mustChangePassword: false,
			password: DEV_ADMIN_INITIAL_PASSWORD,
		});
	});

	it.each([
		[
			"没有配置密码：只警告并跳过，不让开发服务崩溃",
			{ initialPassword: undefined },
		],
		["用户名被占用：只警告并跳过", { existingUserBlocker: "not-admin" }],
	] as const)("%s", (_name, overrides) => {
		expect(decide({ ...dev, ...overrides }).kind).toBe("warn");
	});
});
