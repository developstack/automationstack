import { handleImageRequest } from "./handler";
import type {
	EdgeCache,
	WorkerEnv,
	WorkerExecutionContext,
} from "./worker-types";

/** Cloudflare Workers 的 Cache API。Node 的类型中没有这个全局变量。 */
declare const caches: { default: EdgeCache };

export default {
	fetch(
		request: Request,
		env: WorkerEnv,
		ctx: WorkerExecutionContext
	): Promise<Response> {
		return handleImageRequest(request, {
			bucket: env.CASE_IMAGES,
			cache: caches.default,
			now: Date.now,
			secret: env.IMAGE_CDN_SIGNING_SECRET,
			waitUntil: (promise) => ctx.waitUntil(promise),
		});
	},
};
