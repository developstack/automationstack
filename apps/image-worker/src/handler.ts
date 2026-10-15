import { verifyImageSignature } from "./signature";
import type {
	EdgeCache,
	ImageBucket,
	StoredImageHead,
	WorkerExecutionContext,
} from "./worker-types";

/** 只接受用例附件的对象键（packages/api/src/lib/case-attachment-policy.ts）。 */
const CASE_IMAGE_KEY_PREFIX = "test-cases/";

const SECONDS_PER_DAY = 86_400;
const EDGE_CACHE_DAYS = 30;
const EDGE_CACHE_SECONDS = EDGE_CACHE_DAYS * SECONDS_PER_DAY;
const MILLISECONDS_PER_SECOND = 1000;

const HTTP_FORBIDDEN = 403;
const HTTP_NOT_FOUND = 404;
const HTTP_METHOD_NOT_ALLOWED = 405;
const HTTP_INTERNAL_ERROR = 500;

const EXP_PATTERN = /^\d{1,12}$/;
const FALLBACK_CONTENT_TYPE = "application/octet-stream";

export interface ImageRequestDeps {
	bucket: ImageBucket;
	cache: EdgeCache;
	/** 当前时间（毫秒）。 */
	now: () => number;
	secret: string | undefined;
	waitUntil: WorkerExecutionContext["waitUntil"];
}

type CacheStatus = "HIT" | "MISS";

function textResponse(status: number, message: string): Response {
	return new Response(message, {
		headers: { "content-type": "text/plain; charset=utf-8" },
		status,
	});
}

/** 路径中的对象键。编码不合法、有空段或 . 段、前缀不对时返回 null。 */
function parseStorageKey(pathname: string): string | null {
	let segments: string[];
	try {
		segments = pathname.slice(1).split("/").map(decodeURIComponent);
	} catch {
		return null;
	}
	if (segments.some((segment) => ["", ".", ".."].includes(segment))) {
		return null;
	}
	const storageKey = segments.join("/");
	return storageKey.startsWith(CASE_IMAGE_KEY_PREFIX) ? storageKey : null;
}

function parseExp(value: string | null): number | null {
	return value !== null && EXP_PATTERN.test(value) ? Number(value) : null;
}

/** 签名有效、没有过期并且前缀正确时，返回对象键和 exp。 */
async function authorize(
	url: URL,
	secret: string,
	nowSeconds: number
): Promise<{ exp: number; storageKey: string } | null> {
	const storageKey = parseStorageKey(url.pathname);
	const exp = parseExp(url.searchParams.get("exp"));
	const signature = url.searchParams.get("sig") ?? "";
	if (storageKey === null || exp === null || exp <= nowSeconds) {
		return null;
	}
	const valid = await verifyImageSignature(storageKey, exp, signature, secret);
	return valid ? { exp, storageKey } : null;
}

/** 放入边缘缓存的响应头。 */
function objectHeaders(object: StoredImageHead): Headers {
	return new Headers({
		"cache-control": `public, max-age=${EDGE_CACHE_SECONDS}`,
		"content-length": String(object.size),
		"content-type": object.httpMetadata?.contentType ?? FALLBACK_CONTENT_TYPE,
		etag: object.httpEtag,
	});
}

/** 返回给浏览器的响应：private，max-age 到 exp 为止。HEAD 不返回响应体。 */
function toBrowserResponse(
	response: Response,
	options: { cacheStatus: CacheStatus; head: boolean; maxAgeSeconds: number }
): Response {
	const headers = new Headers(response.headers);
	headers.set("cache-control", `private, max-age=${options.maxAgeSeconds}`);
	headers.set("cf-cache-status", options.cacheStatus);
	return new Response(options.head ? null : response.body, { headers });
}

/** 缓存没有命中：从 R2 读取。GET 的结果放入边缘缓存，HEAD 只读取元数据。 */
async function fetchFromBucket(
	storageKey: string,
	cacheKey: Request,
	head: boolean,
	deps: ImageRequestDeps
): Promise<Response | null> {
	if (head) {
		const object = await deps.bucket.head(storageKey);
		return object === null
			? null
			: new Response(null, { headers: objectHeaders(object) });
	}
	const object = await deps.bucket.get(storageKey);
	if (object === null) {
		return null;
	}
	const response = new Response(object.body, {
		headers: objectHeaders(object),
	});
	deps.waitUntil(deps.cache.put(cacheKey, response.clone()));
	return response;
}

/**
 * 处理 /<storageKey>?exp=<unix 秒>&sig=<签名>（#63，ADR 0002）。
 * 签名校验通过以后才读取缓存和 R2。缓存键是去掉查询参数的 URL。
 */
export async function handleImageRequest(
	request: Request,
	deps: ImageRequestDeps
): Promise<Response> {
	const head = request.method === "HEAD";
	if (!(head || request.method === "GET")) {
		return new Response(null, {
			headers: { allow: "GET, HEAD" },
			status: HTTP_METHOD_NOT_ALLOWED,
		});
	}
	if (!deps.secret) {
		return textResponse(
			HTTP_INTERNAL_ERROR,
			"IMAGE_CDN_SIGNING_SECRET is not configured"
		);
	}
	const url = new URL(request.url);
	const nowSeconds = Math.floor(deps.now() / MILLISECONDS_PER_SECOND);
	const authorized = await authorize(url, deps.secret, nowSeconds);
	if (authorized === null) {
		return textResponse(HTTP_FORBIDDEN, "Forbidden");
	}
	const maxAgeSeconds = authorized.exp - nowSeconds;
	const cacheKey = new Request(`${url.origin}${url.pathname}`);
	const cached = await deps.cache.match(cacheKey);
	if (cached) {
		return toBrowserResponse(cached, {
			cacheStatus: "HIT",
			head,
			maxAgeSeconds,
		});
	}
	const fetched = await fetchFromBucket(
		authorized.storageKey,
		cacheKey,
		head,
		deps
	);
	if (fetched === null) {
		return textResponse(HTTP_NOT_FOUND, "Not Found");
	}
	return toBrowserResponse(fetched, {
		cacheStatus: "MISS",
		head,
		maxAgeSeconds,
	});
}
