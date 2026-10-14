import { ORPCError } from "@orpc/client";
import { describe, expect, it } from "vitest";

import { describeMindmapSyncFailure } from "./mindmap-sync-error.ts";

const TITLE = "脑图同步失败，画布已恢复为服务端数据";
const NO_REASON = "服务端没有给出原因，可以重试一次。";

const BLOCKED_MESSAGE =
	"批量操作第 7 项失败：模块「登录」下有 2 条用例被 1 个测试任务引用，无法删除";

describe("describeMindmapSyncFailure：提示的标题说明画布已恢复，说明写具体原因", () => {
	it.each([
		[
			"契约中声明的业务错误：说明是服务端的原因",
			new ORPCError("BAD_REQUEST", { defined: true, message: BLOCKED_MESSAGE }),
			BLOCKED_MESSAGE,
		],
		[
			"中间件拒绝（不是项目成员）：说明也是服务端的原因",
			new ORPCError("FORBIDDEN", { message: "你不是该项目的成员" }),
			"你不是该项目的成员",
		],
		[
			"中间件拒绝（项目不存在）：说明也是服务端的原因",
			new ORPCError("NOT_FOUND", { message: "项目不存在" }),
			"项目不存在",
		],
		[
			"网络中断：说明是网络异常，不显示浏览器的英文原文",
			new TypeError("Failed to fetch"),
			"网络异常或服务暂时不可用，请稍后重试",
		],
	])("%s", (_name, error, description) => {
		expect(describeMindmapSyncFailure(error)).toEqual({
			description,
			title: TITLE,
		});
	});
});

describe("describeMindmapSyncFailure：不显示内部细节", () => {
	it.each([
		[
			"服务端内部错误（5xx）不显示 message",
			new ORPCError("INTERNAL_SERVER_ERROR", {
				message: 'relation "test_run_cases" violates foreign key',
			}),
		],
		[
			"参数校验失败等未声明的 4xx 错误不显示英文原文",
			new ORPCError("BAD_REQUEST", { message: "Input validation failed" }),
		],
		[
			"其他 Error（序列化失败等）不显示 message",
			new Error("Unexpected token <"),
		],
		["被拒的值是 undefined 时也给出说明", undefined],
		["被拒的值是字符串时也给出说明", "boom"],
	])("%s", (_name, error) => {
		expect(describeMindmapSyncFailure(error)).toEqual({
			description: NO_REASON,
			title: TITLE,
		});
	});

	it("没有写 message 时不显示 ORPC 的英文默认句", () => {
		const error = new ORPCError("BAD_REQUEST", { defined: true });

		expect(error.message).toBe("Bad Request");
		expect(describeMindmapSyncFailure(error).description).toBe(NO_REASON);
	});
});
