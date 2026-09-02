import { describe, expect, it } from "vitest";

import type { NodeCapabilities } from "./capabilities";
import {
	type ControlMessage,
	farmToNodeControlSchema,
	nodeToFarmControlSchema,
	parseControl,
	serializeControl,
} from "./control";
import {
	acquireParamsSchema,
	acquireResultSchema,
	farmRpcContracts,
	listManagedResultSchema,
} from "./rpc";

/**
 * hello 里那份能力快照（plan §12：节点是主体，浏览器是它上报的能力）。
 * 故意带上一条 `available: false`：不可用的浏览器**也要能过线**，
 * 「探到了但用不了、原因是什么」正是这份数据最有价值的部分。
 */
const HELLO_CAPABILITIES: NodeCapabilities = {
	backend: "local",
	browsers: [
		{
			available: true,
			bin: "/usr/bin/chromium",
			channel: "stable",
			name: "chromium",
			version: "140.0.7339.80",
		},
		{
			available: false,
			name: "safari",
			reason: "本期不接入",
			version: null,
		},
	],
	detectedAtEpochSec: 1_760_000_000,
};

describe("控制消息往返", () => {
	it("agent→farm 的三种消息都能原样往返", () => {
		const messages: ControlMessage[] = [
			{
				agentVersion: "0.1.0",
				backends: ["local", "docker"],
				capabilities: HELLO_CAPABILITIES,
				token: "tok_abc",
				type: "hello",
			},
			{ activeSlots: 0, type: "heartbeat" },
			{ id: 7, ok: true, type: "result", value: { containerId: "c1" } },
			{ error: "浏览器没装", id: 8, ok: false, type: "result" },
		];
		for (const message of messages) {
			const parsed = parseControl(
				nodeToFarmControlSchema,
				serializeControl(message)
			);
			expect(parsed).toEqual({ kind: "ok", value: message });
		}
	});

	it("farm→agent 的四种消息都能原样往返", () => {
		const messages: ControlMessage[] = [
			{
				backend: "docker",
				maxSlots: 4,
				name: "mac-mini-01",
				nodeId: "node_1",
				type: "helloAck",
			},
			{ reason: "token 不存在", type: "helloReject" },
			{ id: 1, method: "acquire", params: { sessionId: "s1" }, type: "call" },
			{ port: 9222, streamId: 3, type: "openStream" },
		];
		for (const message of messages) {
			const parsed = parseControl(
				farmToNodeControlSchema,
				serializeControl(message)
			);
			expect(parsed).toEqual({ kind: "ok", value: message });
		}
	});
});

describe("方向隔离", () => {
	it("farm 侧那张表解不出 farm 自己才能发的消息", () => {
		const forged = JSON.stringify({
			port: 22,
			streamId: 1,
			type: "openStream",
		});
		expect(parseControl(nodeToFarmControlSchema, forged).kind).toBe("invalid");
	});

	it("agent 侧那张表解不出 agent 自己才能发的消息", () => {
		const forged = JSON.stringify({ activeSlots: 1, type: "heartbeat" });
		expect(parseControl(farmToNodeControlSchema, forged).kind).toBe("invalid");
	});
});

describe("非法控制消息一律拒绝", () => {
	it("不是 JSON", () => {
		const parsed = parseControl(nodeToFarmControlSchema, "{ 不是 json");
		expect(parsed.kind).toBe("invalid");
		expect(parsed.kind === "invalid" && parsed.message).toContain("JSON");
	});

	it("未知的 type", () => {
		expect(
			parseControl(nodeToFarmControlSchema, '{"type":"whatever"}').kind
		).toBe("invalid");
	});

	it.each([
		[
			'{"type":"hello","token":"","backends":["local"],"agentVersion":"1","capabilities":{"backend":"local","browsers":[],"detectedAtEpochSec":1}}',
			"空 token",
		],
		[
			'{"type":"hello","token":"t","backends":[],"agentVersion":"1","capabilities":{"backend":"local","browsers":[],"detectedAtEpochSec":1}}',
			"空 backends",
		],
		[
			'{"type":"hello","token":"t","backends":["k8s"],"agentVersion":"1","capabilities":{"backend":"local","browsers":[],"detectedAtEpochSec":1}}',
			"未知 backend",
		],
		[
			'{"type":"hello","token":"t","backends":["local"],"agentVersion":"1"}',
			"缺 capabilities（老版本 agent 就该被挡在这一行）",
		],
		[
			'{"type":"hello","token":"t","backends":["local"],"agentVersion":"1","capabilities":{"backend":"local","browsers":[],"detectedAtEpochSec":0}}',
			"探测时刻必须为正",
		],
		[
			'{"type":"hello","token":"t","backends":["local"],"agentVersion":"1","capabilities":{"backend":"local","browsers":[{"name":"chrome","version":"140"}],"detectedAtEpochSec":1}}',
			"能力条目缺 available",
		],
		['{"type":"heartbeat","activeSlots":-1}', "负数槽位"],
		['{"type":"heartbeat","activeSlots":1.5}', "非整数槽位"],
		['{"type":"heartbeat"}', "缺字段"],
		['{"type":"result","id":0,"ok":true,"value":null}', "id 必须为正"],
		['{"type":"result","id":1,"ok":false}', "失败必须带 error"],
		['{"type":"result","id":1,"ok":false,"error":""}', "error 不能是空串"],
	])("拒绝 %s（%s）", (json) => {
		expect(parseControl(nodeToFarmControlSchema, json).kind).toBe("invalid");
	});

	it.each([
		[
			'{"type":"openStream","streamId":0,"port":80}',
			"streamId 0 是控制帧保留号",
		],
		['{"type":"openStream","streamId":1,"port":0}', "端口 0"],
		['{"type":"openStream","streamId":1,"port":70000}', "端口越界"],
		['{"type":"call","id":1,"method":"rm -rf","params":null}', "未知方法"],
		[
			'{"type":"helloAck","nodeId":"n","name":"n","backend":"local","maxSlots":0}',
			"槽位数必须为正",
		],
	])("拒绝 %s（%s）", (json) => {
		expect(parseControl(farmToNodeControlSchema, json).kind).toBe("invalid");
	});
});

describe("RPC 载荷 schema", () => {
	it("acquire 入参齐全才通过", () => {
		const params = {
			browserName: "chromium",
			browserVersion: null,
			expiresAtEpochSec: 1_800_000_000,
			image: "automationstack-browser-chromium:140",
			mode: "webdriver",
			sessionId: "s1",
		};
		expect(acquireParamsSchema.safeParse(params).success).toBe(true);
		expect(
			acquireParamsSchema.safeParse({ ...params, mode: "playwright" }).success
		).toBe(false);
		// image 是必填：docker 后端的节点拿不到它就只能靠命名约定猜镜像名。
		const { image: _image, ...withoutImage } = params;
		expect(acquireParamsSchema.safeParse(withoutImage).success).toBe(false);
		// 浏览器同样必填，而且必须是**下发**下来的：让节点自己从 image 反解一次，
		// 就是筛选与兑现两份规则并存（`acquireParams` 的注释）。
		const { browserName: _name, ...withoutBrowser } = params;
		expect(acquireParamsSchema.safeParse(withoutBrowser).success).toBe(false);
		expect(
			acquireParamsSchema.safeParse({ ...params, browserName: "" }).success
		).toBe(false);
		// 版本可空 = 「哪个版本都行」，但不能是空串。
		expect(
			acquireParamsSchema.safeParse({ ...params, browserVersion: "" }).success
		).toBe(false);
	});

	it("acquire 出参：cdp 模式下 wdPort 可以为 null，端口 0 不行", () => {
		const value = {
			browserArgs: ["--headless=new"],
			cdpDebugPort: 39_223,
			cdpPort: 39_222,
			containerId: "slot-1",
			wdPort: null,
		};
		expect(acquireResultSchema.safeParse(value).success).toBe(true);
		expect(
			acquireResultSchema.safeParse({ ...value, cdpPort: 0 }).success
		).toBe(false);
	});

	it("listManaged 出参允许 session / 到期时刻缺失（label 写坏的槽位照收）", () => {
		const parsed = listManagedResultSchema.safeParse([
			{ containerId: "c1", expiresAtEpochSec: null, sessionId: null },
		]);
		expect(parsed.success).toBe(true);
	});

	it("契约表覆盖了全部六个方法", () => {
		expect(Object.keys(farmRpcContracts).sort()).toEqual([
			"acquire",
			"detectCapabilities",
			"listManaged",
			"readLogs",
			"release",
			"releaseContainer",
		]);
	});
});
