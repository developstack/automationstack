import type { Configuration } from "openid-client";
import { describe, expect, it, vi } from "vitest";

import type { CasdoorConnectionDraft } from "./connection";
import {
	type ConnectionTestDeps,
	testCasdoorConnection,
} from "./test-connection";

const SECRET = "s3cr+t/value&x=1";
const JWKS_URI = "http://casdoor.internal:8000/.well-known/jwks";

const draft: CasdoorConnectionDraft = {
	adminRole: "automationstack-admin",
	clientId: "client-id",
	clientSecret: SECRET,
	internalUrl: "http://casdoor.internal:8000",
	issuer: "https://casdoor.example.com",
	organization: "automationstack",
	projectAdminRole: "automationstack-project-admin",
	redirectUrl: null,
};

type Client = ReturnType<ConnectionTestDeps["managementClient"]>;

function deps(
	client: Partial<Client> = {},
	jwks: unknown = { keys: [{ kid: "k" }] }
): ConnectionTestDeps {
	return {
		discover: vi.fn(() =>
			Promise.resolve({
				serverMetadata: () => ({ issuer: draft.issuer, jwks_uri: JWKS_URI }),
			} as unknown as Configuration)
		),
		fetch: vi.fn(() => Promise.resolve(Response.json(jwks))) as typeof fetch,
		managementClient: vi.fn(() => ({
			fetchToken: vi.fn(() => Promise.resolve("tok")),
			getOrganization: vi.fn(() =>
				Promise.resolve({ name: "automationstack", owner: "admin" })
			),
			getRole: vi.fn(() =>
				Promise.resolve({
					isEnabled: true,
					name: "automationstack-admin",
					owner: "automationstack",
					users: ["automationstack/alice"],
				})
			),
			...client,
		})),
	};
}

function statuses(result: Awaited<ReturnType<typeof testCasdoorConnection>>) {
	return Object.fromEntries(result.steps.map((step) => [step.id, step.status]));
}

describe("testCasdoorConnection（§10.1、T13）", () => {
	it("全部通过：ok，四个步骤依次为发现文档、token、组织、角色", async () => {
		const result = await testCasdoorConnection(draft, deps());
		expect(result.ok).toBe(true);
		expect(result.steps.map((step) => step.id)).toEqual([
			"discovery",
			"token",
			"organization",
			"adminRole",
		]);
	});

	it("发现文档失败：discovery 失败，其他步骤照常执行", async () => {
		const run = deps();
		run.discover = vi.fn(() => Promise.reject(new Error("issuer 不同")));
		const result = await testCasdoorConnection(draft, run);
		expect(statuses(result)).toEqual({
			adminRole: "passed",
			discovery: "failed",
			organization: "passed",
			token: "passed",
		});
		expect(result.ok).toBe(false);
	});

	it("JWKS 中没有密钥：discovery 失败", async () => {
		const result = await testCasdoorConnection(draft, deps({}, { keys: [] }));
		expect(statuses(result).discovery).toBe("failed");
	});

	it("token 失败：组织和角色跳过；详情中没有 secret 的原值和 URL 编码形式", async () => {
		const result = await testCasdoorConnection(
			draft,
			deps({
				fetchToken: vi.fn(() =>
					Promise.reject(
						new Error(`invalid ${SECRET} ${encodeURIComponent(SECRET)}`)
					)
				),
			})
		);
		expect(statuses(result)).toEqual({
			adminRole: "skipped",
			discovery: "passed",
			organization: "skipped",
			token: "failed",
		});
		const text = JSON.stringify(result);
		expect(text).not.toContain(SECRET);
		expect(text).not.toContain(encodeURIComponent(SECRET));
	});

	it("组织不存在（data: null）：organization 失败", async () => {
		const result = await testCasdoorConnection(
			draft,
			deps({ getOrganization: vi.fn(() => Promise.resolve(null)) })
		);
		expect(statuses(result).organization).toBe("failed");
		expect(result.steps[2]?.detail).toContain("没有组织");
	});

	it("角色不存在或已关闭：adminRole 失败", async () => {
		const missing = await testCasdoorConnection(
			draft,
			deps({ getRole: vi.fn(() => Promise.resolve(null)) })
		);
		expect(statuses(missing).adminRole).toBe("failed");
		const disabled = await testCasdoorConnection(
			draft,
			deps({
				getRole: vi.fn(() =>
					Promise.resolve({
						isEnabled: false,
						name: "r",
						owner: "o",
						users: [],
					})
				),
			})
		);
		expect(disabled.steps[3]?.detail).toContain("已关闭");
	});

	it("缺少字段：对应步骤失败，写明缺少的字段", async () => {
		const result = await testCasdoorConnection(
			{ ...draft, clientSecret: null, internalUrl: null },
			deps()
		);
		expect(statuses(result)).toMatchObject({
			discovery: "failed",
			token: "failed",
		});
		expect(result.steps[0]?.detail).toContain("集群内地址");
		expect(result.steps[1]?.detail).toContain("Client Secret");
	});

	it("详情被截断", async () => {
		const result = await testCasdoorConnection(
			draft,
			deps({
				fetchToken: vi.fn(() => Promise.reject(new Error("x".repeat(1000)))),
			})
		);
		expect(result.steps[1]?.detail?.length).toBeLessThan(320);
	});
});
