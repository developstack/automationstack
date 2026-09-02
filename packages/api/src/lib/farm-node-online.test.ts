import { describe, expect, it } from "vitest";

import {
	isNodeOnline,
	NODE_HEARTBEAT_INTERVAL_MS,
	NODE_ONLINE_WINDOW_MS,
} from "./farm-node-online";

const NOW = new Date("2026-09-01T12:00:00.000Z").getTime();
const agoBy = (ms: number) => new Date(NOW - ms);

describe("NODE_ONLINE_WINDOW_MS", () => {
	it("正好是三拍心跳", () => {
		expect(NODE_ONLINE_WINDOW_MS).toBe(NODE_HEARTBEAT_INTERVAL_MS * 3);
		expect(NODE_ONLINE_WINDOW_MS).toBe(90_000);
	});
});

describe("isNodeOnline", () => {
	it("从没上报过 = 离线", () => {
		expect(isNodeOnline(null, NOW)).toBe(false);
	});

	it("刚上报过 = 在线", () => {
		expect(isNodeOnline(agoBy(0), NOW)).toBe(true);
		expect(isNodeOnline(agoBy(NODE_HEARTBEAT_INTERVAL_MS), NOW)).toBe(true);
	});

	// 丢一拍、丢两拍都还在窗口里——这正是「容三拍」要保住的那两格
	it("丢掉一两拍仍算在线", () => {
		expect(isNodeOnline(agoBy(NODE_HEARTBEAT_INTERVAL_MS * 2), NOW)).toBe(true);
		expect(isNodeOnline(agoBy(NODE_ONLINE_WINDOW_MS - 1), NOW)).toBe(true);
	});

	it("窗口边界含等号：正好 90 秒还算在线", () => {
		expect(isNodeOnline(agoBy(NODE_ONLINE_WINDOW_MS), NOW)).toBe(true);
		expect(isNodeOnline(agoBy(NODE_ONLINE_WINDOW_MS + 1), NOW)).toBe(false);
	});

	it("超出窗口 = 离线", () => {
		expect(isNodeOnline(agoBy(NODE_ONLINE_WINDOW_MS * 10), NOW)).toBe(false);
	});

	// 节点机器时钟快了会给出「未来」的心跳，不该因此被判离线
	it("未来时间戳算在线", () => {
		expect(isNodeOnline(new Date(NOW + 60_000), NOW)).toBe(true);
	});
});
