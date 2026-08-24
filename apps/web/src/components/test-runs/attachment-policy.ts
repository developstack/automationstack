/**
 * 附件的**前端预检**（plan §6 / §6.2）。
 *
 * ⚠️ 这是服务端 `packages/api/src/lib/attachment-policy.ts` 的一份**副本**，
 * 而且是有意为之的重复，不是漏了抽公共包：
 *
 * - 权威判定永远在服务端。签名前有 `validateAttachmentUpload`，
 *   登记时还有一次 `HeadObject` 读回对象真值，前端报什么都不算数。
 * - 这份副本只为体验：用户选完一个 50MB 的录屏，应该当场被告知「太大了」，
 *   而不是等 5 分钟传完再收到拒绝。
 * - 不从 api 包 import：那个文件与 `@aws-sdk/client-s3`、db 类型缠在一起，
 *   拉进浏览器包不划算；而这几个常量的漂移代价是「前端拦得比服务端松/紧一点」，
 *   松了服务端会兜住，紧了用户会看到一句更早的提示——都不会造成数据问题。
 *
 * 改服务端白名单或上限时，请顺手改这里。
 */
import type { TestRunAttachmentKind } from "@automationstack/db/schema/test-runs";

const BYTES_PER_MIB = 1024 * 1024;
const MAX_ATTACHMENT_MIB = 20;

export const MAX_ATTACHMENT_BYTES = MAX_ATTACHMENT_MIB * BYTES_PER_MIB;
export const MAX_ATTACHMENT_HINT = `${MAX_ATTACHMENT_MIB}MB`;

/**
 * contentType → kind。
 *
 * kind 由 contentType 反查而不是让用户选：服务端按 kind 分档校验白名单
 * （screenshot 只收图片），让用户选等于给他一个能把 mp4 标成截图的机会，
 * 而那种行会在报告页上渲染成一个坏掉的 `<img>`。
 */
const KIND_BY_CONTENT_TYPE: Record<string, TestRunAttachmentKind> = {
	"image/jpeg": "screenshot",
	"image/png": "screenshot",
	"image/webp": "screenshot",
	"text/plain": "log",
	"video/mp4": "video",
	"video/webm": "video",
};

export const ATTACHMENT_ACCEPT_HINT = "PNG / JPEG / WebP / MP4 / WebM / TXT";

/** `<input type="file">` 的 accept：与白名单同源，避免两处各写一份。 */
export const ATTACHMENT_ACCEPT_ATTRIBUTE =
	Object.keys(KIND_BY_CONTENT_TYPE).join(",");

export type AttachmentPrecheck =
	| { contentType: string; kind: TestRunAttachmentKind; ok: true }
	| { message: string; ok: false };

/**
 * 选文件 / 粘贴 / 拖拽三条入口共用的预检。
 *
 * `file.type` 为空串是常见情况（某些系统拖出来的文件没有 MIME），
 * 这时**不猜**：扩展名不可信，猜错会让签名里的 contentType 与实际 PUT 的
 * 对不上，直接换来一个 R2 的 403，用户完全看不懂。
 */
export function precheckAttachment(file: File): AttachmentPrecheck {
	const contentType = file.type;
	const kind = KIND_BY_CONTENT_TYPE[contentType];
	if (kind === undefined) {
		return {
			message: `不支持的文件类型${contentType === "" ? "" : `（${contentType}）`}，仅支持 ${ATTACHMENT_ACCEPT_HINT}`,
			ok: false,
		};
	}
	if (file.size > MAX_ATTACHMENT_BYTES) {
		return {
			message: `文件超过 ${MAX_ATTACHMENT_HINT} 上限，请压缩后再传`,
			ok: false,
		};
	}
	return { contentType, kind, ok: true };
}
