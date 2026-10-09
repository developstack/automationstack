import { describe, expect, it, vi } from "vitest";

import { CasdoorManagementClient } from "./management-client";

const BASE = "http://casdoor.internal:8000";
const CLIENT_ID = "client-id";
const SECRET = "s3cr+t/value&x=1";
const REDACTED_MARK = /\*\*\*/;

type Handler = (url: URL, init: RequestInit) => Response;

function json(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		headers: { "content-type": "application/json" },
		status,
	});
}

const tokenResponse = () =>
	json({ access_token: "tok", expires_in: 604_800, refresh_token: "" });

function client(handler: Handler, extra: { timeoutMs?: number } = {}) {
	const doFetch = vi.fn((input: string | URL | Request, init?: RequestInit) =>
		Promise.resolve(handler(new URL(String(input)), init ?? {}))
	);
	const instance = new CasdoorManagementClient({
		baseUrl: BASE,
		clientId: CLIENT_ID,
		clientSecret: SECRET,
		fetch: doFetch as typeof fetch,
		...extra,
	});
	return { doFetch, instance };
}

function api(data: unknown, data2: unknown = null): Handler {
	return (url) =>
		url.pathname === "/api/login/oauth/access_token"
			? tokenResponse()
			: json({ data, data2, msg: "", status: "ok" });
}

describe("CasdoorManagementClient（D13、§11.6）", () => {
	it("token 请求：凭据只在 Basic 头中（原值，不做表单编码），URL 中没有凭据", async () => {
		const { doFetch, instance } = client(api(null));
		await instance.fetchToken();
		const [input, init] = doFetch.mock.calls[0] ?? [];
		expect(String(input)).toBe(`${BASE}/api/login/oauth/access_token`);
		const headers = new Headers(init?.headers);
		expect(headers.get("authorization")).toBe(
			`Basic ${Buffer.from(`${CLIENT_ID}:${SECRET}`).toString("base64")}`
		);
		expect(String(input)).not.toContain("client_secret");
		expect(String(init?.body)).toBe("grant_type=client_credentials");
	});

	it("token 被缓存：多次调用只取一次 token，并用 Bearer 调用管理 API", async () => {
		const { doFetch, instance } = client(
			api({ name: "automationstack", owner: "admin" })
		);
		await instance.getOrganization("automationstack");
		await instance.getOrganization("automationstack");
		const paths = doFetch.mock.calls.map(
			([input]) => new URL(String(input)).pathname
		);
		expect(paths.filter((path) => path.endsWith("access_token"))).toHaveLength(
			1
		);
		const [lastInput, lastInit] = doFetch.mock.calls.at(-1) ?? [];
		expect(new URL(String(lastInput)).searchParams.get("id")).toBe(
			"admin/automationstack"
		);
		expect(new Headers(lastInit?.headers).get("authorization")).toBe(
			"Bearer tok"
		);
	});

	it("data: null 表示不存在：返回 null，不是错误", async () => {
		const { instance } = client(api(null));
		await expect(
			instance.getRole("automationstack", "missing")
		).resolves.toBeNull();
		await expect(instance.getUser("automationstack/ghost")).resolves.toBeNull();
	});

	it("status: error：抛出错误（请求失败与不存在不同）", async () => {
		const { instance } = client((url) =>
			url.pathname.endsWith("access_token")
				? tokenResponse()
				: json({ data: null, msg: "Unauthorized operation", status: "error" })
		);
		await expect(instance.getRole("built-in", "x")).rejects.toThrow(
			"Unauthorized operation"
		);
	});

	it("分页读取全部用户，直到 data2 个", async () => {
		const pages: Record<string, unknown[]> = {
			"1": [{ id: "a", name: "alice", owner: "o" }],
			"2": [{ id: "b", isForbidden: true, name: "bob", owner: "o" }],
		};
		const { instance } = client((url) =>
			url.pathname.endsWith("access_token")
				? tokenResponse()
				: json({
						data: pages[url.searchParams.get("p") ?? ""] ?? [],
						data2: 2,
						status: "ok",
					})
		);
		await expect(instance.listUsers("o")).resolves.toEqual([
			{
				id: "a",
				isDeleted: false,
				isForbidden: false,
				name: "alice",
				owner: "o",
			},
			{ id: "b", isDeleted: false, isForbidden: true, name: "bob", owner: "o" },
		]);
	});

	it("错误信息中删除 secret 的原值和 URL 编码形式", async () => {
		const { instance } = client(() =>
			json(
				{
					error: "invalid_client",
					error_description: `bad secret ${SECRET} / ${encodeURIComponent(SECRET)}`,
				},
				400
			)
		);
		const error = await instance
			.fetchToken()
			.catch((caught: unknown) => caught);
		expect(error).toBeInstanceOf(Error);
		const { message } = error as Error;
		expect(message).toContain("HTTP 400");
		expect(message).not.toContain(SECRET);
		expect(message).not.toContain(encodeURIComponent(SECRET));
	});

	it("网络错误中的 secret 也被删除", async () => {
		const { instance } = client(() => {
			throw new Error(`connect failed for ${SECRET}`);
		});
		await expect(instance.fetchToken()).rejects.toThrow(REDACTED_MARK);
	});

	it("每次请求都有超时", async () => {
		const instance = new CasdoorManagementClient({
			baseUrl: BASE,
			clientId: CLIENT_ID,
			clientSecret: SECRET,
			fetch: ((_input: string | URL | Request, init?: RequestInit) =>
				new Promise((_resolve, reject) => {
					init?.signal?.addEventListener("abort", () =>
						reject(init.signal?.reason)
					);
				})) as typeof fetch,
			timeoutMs: 20,
		});
		await expect(instance.fetchToken()).rejects.toThrow("请求超时（20 毫秒）");
	});

	it("HTTP 401：重新获取 token 并重试一次", async () => {
		let calls = 0;
		const { doFetch, instance } = client((url) => {
			if (url.pathname.endsWith("access_token")) {
				return tokenResponse();
			}
			calls += 1;
			return calls === 1
				? json({}, 401)
				: json({ data: { name: "o", owner: "admin" }, status: "ok" });
		});
		await expect(instance.getOrganization("o")).resolves.toEqual({
			name: "o",
			owner: "admin",
		});
		expect(doFetch).toHaveBeenCalledTimes(4);
	});
});
