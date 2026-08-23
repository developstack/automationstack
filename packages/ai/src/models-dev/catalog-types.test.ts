/**
 * models.dev 没有 API 版本号，字段是加法式演进，还有 `interleaved` 这种同名不同
 * 类型的字段。解析层唯一的硬要求就是「别整体崩」：这里用真实遇到过的几种畸形
 * 形态压一遍，任何一条让 parseCatalog 抛异常或返回空目录都是回归。
 */
import { describe, expect, it } from "vitest";

import { parseCatalog } from "./catalog-types";

const ANTHROPIC_CONTEXT = 200_000;
const ANTHROPIC_OUTPUT = 64_000;

/** 一线 provider 走官方 SDK，models.dev 不给 `api` 字段。 */
const withoutApi = {
	anthropic: {
		doc: "https://docs.anthropic.com",
		env: ["ANTHROPIC_API_KEY"],
		id: "anthropic",
		models: {
			"claude-sonnet-4-5": {
				attachment: true,
				id: "claude-sonnet-4-5",
				limit: { context: ANTHROPIC_CONTEXT, output: ANTHROPIC_OUTPUT },
				name: "Claude Sonnet 4.5",
				reasoning: true,
				release_date: "2025-09-29",
				tool_call: true,
			},
		},
		name: "Anthropic",
		npm: "@ai-sdk/anthropic",
	},
};

describe("parseCatalog 对缺 api 字段的 provider", () => {
	it("keeps the provider and reports that it has no default base URL", () => {
		const catalog = parseCatalog(withoutApi);
		const entry = catalog.get("anthropic");
		expect(entry?.provider.defaultBaseUrl).toBeNull();
		expect(entry?.provider.hasDefaultBaseUrl).toBe(false);
	});

	it("still trims the model fields that matter for picking one", () => {
		const model = parseCatalog(withoutApi).get("anthropic")?.models[0];
		expect(model).toEqual({
			attachment: true,
			contextLimit: ANTHROPIC_CONTEXT,
			id: "claude-sonnet-4-5",
			name: "Claude Sonnet 4.5",
			outputLimit: ANTHROPIC_OUTPUT,
			reasoning: true,
			releaseDate: "2025-09-29",
			toolCall: true,
		});
	});

	it("surfaces api as the default base URL when upstream provides one", () => {
		const catalog = parseCatalog({
			deepseek: {
				api: "https://api.deepseek.com",
				id: "deepseek",
				models: { "deepseek-chat": { id: "deepseek-chat" } },
				name: "DeepSeek",
			},
		});
		const provider = catalog.get("deepseek")?.provider;
		expect(provider?.defaultBaseUrl).toBe("https://api.deepseek.com");
		expect(provider?.hasDefaultBaseUrl).toBe(true);
	});
});

describe("parseCatalog 对未知字段与类型漂移", () => {
	it("ignores fields it does not know about, at both levels", () => {
		const catalog = parseCatalog({
			acme: {
				id: "acme",
				models: {
					"m-1": { id: "m-1", somethingBrandNew: { nested: [1, 2, 3] } },
				},
				name: "Acme",
				unknownProviderField: { deeply: { nested: true } },
				ид: "not even ascii",
			},
		});
		expect(catalog.get("acme")?.provider.name).toBe("Acme");
		expect(catalog.get("acme")?.models).toHaveLength(1);
	});

	it("survives interleaved being a boolean on one model and an object on another", () => {
		const catalog = parseCatalog({
			acme: {
				id: "acme",
				models: {
					"m-1": { id: "m-1", interleaved: true },
					"m-2": { id: "m-2", interleaved: { supported: true } },
				},
				name: "Acme",
			},
		});
		expect(catalog.get("acme")?.models.map((model) => model.id)).toEqual([
			"m-1",
			"m-2",
		]);
	});

	it("degrades a field that changed type instead of dropping the entry", () => {
		// limit 从对象变成数字：该模型的上下文上限退化成 null，条目本身留下。
		const catalog = parseCatalog({
			acme: {
				id: "acme",
				models: { "m-1": { id: "m-1", limit: 128, reasoning: "yes" } },
				name: "Acme",
			},
		});
		const model = catalog.get("acme")?.models[0];
		expect(model?.contextLimit).toBeNull();
		expect(model?.reasoning).toBe(false);
	});
});

describe("parseCatalog 的容错边界", () => {
	it("falls back to the dictionary key when id or name is missing", () => {
		const catalog = parseCatalog({
			acme: { models: { "m-1": { id: "m-1" } } },
		});
		expect(catalog.get("acme")?.provider.name).toBe("acme");
	});

	it("skips a broken model without discarding its sibling", () => {
		const catalog = parseCatalog({
			acme: {
				id: "acme",
				models: { bad: { id: 42 }, good: { id: "good" } },
				name: "Acme",
			},
		});
		expect(catalog.get("acme")?.models.map((model) => model.id)).toEqual([
			"good",
		]);
	});

	it("skips a broken provider without discarding its sibling", () => {
		const catalog = parseCatalog({
			acme: { id: "acme", models: {}, name: "Acme" },
			broken: "this should have been an object",
		});
		expect([...catalog.keys()]).toEqual(["acme"]);
	});

	it("returns an empty catalog instead of throwing on a non-object payload", () => {
		expect(parseCatalog(null).size).toBe(0);
		expect(parseCatalog([1, 2, 3]).size).toBe(0);
		expect(parseCatalog("nope").size).toBe(0);
	});
});
