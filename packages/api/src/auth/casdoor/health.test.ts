import { describe, expect, it, vi } from "vitest";

import { effectiveSettings } from "../settings-fixtures";
import { casdoorHealth } from "./health";

const ok = (_input: string | URL | Request) =>
	Promise.resolve(new Response("{}"));

describe("casdoorHealth（T13）", () => {
	it("local 模式：null，不访问 Casdoor", async () => {
		const doFetch = vi.fn(ok);
		await expect(
			casdoorHealth(effectiveSettings(), { fetch: doFetch })
		).resolves.toBeNull();
		expect(doFetch).not.toHaveBeenCalled();
	});

	it("casdoor 模式：访问集群内地址的发现文档，结果缓存 30 秒", async () => {
		const settings = effectiveSettings({
			internalUrl: "http://casdoor.health-a:8000",
			provider: "casdoor",
		});
		const doFetch = vi.fn(ok);
		await expect(
			casdoorHealth(settings, { fetch: doFetch, now: 1000 })
		).resolves.toBe("reachable");
		await casdoorHealth(settings, { fetch: doFetch, now: 2000 });
		expect(doFetch).toHaveBeenCalledTimes(1);
		expect(String(doFetch.mock.calls[0]?.[0])).toBe(
			"http://casdoor.health-a:8000/.well-known/openid-configuration"
		);
	});

	it("连接失败：unreachable，不抛出错误", async () => {
		const settings = effectiveSettings({
			internalUrl: "http://casdoor.health-b:8000",
			provider: "casdoor",
		});
		const failing = vi.fn(() => Promise.reject(new Error("ECONNREFUSED")));
		await expect(
			casdoorHealth(settings, { fetch: failing as typeof fetch })
		).resolves.toBe("unreachable");
	});

	it("没有集群内地址：not-configured", async () => {
		await expect(
			casdoorHealth(effectiveSettings({ provider: "casdoor" }))
		).resolves.toBe("not-configured");
	});
});
