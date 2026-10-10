import {
	CASDOOR_MANAGED_USER_MESSAGE,
	CASDOOR_NO_LOCAL_PASSWORD_MESSAGE,
	CASDOOR_USER_CREATE_MESSAGE,
} from "@automationstack/api/auth/casdoor/managed-users";
import { describe, expect, it } from "vitest";

import {
	AUTH_SOURCE_LABEL,
	accountSourceNote,
	CASDOOR_MANAGED_HINT,
	CASDOOR_UNUSABLE_IN_LOCAL_HINT,
	createUserAccess,
	platformUserActionAccess,
} from "./platform-user-access";

const local = { authSource: "local" } as const;
const casdoor = { authSource: "casdoor" } as const;

describe("platformUserActionAccess", () => {
	it("casdoor 模式下的 Casdoor 用户：锁定账号操作，提示在 Casdoor 中管理", () => {
		expect(platformUserActionAccess(casdoor, "casdoor")).toEqual({
			accountActions: false,
			hint: CASDOOR_MANAGED_HINT,
		});
	});

	it("casdoor 模式下的本地用户：可以操作（应急管理员由本系统管理）", () => {
		expect(platformUserActionAccess(local, "casdoor").accountActions).toBe(
			true
		);
	});

	it("local 模式的 Casdoor 用户：锁定账号操作（包括重置密码），提示不能使用", () => {
		expect(platformUserActionAccess(casdoor, "local")).toEqual({
			accountActions: false,
			hint: CASDOOR_UNUSABLE_IN_LOCAL_HINT,
		});
		expect(CASDOOR_UNUSABLE_IN_LOCAL_HINT).toBe(
			"Casdoor 账号，本地登录模式下不能使用"
		);
	});

	it("local 模式的本地用户：可以操作", () => {
		expect(platformUserActionAccess(local, "local")).toEqual({
			accountActions: true,
			hint: null,
		});
	});

	it("还没有读到认证方式：Casdoor 用户仍然锁定，本地用户不锁定", () => {
		expect(platformUserActionAccess(casdoor, null)).toEqual({
			accountActions: false,
			hint: CASDOOR_MANAGED_HINT,
		});
		expect(platformUserActionAccess(local, null).accountActions).toBe(true);
	});

	it("提示与服务端错误信息的说法一致", () => {
		expect(CASDOOR_MANAGED_USER_MESSAGE).toContain(CASDOOR_MANAGED_HINT);
		expect(CASDOOR_NO_LOCAL_PASSWORD_MESSAGE).toContain("Casdoor 账号");
	});
});

describe("accountSourceNote", () => {
	it("只在 local 模式下为 Casdoor 用户显示「不能使用」", () => {
		expect(accountSourceNote(casdoor, "local")).toBe(
			CASDOOR_UNUSABLE_IN_LOCAL_HINT
		);
		expect(accountSourceNote(casdoor, "casdoor")).toBeNull();
		expect(accountSourceNote(casdoor, null)).toBeNull();
		expect(accountSourceNote(local, "local")).toBeNull();
	});
});

describe("createUserAccess", () => {
	it("casdoor 模式：关闭创建用户", () => {
		const access = createUserAccess("casdoor");
		expect(access.allowed).toBe(false);
		expect(access.hint).toContain("Casdoor 模式下不能在本系统中创建用户");
		expect(CASDOOR_USER_CREATE_MESSAGE).toContain(
			"Casdoor 模式下不能在本系统中创建用户"
		);
	});

	it("local 模式或还没有读到认证方式：可以创建", () => {
		expect(createUserAccess("local")).toEqual({ allowed: true, hint: null });
		expect(createUserAccess(null)).toEqual({ allowed: true, hint: null });
	});
});

describe("AUTH_SOURCE_LABEL", () => {
	it("本地 / Casdoor", () => {
		expect(AUTH_SOURCE_LABEL).toEqual({ casdoor: "Casdoor", local: "本地" });
	});
});
