import { describe, expect, it } from "vitest";

import { configFromEnv, connectUrlOf } from "./config";

/** 断言用的正则提到顶层：规则要求，也省得每次调用都重新编译一遍。 */
const SCHEME_HINT = /只接受 http:\/\/ 或 https:\/\//;

describe("connectUrlOf", () => {
	it("http → ws，并补上 /nodes/connect", () => {
		expect(connectUrlOf("http://localhost:3002")).toBe(
			"ws://localhost:3002/nodes/connect"
		);
	});

	it("https → wss", () => {
		expect(connectUrlOf("https://farm.example.com")).toBe(
			"wss://farm.example.com/nodes/connect"
		);
	});

	it("保留反代子路径，且不产生双斜杠", () => {
		expect(connectUrlOf("https://example.com/farm/")).toBe(
			"wss://example.com/farm/nodes/connect"
		);
	});

	it("非 http(s) 直接报错，而不是安静地拼出一个连不上的地址", () => {
		expect(() => connectUrlOf("ws://localhost:3002")).toThrow(SCHEME_HINT);
	});
});

describe("configFromEnv", () => {
	it("槽位根目录挂在 work dir 下的 local-slots（与 farm 同一约定）", () => {
		const config = configFromEnv({
			NODE_AGENT_DOCKER_HOST: "unix:///var/run/docker.sock",
			NODE_AGENT_FARM_URL: "http://127.0.0.1:3002",
			NODE_AGENT_HEADLESS: false,
			NODE_AGENT_TOKEN: "as_node_x",
			NODE_AGENT_WORK_DIR: "/tmp/agent",
		});
		expect(config.local.slotsRoot).toBe("/tmp/agent/local-slots");
		expect(config.local.headless).toBe(false);
		expect(config.local.chromeBin).toBeUndefined();
		expect(config.token).toBe("as_node_x");
	});
});
