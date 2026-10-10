import type { ConnectionStep } from "@automationstack/api/auth/casdoor/test-connection";
import { ORPCError } from "@orpc/client";
import { describe, expect, it } from "vitest";

import {
	authSettingsSaveProblemOf,
	connectionChecksSummary,
	connectionTestResultOf,
	STEP_STATUS_BADGES,
	STEP_STATUS_LABELS,
} from "./auth-connection-checks-meta";

const passed: ConnectionStep = {
	detail: null,
	id: "discovery",
	label: "发现文档和 JWKS",
	status: "passed",
};
const failed: ConnectionStep = {
	detail: "Casdoor 拒绝了 client_credentials 请求",
	id: "token",
	label: "用 client_credentials 获取管理 token",
	status: "failed",
};
const skipped: ConnectionStep = {
	detail: "前一步失败",
	id: "organization",
	label: "读取组织",
	status: "skipped",
};

describe("步骤状态的显示", () => {
	it("通过 / 失败 / 跳过", () => {
		expect(STEP_STATUS_LABELS).toEqual({
			failed: "失败",
			passed: "通过",
			skipped: "跳过",
		});
		expect(STEP_STATUS_BADGES.failed).toBe("destructive");
		expect(STEP_STATUS_BADGES.passed).toBe("default");
		expect(STEP_STATUS_BADGES.skipped).toBe("outline");
	});
});

describe("connectionChecksSummary", () => {
	it("测试连接全部通过", () => {
		expect(
			connectionChecksSummary({
				ok: true,
				source: "test",
				steps: [passed],
				testedAt: new Date(),
			})
		).toBe("测试连接全部通过。");
	});

	it("保存时测试失败：说明没有保存，并给出失败的步数", () => {
		expect(
			connectionChecksSummary({
				ok: false,
				source: "save",
				steps: [passed, failed, skipped],
				testedAt: null,
			})
		).toBe("保存前的测试连接没有通过，没有保存：1 步失败。");
	});
});

describe("connectionTestResultOf", () => {
	it("接受服务端 CONNECTION_TEST_FAILED 的 data", () => {
		const data = { ok: false, steps: [passed, failed, skipped] };
		expect(connectionTestResultOf(data)).toEqual(data);
	});

	it.each([
		null,
		"x",
		{ ok: false },
		{ ok: false, steps: [{ ...failed, status: "unknown" }] },
		{ ok: false, steps: [{ ...failed, id: "other" }] },
	])("形状不对：null（%o）", (data) => {
		expect(connectionTestResultOf(data)).toBeNull();
	});
});

describe("authSettingsSaveProblemOf", () => {
	it("CONNECTION_TEST_FAILED：带失败的步骤", () => {
		const error = new ORPCError("CONNECTION_TEST_FAILED", {
			data: { ok: false, steps: [passed, failed] },
			message: "测试连接没有全部通过，没有保存。请查看失败的步骤。",
		});
		expect(authSettingsSaveProblemOf(error)).toEqual({
			kind: "test-failed",
			message: "测试连接没有全部通过，没有保存。请查看失败的步骤。",
			result: { ok: false, steps: [passed, failed] },
		});
	});

	it("PRECONDITION_FAILED：显示服务端的原因", () => {
		const error = new ORPCError("PRECONDITION_FAILED", {
			message: "没有可以本地登录的管理员",
		});
		expect(authSettingsSaveProblemOf(error)).toEqual({
			kind: "precondition",
			message: "没有可以本地登录的管理员",
		});
	});

	it("BAD_REQUEST：表单错误", () => {
		const error = new ORPCError("BAD_REQUEST", {
			message: "Casdoor 模式需要完整的连接参数。未填写：组织",
		});
		expect(authSettingsSaveProblemOf(error).kind).toBe("invalid");
	});

	it("其他错误和 data 形状不对的 CONNECTION_TEST_FAILED：other", () => {
		expect(authSettingsSaveProblemOf(new Error("network")).kind).toBe("other");
		expect(
			authSettingsSaveProblemOf(
				new ORPCError("CONNECTION_TEST_FAILED", { data: { bad: true } })
			).kind
		).toBe("other");
	});
});
