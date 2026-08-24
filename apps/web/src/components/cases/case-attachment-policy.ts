/**
 * 用例贴图的**前端预检**。
 *
 * ⚠️ 这是服务端 `packages/api/src/lib/case-attachment-policy.ts` 的一份**副本**，
 * 与 `test-runs/attachment-policy.ts` 出于同一套理由：
 *
 * - 权威判定永远在服务端。签名前有 `validateCaseImageUpload`，登记时还有一次
 *   `HeadObject` 读回对象真值（`case-attachment-ingest.ts`），前端报什么都不算数。
 * - 这份副本只为体验：用户粘一张 30MB 的原图，应该在**开始传之前**就被告知
 *   「太大了」，而不是等上行传完再收到一句拒绝。
 * - **不从 api 包 import**：那个文件第一行就是 `import { randomUUID } from "node:crypto"`
 *   （key 生成要用），把它拉进浏览器包等于把 node 内置模块拖进前端构建。
 *   而这几个常量的漂移代价是「前端拦得比服务端松/紧一点」——松了服务端会兜住，
 *   紧了用户会看到一句更早的提示，都不会造成数据问题。
 *
 * 改服务端白名单或上限时，请顺手改这里。
 */

const BYTES_PER_MIB = 1024 * 1024;
const MAX_CASE_IMAGE_MIB = 10;

export const MAX_CASE_IMAGE_BYTES = MAX_CASE_IMAGE_MIB * BYTES_PER_MIB;

/**
 * 只收这三种。
 *
 * 不收 gif/svg：svg 是可执行文档（内嵌 script），而正文里的图会以签名 URL 直出，
 * 等于给同源之外开一个脚本入口；gif 的动图在只读正文里除了分散注意力没有别的用处。
 */
export const CASE_IMAGE_CONTENT_TYPES = [
	"image/png",
	"image/jpeg",
	"image/webp",
] as const;

const ACCEPT_HINT = "PNG / JPEG / WebP";
const MAX_SIZE_HINT = `${MAX_CASE_IMAGE_MIB}MB`;

export type CaseImagePrecheck = { ok: false; reason: string } | { ok: true };

const ALLOWED = new Set<string>(CASE_IMAGE_CONTENT_TYPES);

/**
 * 粘贴 / 拖拽 / 选文件三条入口共用的预检，`reason` 直接进 toast。
 *
 * `file.type` 为空串是常见情况（某些系统拖出来的文件不带 MIME），这时**不猜**：
 * 扩展名不可信，猜错会让 presign 里签进 SigV4 的 contentType 与实际 PUT 的头对不上，
 * 换来一个 R2 的 403 SignatureDoesNotMatch——用户完全看不懂。
 * 空串会落进白名单判断的 else 分支，与「不支持的类型」共用一句提示。
 */
export function precheckCaseImage(file: File): CaseImagePrecheck {
	if (!ALLOWED.has(file.type)) {
		return {
			ok: false,
			reason: `不支持的图片类型${file.type === "" ? "" : `（${file.type}）`}，仅支持 ${ACCEPT_HINT}`,
		};
	}
	if (file.size > MAX_CASE_IMAGE_BYTES) {
		return {
			ok: false,
			reason: `图片超过 ${MAX_SIZE_HINT} 上限，请压缩后再粘贴`,
		};
	}
	return { ok: true };
}
