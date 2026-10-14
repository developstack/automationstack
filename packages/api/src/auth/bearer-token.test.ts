import { generateApiToken } from "@automationstack/db/api-token";
import { describe, expect, it } from "vitest";

import { parseBearerToken } from "./bearer-token";

const VALID_TOKEN = "as_9xK3mQ7vLp2ZtR8yBn4WcF6dH1jS5aG0eU-uI_oPzQw";

describe("parseBearerToken", () => {
	it.each([
		["认标准的 Bearer 头", `Bearer ${VALID_TOKEN}`],
		[
			"scheme 小写照样认：RFC 7235 规定 scheme 大小写不敏感",
			`bearer ${VALID_TOKEN}`,
		],
		["scheme 全大写照样认", `BEARER ${VALID_TOKEN}`],
		["scheme 与 token 之间多个空格不影响", `Bearer    ${VALID_TOKEN}`],
		[
			"尾随换行要被吃掉：从文件里复制 token 时带上它是常态",
			`Bearer ${VALID_TOKEN}\n`,
		],
		["整个头两端的空白不影响", `  Bearer ${VALID_TOKEN}  `],
	])("%s", (_name, header) => {
		expect(parseBearerToken(header)).toBe(VALID_TOKEN);
	});

	it.each([
		["没带头（null）时返回 null，而不是抛异常", null],
		["没带头（undefined）时返回 null", undefined],
		["空头返回 null", ""],
		["只有空白的头返回 null", "   "],
		["别的认证 scheme 一律不认", "Basic dXNlcjpwYXNz"],
		[
			"scheme 只是前缀相同也不认：Bearerish 不是 Bearer",
			`Bearerish ${VALID_TOKEN}`,
		],
		["只有 Bearer 没有 token 返回 null", "Bearer"],
		["Bearer 后面只有空白返回 null", "Bearer   "],
		[
			"不以 as_ 开头的串不认：形状不对就不值得查一次库",
			"Bearer sk-1234567890abcdefghij",
		],
		[
			"字符集越界的串不认：非 ASCII",
			"Bearer as_短短短短短短短短短短短短短短短短短",
		],
		["字符集越界的串不认：$", `Bearer ${VALID_TOKEN.replace("9", "$")}`],
		[
			"token 里夹了空格不认：那多半是把两个值粘一起了",
			`Bearer ${VALID_TOKEN} extra`,
		],
		["主体太短不认：as_ 后面得真有东西", "Bearer as_"],
		["主体太短不认：as_abc", "Bearer as_abc"],
	])("%s", (_name, header) => {
		expect(parseBearerToken(header)).toBeNull();
	});

	it("真正 generateApiToken() 生成的明文能被原样取出", async () => {
		const { plaintext } = await generateApiToken();
		expect(parseBearerToken(`Bearer ${plaintext}`)).toBe(plaintext);
	});
});
