import type { EdgeCache, ImageBucket, StoredImage } from "./worker-types";

export interface FakeObject {
	body: string;
	contentType?: string;
}

export interface FakeBucket extends ImageBucket {
	calls: string[];
}

function toStoredImage(object: FakeObject): StoredImage {
	return {
		body: new Blob([object.body]).stream(),
		httpEtag: `"etag-${object.body.length}"`,
		httpMetadata:
			object.contentType === undefined
				? undefined
				: { contentType: object.contentType },
		size: object.body.length,
	};
}

/** 记录每次调用的假 R2 bucket。 */
export function createBucket(objects: Record<string, FakeObject>): FakeBucket {
	const calls: string[] = [];
	const find = (key: string): StoredImage | null => {
		const object = objects[key];
		return object === undefined ? null : toStoredImage(object);
	};
	return {
		calls,
		get: (key) => {
			calls.push(`get:${key}`);
			return Promise.resolve(find(key));
		},
		head: (key) => {
			calls.push(`head:${key}`);
			return Promise.resolve(find(key));
		},
	};
}

export interface FakeCache extends EdgeCache {
	/** 缓存中的条目：缓存键 URL 到响应头和响应体。 */
	entries: Map<string, { body: ArrayBuffer; headers: Headers }>;
}

/** 内存中的 Cache API。match 只匹配 GET 请求，与 Cloudflare 相同。 */
export function createCache(): FakeCache {
	const entries: FakeCache["entries"] = new Map();
	return {
		entries,
		match: (request) => {
			const entry = entries.get(request.url);
			if (request.method !== "GET" || entry === undefined) {
				return Promise.resolve(undefined);
			}
			return Promise.resolve(
				new Response(entry.body.slice(0), { headers: entry.headers })
			);
		},
		put: async (request, response) => {
			entries.set(request.url, {
				body: await response.arrayBuffer(),
				headers: new Headers(response.headers),
			});
		},
	};
}
