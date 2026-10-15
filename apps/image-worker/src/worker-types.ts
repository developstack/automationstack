/**
 * Worker 使用的 Cloudflare 运行时类型的最小声明（#63）。
 * 只声明这里用到的成员，所以不需要 @cloudflare/workers-types。
 */

export interface StoredImageHead {
	httpEtag: string;
	httpMetadata?: { contentType?: string };
	size: number;
}

export interface StoredImage extends StoredImageHead {
	body: ReadableStream;
}

/** R2 bucket 绑定。 */
export interface ImageBucket {
	get: (key: string) => Promise<StoredImage | null>;
	head: (key: string) => Promise<StoredImageHead | null>;
}

/** Cache API 的 caches.default。 */
export interface EdgeCache {
	match: (request: Request) => Promise<Response | undefined>;
	put: (request: Request, response: Response) => Promise<void>;
}

export interface WorkerEnv {
	CASE_IMAGES: ImageBucket;
	IMAGE_CDN_SIGNING_SECRET?: string;
}

export interface WorkerExecutionContext {
	waitUntil: (promise: Promise<unknown>) => void;
}
