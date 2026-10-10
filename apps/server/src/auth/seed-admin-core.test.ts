import { describe, expect, it } from "vitest";

import { planSeedAdmin, SEED_ADMIN_USAGE } from "./seed-admin-core";

describe("planSeedAdmin", () => {
	it("只有用户名：密码留给脚本随机生成", () => {
		expect(
			planSeedAdmin({ args: [" admin "], newPassword: undefined })
		).toEqual({ kind: "create", password: undefined, username: "admin" });
	});

	it("NEW_PASSWORD 为空字符串时等于未设置", () => {
		expect(planSeedAdmin({ args: ["admin"], newPassword: "" })).toEqual({
			kind: "create",
			password: undefined,
			username: "admin",
		});
	});

	it("使用 NEW_PASSWORD", () => {
		expect(
			planSeedAdmin({ args: ["admin"], newPassword: "provided-pass" })
		).toEqual({ kind: "create", password: "provided-pass", username: "admin" });
	});

	it("NEW_PASSWORD 太短：报错，信息中不含该值", () => {
		const plan = planSeedAdmin({ args: ["admin"], newPassword: "short" });
		expect(plan.kind).toBe("error");
		expect(JSON.stringify(plan)).not.toContain("short");
	});

	it("没有用户名或多余参数：只返回用法，不回显参数", () => {
		expect(planSeedAdmin({ args: [], newPassword: undefined })).toEqual({
			kind: "error",
			message: SEED_ADMIN_USAGE,
		});
		const plan = planSeedAdmin({
			args: ["admin", "secret-in-argv"],
			newPassword: undefined,
		});
		expect(plan).toEqual({ kind: "error", message: SEED_ADMIN_USAGE });
		expect(JSON.stringify(plan)).not.toContain("secret-in-argv");
	});
});
