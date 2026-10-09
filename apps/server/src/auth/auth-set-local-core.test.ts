import { describe, expect, it, vi } from "vitest";

import {
	AUTH_SET_LOCAL_USAGE,
	type AuthSetLocalDeps,
	runAuthSetLocal,
} from "./auth-set-local-core";

const AUDIT_LINE = /^\[审计\] auth-set-local/;

const envDefaults = {
	adminRole: "automationstack-admin",
	clientId: "client-id",
	issuer: "https://casdoor.example.com",
	organization: "automationstack",
	redirectUrl: "https://testcase.example.com/api/auth/casdoor/callback",
};

function deps(overrides: Partial<AuthSetLocalDeps> = {}): AuthSetLocalDeps {
	return {
		envDefaults,
		envProvider: "local",
		forceLocal: vi.fn(() => Promise.resolve()),
		getRow: vi.fn(() => Promise.resolve({ provider: "casdoor" as const })),
		log: vi.fn(),
		warn: vi.fn(),
		...overrides,
	};
}

describe("runAuthSetLocal（§10.5 第 5 项）", () => {
	it("数据库中是 casdoor：改为 local，写一行 [审计] WARN", async () => {
		const run = deps();
		await expect(runAuthSetLocal([], run)).resolves.toEqual({
			kind: "switched",
			source: "database",
		});
		expect(run.forceLocal).toHaveBeenCalledWith(envDefaults);
		expect(run.warn).toHaveBeenCalledTimes(1);
		expect(String(vi.mocked(run.warn).mock.calls[0]?.[0])).toMatch(AUDIT_LINE);
	});

	it("没有数据库行，环境变量是 casdoor：用环境变量的值创建 local 行", async () => {
		const run = deps({
			envProvider: "casdoor",
			getRow: vi.fn(() => Promise.resolve(null)),
		});
		await expect(runAuthSetLocal([], run)).resolves.toEqual({
			kind: "switched",
			source: "env",
		});
		expect(run.forceLocal).toHaveBeenCalledTimes(1);
	});

	it("已经是 local：不修改，不写审计日志", async () => {
		const run = deps({
			getRow: vi.fn(() => Promise.resolve({ provider: "local" as const })),
		});
		await expect(runAuthSetLocal([], run)).resolves.toEqual({
			kind: "already-local",
		});
		expect(run.forceLocal).not.toHaveBeenCalled();
		expect(run.warn).not.toHaveBeenCalled();
	});

	it("没有数据库行，环境变量是 local：不修改", async () => {
		const run = deps({ getRow: vi.fn(() => Promise.resolve(null)) });
		await expect(runAuthSetLocal([], run)).resolves.toEqual({
			kind: "already-local",
		});
	});

	it("有多余参数：报错，不修改", async () => {
		const run = deps();
		await expect(runAuthSetLocal(["casdoor"], run)).resolves.toEqual({
			kind: "error",
			message: AUTH_SET_LOCAL_USAGE,
		});
		expect(run.forceLocal).not.toHaveBeenCalled();
	});
});
