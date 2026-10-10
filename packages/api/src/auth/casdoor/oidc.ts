import {
	allowInsecureRequests,
	Configuration,
	type CustomFetch,
	customFetch,
	discovery,
	enableNonRepudiationChecks,
	type ServerMetadata,
} from "openid-client";

import { casdoorClientAuth } from "./client-auth";
import { type CasdoorConnection, connectionFingerprint } from "./connection";

/** 登录和回调中每个 OIDC 请求的超时（秒）。 */
export const OIDC_TIMEOUT_SECONDS = 10;

const DISCOVERY_PATH = "/.well-known/openid-configuration";

export interface OidcClientInput {
	clientId: string;
	clientSecret: string;
	internalUrl: string;
	issuer: string;
	/** 测试连接时可以为 null：只读取发现文档，不登录。 */
	redirectUrl: string | null;
}

export interface DiscoverOptions {
	fetch?: CustomFetch;
	timeoutSeconds?: number;
}

export class CasdoorIssuerMismatchError extends Error {
	constructor(discovered: string, expected: string) {
		super(
			`发现文档中的 issuer（${discovered}）与公网地址（${expected}）不同。公网地址必须与 Casdoor 的 origin 配置完全相同`
		);
		this.name = "CasdoorIssuerMismatchError";
	}
}

/** 把地址的协议、主机和端口换成 origin 的值，保留路径和查询。 */
export function moveToOrigin(url: string, origin: string): string {
	const target = new URL(url);
	const replacement = new URL(origin);
	target.protocol = replacement.protocol;
	target.hostname = replacement.hostname;
	// 必须单独设置端口：赋值 host 时，如果新值没有端口，URL 保留原来的端口。
	target.port = replacement.port;
	return target.href;
}

function requireEndpoint(value: string | undefined, name: string): string {
	if (!value) {
		throw new Error(`发现文档中没有 ${name}`);
	}
	return value;
}

/**
 * 改写发现文档中的地址（plan 021 D11、§11.3）：
 * 生产的 origin 是公网地址，前面有 Cloudflare Access。服务端请求的地址
 * （token_endpoint、jwks_uri、userinfo_endpoint）改为集群内地址；
 * 浏览器跳转的 authorization_endpoint 改为公网地址。
 */
export function rewriteServerMetadata(
	metadata: ServerMetadata,
	origins: { internalUrl: string; issuer: string }
): ServerMetadata {
	return {
		...metadata,
		authorization_endpoint: moveToOrigin(
			requireEndpoint(
				metadata.authorization_endpoint,
				"authorization_endpoint"
			),
			origins.issuer
		),
		jwks_uri: moveToOrigin(
			requireEndpoint(metadata.jwks_uri, "jwks_uri"),
			origins.internalUrl
		),
		token_endpoint: moveToOrigin(
			requireEndpoint(metadata.token_endpoint, "token_endpoint"),
			origins.internalUrl
		),
		userinfo_endpoint: metadata.userinfo_endpoint
			? moveToOrigin(metadata.userinfo_endpoint, origins.internalUrl)
			: undefined,
	};
}

function isHttp(url: string): boolean {
	return new URL(url).protocol === "http:";
}

/**
 * 从集群内地址读取发现文档，自己比较 issuer，再按改写后的地址创建 Configuration（§11.4）。
 * 必须传完整的发现地址：只传 origin 时，openid-client 要求 issuer 等于这个地址。
 * 集群内地址是 http，所以打开 enableNonRepudiationChecks，用集群内的 JWKS 校验 ID token 签名。
 */
export async function discoverCasdoor(
	input: OidcClientInput,
	options: DiscoverOptions = {}
): Promise<Configuration> {
	const timeout = options.timeoutSeconds ?? OIDC_TIMEOUT_SECONDS;
	const clientAuth = casdoorClientAuth(input.clientSecret);
	const discovered = await discovery(
		new URL(DISCOVERY_PATH, input.internalUrl),
		input.clientId,
		undefined,
		clientAuth,
		{
			execute: isHttp(input.internalUrl) ? [allowInsecureRequests] : [],
			timeout,
			...(options.fetch ? { [customFetch]: options.fetch } : {}),
		}
	);
	const metadata = discovered.serverMetadata();
	if (metadata.issuer !== input.issuer) {
		throw new CasdoorIssuerMismatchError(metadata.issuer, input.issuer);
	}
	const config = new Configuration(
		rewriteServerMetadata(metadata, input),
		input.clientId,
		input.redirectUrl === null
			? undefined
			: { redirect_uris: [input.redirectUrl] },
		clientAuth
	);
	if (isHttp(input.internalUrl) || isHttp(input.issuer)) {
		allowInsecureRequests(config);
	}
	enableNonRepudiationChecks(config);
	config.timeout = timeout;
	if (options.fetch) {
		config[customFetch] = options.fetch;
	}
	return config;
}

export interface CachedOidcClient {
	config: Configuration;
	fingerprint: string;
}

interface CacheEntry {
	fingerprint: string;
	loading: Promise<Configuration>;
}

let cached: CacheEntry | null = null;

/**
 * 按连接参数的指纹缓存 Configuration（§10.4）。指纹变化时重新读取发现文档。
 * 读取失败时不缓存，下一次调用重新读取。
 */
export async function getOidcClient(
	connection: CasdoorConnection,
	options: DiscoverOptions = {}
): Promise<CachedOidcClient> {
	const fingerprint = await connectionFingerprint(connection);
	let entry = cached;
	if (entry?.fingerprint !== fingerprint) {
		const created: CacheEntry = {
			fingerprint,
			loading: discoverCasdoor(connection, options),
		};
		cached = created;
		created.loading.catch(() => {
			if (cached === created) {
				cached = null;
			}
		});
		entry = created;
	}
	return { config: await entry.loading, fingerprint };
}

export function clearOidcClientCache(): void {
	cached = null;
}
