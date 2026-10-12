import type { CustomFetch, ServerMetadata } from "openid-client";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
	CasdoorIssuerMismatchError,
	clearOidcClientCache,
	discoverCasdoor,
	getOidcClient,
	rewriteServerMetadata,
} from "./oidc";

const ISSUER = "https://casdoor.example.com";
const INTERNAL = "http://casdoor.casdoor.svc.cluster.local:8000";

const connection = {
	adminRole: "automationstack-admin",
	clientId: "client-id",
	clientSecret: "client-secret-0001",
	internalUrl: INTERNAL,
	issuer: ISSUER,
	organization: "automationstack",
	projectAdminRole: "automationstack-project-admin",
	redirectUrl: "https://testcase.example.com/api/auth/casdoor/callback",
};

/** 生产的 origin 是公网地址，所以发现文档中的全部地址都是公网地址（§11.3）。 */
function metadata(issuer = ISSUER): ServerMetadata {
	return {
		authorization_endpoint: `${issuer}/login/oauth/authorize`,
		issuer,
		jwks_uri: `${issuer}/.well-known/jwks`,
		token_endpoint: `${issuer}/api/login/oauth/access_token`,
		userinfo_endpoint: `${issuer}/api/userinfo`,
	};
}

function fakeFetch(issuer = ISSUER) {
	const calls: string[] = [];
	const doFetch = vi.fn<CustomFetch>((url) => {
		calls.push(url);
		return Promise.resolve(Response.json(metadata(issuer)));
	});
	return { calls, doFetch };
}

beforeEach(() => {
	clearOidcClientCache();
});

describe("rewriteServerMetadata（D11）", () => {
	it("服务端地址改为集群内地址，授权地址改为公网地址，保留路径", () => {
		const rewritten = rewriteServerMetadata(metadata("http://localhost:8100"), {
			internalUrl: INTERNAL,
			issuer: ISSUER,
		});
		expect(rewritten).toMatchObject({
			authorization_endpoint: `${ISSUER}/login/oauth/authorize`,
			issuer: "http://localhost:8100",
			jwks_uri: `${INTERNAL}/.well-known/jwks`,
			token_endpoint: `${INTERNAL}/api/login/oauth/access_token`,
			userinfo_endpoint: `${INTERNAL}/api/userinfo`,
		});
	});

	it("发现文档缺少 token_endpoint：报错", () => {
		const { token_endpoint: _omit, ...rest } = metadata();
		expect(() =>
			rewriteServerMetadata(rest as ServerMetadata, {
				internalUrl: INTERNAL,
				issuer: ISSUER,
			})
		).toThrow("token_endpoint");
	});
});

describe("discoverCasdoor（§11.4）", () => {
	it("从集群内地址读取完整的发现地址，并改写端点", async () => {
		const { calls, doFetch } = fakeFetch();
		const config = await discoverCasdoor(connection, { fetch: doFetch });
		expect(calls).toEqual([`${INTERNAL}/.well-known/openid-configuration`]);
		expect(config.serverMetadata()).toMatchObject({
			authorization_endpoint: `${ISSUER}/login/oauth/authorize`,
			issuer: ISSUER,
			jwks_uri: `${INTERNAL}/.well-known/jwks`,
			token_endpoint: `${INTERNAL}/api/login/oauth/access_token`,
		});
	});

	it("issuer 与公网地址不同：CasdoorIssuerMismatchError", async () => {
		const { doFetch } = fakeFetch("https://other.example.com");
		await expect(
			discoverCasdoor(connection, { fetch: doFetch })
		).rejects.toBeInstanceOf(CasdoorIssuerMismatchError);
	});

	it("issuer 只差结尾的斜杠也拒绝：iss 必须与公网地址完全相同", async () => {
		const { doFetch } = fakeFetch(`${ISSUER}/`);
		await expect(
			discoverCasdoor(connection, { fetch: doFetch })
		).rejects.toBeInstanceOf(CasdoorIssuerMismatchError);
	});
});

describe("getOidcClient：按指纹缓存（§10.4）", () => {
	it("指纹相同：只读取一次发现文档", async () => {
		const { doFetch } = fakeFetch();
		const first = await getOidcClient(connection, { fetch: doFetch });
		const second = await getOidcClient(connection, { fetch: doFetch });
		expect(second.config).toBe(first.config);
		expect(doFetch).toHaveBeenCalledTimes(1);
	});

	it("secret 变化：指纹变化，重新读取", async () => {
		const { doFetch } = fakeFetch();
		const first = await getOidcClient(connection, { fetch: doFetch });
		const second = await getOidcClient(
			{ ...connection, clientSecret: "another-secret" },
			{ fetch: doFetch }
		);
		expect(second.fingerprint).not.toBe(first.fingerprint);
		expect(doFetch).toHaveBeenCalledTimes(2);
	});

	it("读取失败不缓存：下一次调用重新读取", async () => {
		const failing = vi.fn<CustomFetch>(() =>
			Promise.reject(new Error("connect ECONNREFUSED"))
		);
		await expect(
			getOidcClient(connection, { fetch: failing })
		).rejects.toThrow();
		const { doFetch } = fakeFetch();
		await expect(
			getOidcClient(connection, { fetch: doFetch })
		).resolves.toMatchObject({ fingerprint: expect.any(String) });
		expect(doFetch).toHaveBeenCalledTimes(1);
	});

	it("指纹中没有明文 secret", async () => {
		const { doFetch } = fakeFetch();
		const { fingerprint } = await getOidcClient(connection, { fetch: doFetch });
		expect(fingerprint).not.toContain(connection.clientSecret);
	});
});
