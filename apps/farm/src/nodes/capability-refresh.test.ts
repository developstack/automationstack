import type { NodeCapabilities } from "@automationstack/farm-node-protocol/capabilities";
import { describe, expect, it } from "vitest";

import { refreshRequestedCapabilities } from "./capability-refresh";

/**
 * 重探消费的纯逻辑用例。三条判据各自对应一种运维现场，用假 port 就能问清楚，
 * 不必起 WS：办掉、离线留标记、失败留标记。
 */

const CAPS: NodeCapabilities = {
	backend: "local",
	browsers: [
		{ available: true, bin: "/opt/chrome", name: "chrome", version: "141" },
	],
	detectedAtEpochSec: 1_760_000_000,
};

function makeDeps(input: {
	refresh: (nodeId: string) => Promise<NodeCapabilities | null>;
	requested: string[];
}) {
	const saved: string[] = [];
	return {
		deps: {
			control: {
				listRefreshRequestedNodeIds: () => Promise.resolve(input.requested),
				saveNodeCapabilities: (id: string) => {
					saved.push(id);
					return Promise.resolve();
				},
			},
			sources: { refreshNodeCapabilities: input.refresh },
		},
		saved,
	};
}

describe("refreshRequestedCapabilities", () => {
	it("在线节点：探到就落库（仓储那条 UPDATE 顺手清掉标记）", async () => {
		const { deps, saved } = makeDeps({
			refresh: () => Promise.resolve(CAPS),
			requested: ["n-1"],
		});
		await refreshRequestedCapabilities(deps);
		expect(saved).toEqual(["n-1"]);
	});

	it("离线节点：什么都不做，标记留在库里等它连回来", async () => {
		const { deps, saved } = makeDeps({
			refresh: () => Promise.resolve(null),
			requested: ["n-1"],
		});
		await refreshRequestedCapabilities(deps);
		expect(saved).toEqual([]);
	});

	it("一台探失败不牵连后面那台，且失败的那台不落库", async () => {
		const { deps, saved } = makeDeps({
			refresh: (nodeId) =>
				nodeId === "n-1"
					? Promise.reject(new Error("RPC 超时"))
					: Promise.resolve(CAPS),
			requested: ["n-1", "n-2"],
		});
		await refreshRequestedCapabilities(deps);
		expect(saved).toEqual(["n-2"]);
	});
});
