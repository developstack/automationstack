/**
 * 终态判定是会话状态机的封口处：判错一格，一条正常结束的会话会被 reaper 的下一拍
 * 改写成 `killed`，事后看到的死因就是假的。真库上这条竞态要让容器恰好在收尾那 10 秒
 * 里被判过期才复现，所以判据本身必须是纯的、被逐条钉死的。
 */
import { describe, expect, it } from "vitest";

import { farmSessionStatusEnum } from "../schema/farm-enums";
import {
	FARM_SESSION_ACTIVE_STATUSES,
	FARM_SESSION_TERMINAL_STATUSES,
	isFarmSessionTerminal,
} from "./farm-session-status-core";

describe("isFarmSessionTerminal", () => {
	it("四个终态一律封口", () => {
		expect(isFarmSessionTerminal("completed")).toBe(true);
		expect(isFarmSessionTerminal("failed")).toBe(true);
		expect(isFarmSessionTerminal("timed_out")).toBe(true);
		expect(isFarmSessionTerminal("killed")).toBe(true);
	});

	it("收尾中仍可写——finishing 不是终态，产物与死因都还没落", () => {
		expect(isFarmSessionTerminal("finishing")).toBe(false);
	});

	it("starting / running 可写", () => {
		expect(isFarmSessionTerminal("starting")).toBe(false);
		expect(isFarmSessionTerminal("running")).toBe(false);
	});
});

describe("状态集合的完备性", () => {
	/**
	 * 加了新状态却忘了归类时，这条是唯一会喊出来的地方：漏归类的状态既进不了配额
	 * 统计（槽位泄漏），也拦不住终态双写。
	 */
	it("活跃集合与终态集合把枚举划分干净，无遗漏无重叠", () => {
		const classified = [
			...FARM_SESSION_ACTIVE_STATUSES,
			...FARM_SESSION_TERMINAL_STATUSES,
		];
		expect([...classified].sort()).toEqual(
			[...farmSessionStatusEnum.enumValues].sort()
		);
	});

	it("活跃状态一个都不是终态", () => {
		for (const status of FARM_SESSION_ACTIVE_STATUSES) {
			expect(isFarmSessionTerminal(status)).toBe(false);
		}
	});
});
