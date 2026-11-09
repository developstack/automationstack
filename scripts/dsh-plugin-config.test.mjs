import assert from "node:assert/strict";
import { test } from "node:test";

/** 子串断言：失败时把完整文本打出来。 */
const includes = (text, part) => assert.ok(text.includes(part), text);

import {
	buildPluginSetup,
	DEFAULT_TOKEN_ENV,
	DEFAULT_URL,
	SERVER_NAME,
} from "../plugins/dsh-testcase-platform/config.js";

const SKILLS_DIR = "/opt/plugin/skills";

const setup = (config, env = {}) =>
	buildPluginSetup({ config, env, skillsDir: SKILLS_DIR });

test("默认值：默认 url、默认 token 变量、streamable-http、不因启动失败拒绝激活", () => {
	const result = setup(undefined, { [DEFAULT_TOKEN_ENV]: "as_abc" });
	assert.deepEqual(result.errors, []);
	assert.deepEqual(result.warnings, []);
	assert.deepEqual(result.mcp, {
		failOnStartupError: false,
		headers: { Authorization: "Bearer as_abc" },
		serverName: SERVER_NAME,
		transport: "streamable-http",
		url: DEFAULT_URL,
	});
	assert.equal(DEFAULT_URL, "https://testcases.logwing.com/mcp");
});

test("skill 配置只扫包内 skills/，不重复扫默认目录", () => {
	for (const config of [undefined, { url: "nope" }, "not-an-object"]) {
		assert.deepEqual(setup(config).skills, {
			customSkillDirs: [SKILLS_DIR],
			includeDefaultRoots: false,
			providerName: "testcase-platform",
		});
	}
});

test("url 覆盖：去掉首尾空白后原样使用", () => {
	const result = setup({ url: "  https://cases.example.com/mcp  " });
	assert.equal(result.mcp.url, "https://cases.example.com/mcp");
});

test("token：从自定义变量名读取并去掉首尾空白", () => {
	const result = setup(
		{ tokenEnv: "MY_TOKEN" },
		{ [DEFAULT_TOKEN_ENV]: "as_wrong", MY_TOKEN: " as_right\n" }
	);
	assert.deepEqual(result.mcp.headers, { Authorization: "Bearer as_right" });
});

test("token 缺失或为空：照常挂载、不带头，并给出警告", () => {
	for (const env of [{}, { [DEFAULT_TOKEN_ENV]: "   " }]) {
		const result = setup(undefined, env);
		assert.deepEqual(result.errors, []);
		assert.deepEqual(result.mcp.headers, {});
		assert.equal(result.warnings.length, 1);
		includes(result.warnings[0], "AS_TOKEN");
		includes(result.warnings[0], "401");
	}
});

const INVALID = [
	["非字符串 url", { url: 42 }, "url 必须是非空字符串"],
	["空 url", { url: " " }, "url 必须是非空字符串"],
	["无法解析的 url", { url: "testcases.logwing.com/mcp" }, "不是合法的 URL"],
	[
		"非 http(s) 协议",
		{ url: "ftp://testcases.logwing.com/mcp" },
		"只支持 http",
	],
	[
		"url 带用户名密码",
		{ url: "https://u:p@testcases.logwing.com/mcp" },
		"用户名或密码",
	],
	["非法的 tokenEnv", { tokenEnv: "MY-TOKEN" }, "tokenEnv 必须是环境变量名"],
	["config 不是对象", ["https://x/mcp"], "必须是对象"],
];

for (const [label, config, message] of INVALID) {
	test(`配置有错不挂载 MCP，并报告原因：${label}`, () => {
		const result = setup(config, { [DEFAULT_TOKEN_ENV]: "as_abc" });
		assert.equal(result.mcp, null);
		assert.equal(result.errors.length, 1);
		includes(result.errors[0], message);
	});
}

test("token 中间含空白：不挂载 MCP，报告错误", () => {
	const result = setup(undefined, { [DEFAULT_TOKEN_ENV]: "as_a\r\nX: y" });
	assert.equal(result.mcp, null);
	includes(result.errors[0], "空白字符");
});

test("明文 http：回环地址不警告，其他主机警告", () => {
	const env = { [DEFAULT_TOKEN_ENV]: "as_abc" };
	for (const url of [
		"http://localhost:3000/mcp",
		"http://127.0.0.1:3000/mcp",
	]) {
		assert.deepEqual(setup({ url }, env).warnings, [], url);
	}
	const remote = setup({ url: "http://cases.example.com/mcp" }, env);
	assert.equal(remote.mcp.url, "http://cases.example.com/mcp");
	includes(remote.warnings[0], "明文");
});

test("未知的 config 键只警告，不影响挂载", () => {
	const result = setup({ token: "as_abc" }, { [DEFAULT_TOKEN_ENV]: "as_abc" });
	assert.notEqual(result.mcp, null);
	assert.equal(result.warnings.length, 1);
	includes(result.warnings[0], "未知的 config 键 token");
});
