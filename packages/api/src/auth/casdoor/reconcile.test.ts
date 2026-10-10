import { describe, expect, it, vi } from "vitest";

import { effectiveSettings } from "../settings-fixtures";

import { type ReconcileDeps, reconcileCasdoorUsers } from "./reconcile";

vi.mock("@automationstack/db/repositories/casdoor-users-repository", () => ({
	listCasdoorUsers: vi.fn(),
	updateCasdoorUser: vi.fn(),
}));
vi.mock("../settings-store", () => ({ getEffectiveAuthSettings: vi.fn() }));

const ORG = "automationstack";
const SECRET = "client-secret-value-0001";

const casdoorSettings = effectiveSettings({
	adminRole: "automationstack-admin",
	clientId: "client-id",
	clientSecret: { present: true, value: SECRET },
	internalUrl: "http://casdoor.internal:8000",
	issuer: "https://casdoor.example.com",
	organization: ORG,
	provider: "casdoor",
	redirectUrl: "https://testcase.example.com/api/auth/casdoor/callback",
});

function deps(overrides: Partial<ReconcileDeps> = {}): ReconcileDeps {
	return {
		applyChange: vi.fn(() => Promise.resolve(null)),
		clientFor: vi.fn(() =>
			Promise.resolve({
				getRole: vi.fn(() =>
					Promise.resolve({
						isEnabled: true,
						name: "automationstack-admin",
						owner: ORG,
						users: [`${ORG}/alice`],
					})
				),
				listUsers: vi.fn(() =>
					Promise.resolve([
						{
							id: "id-alice",
							isDeleted: false,
							isForbidden: false,
							name: "alice",
							owner: ORG,
						},
						{
							id: "id-bob",
							isDeleted: false,
							isForbidden: true,
							name: "bob",
							owner: ORG,
						},
					])
				),
			})
		),
		getSettings: vi.fn(() => Promise.resolve(casdoorSettings)),
		listLocalUsers: vi.fn(() =>
			Promise.resolve([
				{
					disabledAt: null,
					externalId: "id-alice",
					id: "local-alice",
					role: "member" as const,
					username: "alice",
				},
				{
					disabledAt: null,
					externalId: "id-bob",
					id: "local-bob",
					role: "member" as const,
					username: "bob",
				},
			])
		),
		log: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
		now: () => new Date("2026-10-09T00:00:00Z"),
		...overrides,
	};
}

describe("reconcileCasdoorUsers", () => {
	it("同步角色和禁用状态", async () => {
		const run = deps();
		await expect(reconcileCasdoorUsers(run)).resolves.toEqual({
			changed: 2,
			kind: "done",
		});
		expect(run.applyChange).toHaveBeenCalledWith("local-alice", {
			role: "admin",
		});
		expect(run.applyChange).toHaveBeenCalledWith("local-bob", {
			disabledAt: new Date("2026-10-09T00:00:00Z"),
		});
	});

	it("local 模式：跳过，不访问 Casdoor", async () => {
		const run = deps({
			getSettings: vi.fn(() => Promise.resolve(effectiveSettings())),
		});
		await expect(reconcileCasdoorUsers(run)).resolves.toEqual({
			kind: "skipped",
			reason: "not-casdoor",
		});
		expect(run.clientFor).not.toHaveBeenCalled();
	});

	it("读取 Casdoor 失败：写日志，不修改本地数据，日志中没有 secret", async () => {
		const run = deps({
			clientFor: vi.fn(() =>
				Promise.resolve({
					getRole: vi.fn(() => Promise.resolve(null)),
					listUsers: vi.fn(() =>
						Promise.reject(new Error(`timeout ${SECRET}`))
					),
				})
			),
		});
		await expect(reconcileCasdoorUsers(run)).resolves.toMatchObject({
			kind: "failed",
		});
		expect(run.applyChange).not.toHaveBeenCalled();
		expect(run.listLocalUsers).not.toHaveBeenCalled();
		expect(JSON.stringify(vi.mocked(run.log.error).mock.calls)).not.toContain(
			SECRET
		);
	});

	it("管理员角色不存在：写 WARN，只同步禁用状态", async () => {
		const run = deps({
			clientFor: vi.fn(() =>
				Promise.resolve({
					getRole: vi.fn(() => Promise.resolve(null)),
					listUsers: vi.fn(() => Promise.resolve([])),
				})
			),
		});
		await reconcileCasdoorUsers(run);
		expect(run.log.warn).toHaveBeenCalledWith(
			expect.stringContaining("不修改任何角色")
		);
		for (const [, changes] of vi.mocked(run.applyChange).mock.calls) {
			expect(changes.role).toBeUndefined();
		}
	});
});
