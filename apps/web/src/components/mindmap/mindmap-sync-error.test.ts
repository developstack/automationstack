import { ORPCError } from "@orpc/client";
import { describe, expect, it } from "vitest";

import { describeMindmapSyncFailure } from "./mindmap-sync-error.ts";

const TITLE = "脑图同步失败，画布已恢复为服务端数据";
const NO_REASON = "服务端没有给出原因，可以重试一次。";
const NETWORK_REASON = "网络异常或服务暂时不可用，请稍后重试";

const BLOCKED_MESSAGE =
	"批量操作第 7 项失败：模块「登录」下有 2 条用例被 1 个测试任务引用，无法删除";

describe("describeMindmapSyncFailure：提示的标题说明画布已恢复，说明写具体原因", () => {
	it("契约中声明的业务错误：说明是服务端的原因", () => {
		const error = new ORPCError("BAD_REQUEST", {
			defined: true,
			message: BLOCKED_MESSAGE,
		});

		expect(describeMindmapSyncFailure(error)).toEqual({
			description: BLOCKED_MESSAGE,
			title: TITLE,
		});
	});

	it("中间件拒绝（不是项目成员、项目不存在）：说明也是服务端的原因", () => {
		const forbidden = new ORPCError("FORBIDDEN", {
			message: "你不是该项目的成员",
		});
		const notFound = new ORPCError("NOT_FOUND", { message: "项目不存在" });

		expect(describeMindmapSyncFailure(forbidden).description).toBe(
			"你不是该项目的成员"
		);
		expect(describeMindmapSyncFailure(notFound).description).toBe("项目不存在");
	});

	it("网络中断：说明是网络异常，不显示浏览器的英文原文", () => {
		const result = describeMindmapSyncFailure(new TypeError("Failed to fetch"));

		expect(result).toEqual({ description: NETWORK_REASON, title: TITLE });
	});
});

describe("describeMindmapSyncFailure：不显示内部细节", () => {
	it("服务端内部错误（5xx）不显示 message", () => {
		const error = new ORPCError("INTERNAL_SERVER_ERROR", {
			message: 'relation "test_run_cases" violates foreign key',
		});

		const result = describeMindmapSyncFailure(error);

		expect(result).toEqual({ description: NO_REASON, title: TITLE });
	});

	it("其他 Error（序列化失败等）不显示 message", () => {
		expect(
			describeMindmapSyncFailure(new Error("Unexpected token <")).description
		).toBe(NO_REASON);
	});

	it("被拒的值不是 Error 时也给出说明", () => {
		expect(describeMindmapSyncFailure(undefined).description).toBe(NO_REASON);
		expect(describeMindmapSyncFailure("boom").description).toBe(NO_REASON);
	});

	it("没有写 message 时不显示 ORPC 的英文默认句", () => {
		const error = new ORPCError("BAD_REQUEST", { defined: true });

		expect(error.message).toBe("Bad Request");
		expect(describeMindmapSyncFailure(error).description).toBe(NO_REASON);
	});
});
