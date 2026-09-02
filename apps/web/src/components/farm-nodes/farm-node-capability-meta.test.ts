import { describe, expect, it } from "vitest";

import {
	browserCapabilityTitle,
	capabilitiesEmptyHint,
	capabilityBinLabel,
	capabilityDetectedLabel,
	NODE_REFRESH_POLL_INTERVAL_MS,
	nodeListPollInterval,
	refreshButtonState,
} from "@/components/farm-nodes/farm-node-capability-meta";
import type { FarmNodeRow } from "@/components/farm-nodes/farm-node-meta";

/**
 * 造一行节点。只给这几个函数真正读到的键，其余按最省事的值填——多填的字段
 * 会让读的人以为它们参与了判据。
 */
function nodeRow(patch: Partial<FarmNodeRow>): FarmNodeRow {
	return {
		backend: "local",
		capabilities: null,
		capabilitiesUpdatedAt: null,
		createdAt: new Date(0),
		enabled: true,
		id: "00000000-0000-0000-0000-000000000000",
		lastSeenAt: null,
		maxSlots: 2,
		name: "工位 A",
		online: true,
		refreshPending: false,
		...patch,
	} as FarmNodeRow;
}

describe("nodeListPollInterval", () => {
	it("没有待办就完全不轮询——静止的表不该配一条常驻心跳", () => {
		expect(nodeListPollInterval(undefined)).toBe(false);
		expect(nodeListPollInterval([])).toBe(false);
		expect(nodeListPollInterval([nodeRow({})])).toBe(false);
	});

	it("任意一台在等探测结果就开始轮询", () => {
		expect(
			nodeListPollInterval([nodeRow({}), nodeRow({ refreshPending: true })])
		).toBe(NODE_REFRESH_POLL_INTERVAL_MS);
	});
});

describe("browserCapabilityTitle", () => {
	it("名字 + 版本；带通道时缀在括号里", () => {
		expect(
			browserCapabilityTitle({
				available: true,
				name: "chromium",
				version: "140",
			})
		).toBe("chromium 140");
		expect(
			browserCapabilityTitle({
				available: true,
				channel: "beta",
				name: "firefox",
				version: "129",
			})
		).toBe("firefox 129（beta）");
	});

	it("版本为 null 说成「版本未知」，不留一片空白", () => {
		// 空白那一行看起来像是版本号没加载出来，而它其实就是读不出来
		expect(
			browserCapabilityTitle({
				available: true,
				name: "firefox",
				version: null,
			})
		).toBe("firefox 版本未知");
	});
});

describe("capabilityBinLabel / capabilitiesEmptyHint", () => {
	it("同一个字段在两种后端下是两样东西，列名跟着变", () => {
		expect(capabilityBinLabel("docker")).toBe("镜像");
		expect(capabilityBinLabel("local")).toBe("路径");
	});

	it("空清单要指出下一步去哪做什么，而不是笼统的「暂无数据」", () => {
		expect(capabilitiesEmptyHint("docker")).toContain("docker pull");
		expect(capabilitiesEmptyHint("local")).toContain("装一个");
	});
});

describe("capabilityDetectedLabel", () => {
	const now = Date.UTC(2026, 0, 1, 12, 0, 0);

	it("从没探测过与「刚探过」是两句不同的话", () => {
		expect(capabilityDetectedLabel(null, now)).toBe("还没有探测过这台机器");
		expect(capabilityDetectedLabel(new Date(now - 120_000), now)).toBe(
			"探测于 2 分钟前"
		);
	});

	it("收字符串也行——这份数据过了一趟 dehydrate/hydrate", () => {
		expect(
			capabilityDetectedLabel(new Date(now - 3_600_000).toISOString(), now)
		).toBe("探测于 1 小时前");
	});
});

describe("refreshButtonState", () => {
	it("离线优先于「已下令」：对着关机的机器等结果是假的进行中", () => {
		const state = refreshButtonState(
			nodeRow({ online: false, refreshPending: true })
		);
		expect(state.disabled).toBe(true);
		expect(state.label).toBe("重新探测");
		expect(state.hint).toBe("这台机器现在离线，上线后生效");
	});

	it("在线且已下令 = 进行中，按钮禁用免得连点", () => {
		const state = refreshButtonState(nodeRow({ refreshPending: true }));
		expect(state.disabled).toBe(true);
		expect(state.label).toBe("探测中…");
	});

	it("在线且没有待办 = 可以按，旁边不占一行解释", () => {
		expect(refreshButtonState(nodeRow({}))).toEqual({
			disabled: false,
			hint: null,
			label: "重新探测",
		});
	});
});
