import { ORPCError } from "@orpc/client";
import { describe, expect, it } from "vitest";

import {
	describeMindmapSyncFailure,
	MINDMAP_SYNC_FAILED_MESSAGE,
} from "./mindmap-sync-error.ts";

const BLOCKED_MESSAGE =
	"批量操作第 7 项失败：模块「登录」下有 2 条用例被 1 个测试任务引用，无法删除";

describe("describeMindmapSyncFailure：预期内的业务错误", () => {
	it("透出服务端那句原因，并补上「画布已恢复」", () => {
		const error = new ORPCError("BAD_REQUEST", {
			defined: true,
			message: BLOCKED_MESSAGE,
		});

		const message = describeMindmapSyncFailure(error);

		expect(message).toContain(BLOCKED_MESSAGE);
		expect(message).toContain("画布已恢复为服务端数据");
	});
});

describe("describeMindmapSyncFailure：非预期错误一律通用文案", () => {
	it("未声明的 ORPCError（500 之类）不透出 message", () => {
		const error = new ORPCError("INTERNAL_SERVER_ERROR", {
			message: 'relation "test_run_cases" violates foreign key',
		});

		const message = describeMindmapSyncFailure(error);

		expect(message).toBe(MINDMAP_SYNC_FAILED_MESSAGE);
		expect(message).not.toContain("test_run_cases");
	});

	it("普通 Error（网络中断、序列化失败）不透出 message", () => {
		const message = describeMindmapSyncFailure(new Error("fetch failed"));

		expect(message).toBe(MINDMAP_SYNC_FAILED_MESSAGE);
	});

	it("被拒的值根本不是 Error 时也不炸", () => {
		expect(describeMindmapSyncFailure(undefined)).toBe(
			MINDMAP_SYNC_FAILED_MESSAGE
		);
		expect(describeMindmapSyncFailure("boom")).toBe(
			MINDMAP_SYNC_FAILED_MESSAGE
		);
	});

	it("声明过但没写 message 时回落，不把 ORPC 的英文默认句透给用户", () => {
		const error = new ORPCError("BAD_REQUEST", { defined: true });

		expect(error.message).toBe("Bad Request");
		expect(describeMindmapSyncFailure(error)).toBe(MINDMAP_SYNC_FAILED_MESSAGE);
	});
});
