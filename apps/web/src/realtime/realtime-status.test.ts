import { describe, expect, it } from "vitest";

import { summarizeRealtimeStatus } from "@/realtime/realtime-status";

const presenceOf = (...names: string[]) => names.map((name) => ({ name }));

const CONNECTING = {
	detail: null,
	label: "正在连接实时协作",
	shortLabel: "连接中",
	tone: "connecting",
};

const OFFLINE = {
	detail: "其他人的修改暂时不会同步，正在自动重连",
	label: "实时协作已断开",
	shortLabel: "已断开",
	tone: "offline",
};

describe("summarizeRealtimeStatus：实时协作的连接状态和在线人数", () => {
	it("已连接：显示在线人数", () => {
		expect(
			summarizeRealtimeStatus(
				{ hasConnected: true, status: "open" },
				presenceOf("alice", "bob")
			)
		).toEqual({
			detail: "2 人在线",
			label: "实时协作已连接",
			shortLabel: "2 人在线",
			tone: "online",
		});
	});

	it("同一个用户打开多个标签页时只算一人", () => {
		expect(
			summarizeRealtimeStatus(
				{ hasConnected: true, status: "open" },
				presenceOf("alice", "alice", "bob")
			)
		).toMatchObject({ detail: "2 人在线", shortLabel: "2 人在线" });
	});

	it("已连接但在线名单还没到：至少算上自己", () => {
		expect(
			summarizeRealtimeStatus({ hasConnected: true, status: "open" }, [])
		).toMatchObject({ detail: "1 人在线", shortLabel: "1 人在线" });
	});

	it.each(["closed", "connecting"] as const)(
		"第一次连接成功之前（%s）：显示连接中，不显示断开",
		(status) => {
			expect(
				summarizeRealtimeStatus(
					{ hasConnected: false, status },
					presenceOf("alice")
				)
			).toEqual(CONNECTING);
		}
	);

	it.each(["closed", "connecting"] as const)(
		"连接成功后断开，重连期间（%s）一直显示断开，不显示过时的在线人数",
		(status) => {
			expect(
				summarizeRealtimeStatus(
					{ hasConnected: true, status },
					presenceOf("alice", "bob")
				)
			).toEqual(OFFLINE);
		}
	);
});
