import {
	CASDOOR_NO_LOCAL_PASSWORD_MESSAGE,
	CASDOOR_USER_CREATE_MESSAGE,
} from "@automationstack/api/auth/casdoor/managed-users";
import { describe, expect, it } from "vitest";

import {
	AUTH_SOURCE_LABEL,
	accountSourceNote,
	createUserAccess,
} from "./platform-user-access";

const local = { authSource: "local" } as const;
const casdoor = { authSource: "casdoor" } as const;

describe("accountSourceNote", () => {
	it("只在 local 模式下为 Casdoor 用户显示「不能使用」", () => {
		expect(accountSourceNote(casdoor, "local")).toBe(
			"Casdoor 账号，本地登录模式下不能使用"
		);
		expect(accountSourceNote(casdoor, "casdoor")).toBeNull();
		expect(accountSourceNote(casdoor, null)).toBeNull();
		expect(accountSourceNote(local, "local")).toBeNull();
	});

	it("提示与服务端错误信息的说法一致", () => {
		expect(CASDOOR_NO_LOCAL_PASSWORD_MESSAGE).toContain("Casdoor 账号");
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
