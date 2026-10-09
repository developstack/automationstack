import { describe, expect, it } from "vitest";

import { providerChangeConsequences } from "./auth-settings-labels";

const LOCAL_CASDOOR_USERS =
	"Casdoor 用户不能登录，已登录的会话和 API token 立即失效。";

describe("providerChangeConsequences（§10.5 第 4 项、§2 第 12 项）", () => {
	it("切换到本地：Casdoor 用户不能登录，会话和 API token 立即失效", () => {
		expect(providerChangeConsequences("local")).toContain(LOCAL_CASDOOR_USERS);
	});

	it("切换到本地：说明数据保留，再切到 Casdoor 后恢复", () => {
		expect(providerChangeConsequences("local").join("\n")).toContain(
			"再切到 Casdoor 后，这些用户恢复原账号"
		);
	});

	it("切换到 Casdoor：提示以后切回本地的后果", () => {
		expect(providerChangeConsequences("casdoor").join("\n")).toContain(
			`以后切回本地时，${LOCAL_CASDOOR_USERS}`
		);
	});

	it("不再提示切回本地后可以重置密码", () => {
		for (const target of ["casdoor", "local"] as const) {
			expect(providerChangeConsequences(target).join("\n")).not.toContain(
				"重置密码"
			);
		}
	});
});
