import type { User } from "@automationstack/db/schema/users";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { testUser } from "../../test-fixtures";
import type { CasdoorIdentity } from "./claims";
import { upsertCasdoorLoginUser } from "./login-user";

const mocks = vi.hoisted(() => ({
	createCasdoorUser: vi.fn(),
	getUserByExternalId: vi.fn(),
	getUserByUsername: vi.fn(),
	updateCasdoorUser: vi.fn(),
}));

vi.mock("@automationstack/db/repositories/casdoor-users-repository", () => ({
	createCasdoorUser: mocks.createCasdoorUser,
	updateCasdoorUser: mocks.updateCasdoorUser,
}));
vi.mock("@automationstack/db/repositories/users-repository", () => ({
	getUserByExternalId: mocks.getUserByExternalId,
	getUserByUsername: mocks.getUserByUsername,
}));

const EXTERNAL_ID = "4e1fe32c-0000-4000-8000-000000000001";

const identity: CasdoorIdentity = {
	externalId: EXTERNAL_ID,
	role: "admin",
	username: "alice",
};

const shadow = testUser({
	authSource: "casdoor",
	externalId: EXTERNAL_ID,
	id: "33333333-3333-4333-8333-333333333333",
	passwordHash: null,
	role: "member",
	username: "alice",
});

const localAlice: User = {
	...shadow,
	authSource: "local",
	externalId: null,
	id: "44444444-4444-4444-8444-444444444444",
	passwordHash: "hash",
};

beforeEach(() => {
	vi.resetAllMocks();
	mocks.updateCasdoorUser.mockImplementation(
		(id: string, changes: Partial<User>) =>
			Promise.resolve({ ...shadow, ...changes, id })
	);
});

describe("upsertCasdoorLoginUser（D6）", () => {
	it("第一次登录：创建 Casdoor 影子行，角色来自 ID token", async () => {
		mocks.getUserByExternalId.mockResolvedValue(null);
		mocks.createCasdoorUser.mockResolvedValue({ ...shadow, role: "admin" });
		await expect(upsertCasdoorLoginUser(identity, vi.fn())).resolves.toEqual({
			kind: "ok",
			user: { ...shadow, role: "admin" },
		});
		expect(mocks.createCasdoorUser).toHaveBeenCalledWith(identity);
	});

	it("第一次登录，用户名与本地账号冲突：失败并写 WARN，不按用户名关联", async () => {
		mocks.getUserByExternalId.mockResolvedValue(null);
		mocks.createCasdoorUser.mockResolvedValue(null);
		const warn = vi.fn();
		await expect(upsertCasdoorLoginUser(identity, warn)).resolves.toEqual({
			kind: "username-conflict",
		});
		expect(warn).toHaveBeenCalledWith(expect.stringContaining("同名账号"));
		expect(mocks.updateCasdoorUser).not.toHaveBeenCalled();
	});

	it("已有影子行：覆盖角色（admin → member）", async () => {
		mocks.getUserByExternalId.mockResolvedValue({ ...shadow, role: "admin" });
		await upsertCasdoorLoginUser({ ...identity, role: "member" }, vi.fn());
		expect(mocks.updateCasdoorUser).toHaveBeenCalledWith(shadow.id, {
			role: "member",
			username: "alice",
		});
	});

	it("在 Casdoor 中改名，新用户名没有被占用：更新用户名", async () => {
		mocks.getUserByExternalId.mockResolvedValue(shadow);
		mocks.getUserByUsername.mockResolvedValue(null);
		await upsertCasdoorLoginUser({ ...identity, username: "alice2" }, vi.fn());
		expect(mocks.updateCasdoorUser).toHaveBeenCalledWith(shadow.id, {
			role: "admin",
			username: "alice2",
		});
	});

	it("改名后与另一个本地账号冲突：保留原用户名并写 WARN，登录成功", async () => {
		mocks.getUserByExternalId.mockResolvedValue({ ...shadow, username: "old" });
		mocks.getUserByUsername.mockResolvedValue(localAlice);
		const warn = vi.fn();
		const result = await upsertCasdoorLoginUser(identity, warn);
		expect(result.kind).toBe("ok");
		expect(mocks.updateCasdoorUser).toHaveBeenCalledWith(shadow.id, {
			role: "admin",
			username: "old",
		});
		expect(warn).toHaveBeenCalledWith(expect.stringContaining("保留原用户名"));
	});

	it("本地 disabled_at 有值：登录失败，不修改数据", async () => {
		mocks.getUserByExternalId.mockResolvedValue({
			...shadow,
			disabledAt: new Date(),
		});
		await expect(upsertCasdoorLoginUser(identity, vi.fn())).resolves.toEqual({
			kind: "disabled",
		});
		expect(mocks.updateCasdoorUser).not.toHaveBeenCalled();
	});

	it("同时登录：创建失败但另一个请求已经创建了这一行，按已有行处理", async () => {
		mocks.getUserByExternalId
			.mockResolvedValueOnce(null)
			.mockResolvedValueOnce(shadow);
		mocks.createCasdoorUser.mockResolvedValue(null);
		const result = await upsertCasdoorLoginUser(identity, vi.fn());
		expect(result.kind).toBe("ok");
		expect(mocks.updateCasdoorUser).toHaveBeenCalledTimes(1);
	});
});
