/**
 * 钉住**节点凭据的格式契约**，理由与 `api-token.test.ts` 同款：这套格式有一个
 * 远端消费者——已经写进各台实机 agent 配置文件里的明文串，而库里存的是哈希。
 * 生成规则或哈希口径任何一点漂移（少了前缀、换了字母表、大写十六进制），
 * 表现都是**存量节点集体掉线**，没有任何一处会报错。
 *
 * 另有一条这里独有的：节点凭据与个人 API token 必须**同源但不同前缀**。
 * 同源保证只有一套摘要口径，不同前缀保证拿错了当场看得出来。
 */
import { describe, expect, it } from "vitest";

import { API_TOKEN_PREFIX, generateApiToken, hashApiToken } from "./api-token";
import {
	FARM_NODE_TOKEN_PREFIX,
	generateFarmNodeToken,
	hashFarmNodeToken,
} from "./farm-node-token";

/** `as_node_` + base64url(32 字节)，后者无 padding 时正好 43 个字符。 */
const EXPECTED_PLAINTEXT_LENGTH = FARM_NODE_TOKEN_PREFIX.length + 43;
const HEX_64 = /^[0-9a-f]{64}$/;
const BASE64URL_BODY = /^[A-Za-z0-9_-]+$/;

describe("generateFarmNodeToken", () => {
	it("明文以 as_node_ 开头", async () => {
		const token = await generateFarmNodeToken();
		expect(token.plaintext.startsWith(FARM_NODE_TOKEN_PREFIX)).toBe(true);
	});

	it("随机体长度与字母表照抄 api token（同源的唯一可测证据）", async () => {
		const node = await generateFarmNodeToken();
		const api = await generateApiToken();
		const nodeBody = node.plaintext.slice(FARM_NODE_TOKEN_PREFIX.length);
		const apiBody = api.plaintext.slice(API_TOKEN_PREFIX.length);
		expect(nodeBody).toMatch(BASE64URL_BODY);
		expect(nodeBody).toHaveLength(apiBody.length);
		expect(node.plaintext).toHaveLength(EXPECTED_PLAINTEXT_LENGTH);
	});

	it("两次生成不相同（否则 token_hash 的唯一约束会当场炸给你看）", async () => {
		const [first, second] = await Promise.all([
			generateFarmNodeToken(),
			generateFarmNodeToken(),
		]);
		expect(first.plaintext).not.toBe(second.plaintext);
		expect(first.tokenHash).not.toBe(second.tokenHash);
	});

	it("tokenHash 是对含前缀完整明文的哈希（不是剥掉 as_node_ 之后的）", async () => {
		const token = await generateFarmNodeToken();
		expect(token.tokenHash).toBe(await hashFarmNodeToken(token.plaintext));
		expect(token.tokenHash).not.toBe(
			await hashFarmNodeToken(
				token.plaintext.slice(FARM_NODE_TOKEN_PREFIX.length)
			)
		);
	});

	it("返回值里没有 prefix 字段（节点靠 name 认，不留展示前缀）", async () => {
		const token = await generateFarmNodeToken();
		expect(Object.keys(token).toSorted()).toEqual(["plaintext", "tokenHash"]);
	});
});

describe("hashFarmNodeToken", () => {
	it("与 hashApiToken 逐字节相同（是转发，不是第二份实现）", async () => {
		const plaintext = "as_node_deterministic-sample-value";
		expect(await hashFarmNodeToken(plaintext)).toBe(
			await hashApiToken(plaintext)
		);
	});

	it("同一明文稳定（否则鉴权那次等值查找永远查不中）", async () => {
		const plaintext = "as_node_deterministic-sample-value";
		expect(await hashFarmNodeToken(plaintext)).toBe(
			await hashFarmNodeToken(plaintext)
		);
	});

	it("输出是 64 位小写十六进制", async () => {
		const token = await generateFarmNodeToken();
		expect(token.tokenHash).toMatch(HEX_64);
	});

	it("对上游已知向量给出标准 SHA-256（换算法会被这条拦住）", async () => {
		expect(await hashFarmNodeToken("abc")).toBe(
			"ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
		);
	});
});

describe("FARM_NODE_TOKEN_PREFIX", () => {
	it("与个人 token 的前缀不同，且不会互相误判", async () => {
		expect(FARM_NODE_TOKEN_PREFIX).not.toBe(API_TOKEN_PREFIX);
		const node = await generateFarmNodeToken();
		const api = await generateApiToken();
		// 个人 token 的 `as_` 是节点前缀的真前缀，所以「以 as_ 开头」认不出区别，
		// 反过来那一条才是有效判据：个人 token 绝不会以 as_node_ 开头。
		expect(api.plaintext.startsWith(FARM_NODE_TOKEN_PREFIX)).toBe(false);
		expect(node.plaintext.startsWith(FARM_NODE_TOKEN_PREFIX)).toBe(true);
	});
});
