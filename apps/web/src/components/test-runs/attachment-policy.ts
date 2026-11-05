const BYTES_PER_MIB = 1024 * 1024;
const MAX_ATTACHMENT_MIB = 20;

export const MAX_ATTACHMENT_BYTES = MAX_ATTACHMENT_MIB * BYTES_PER_MIB;
export const MAX_ATTACHMENT_HINT = `${MAX_ATTACHMENT_MIB}MB`;

/** 实际附件的种类：截图或录屏。与服务端 testRunAttachments.presignUpload 的 kind 一致。 */
export type ActualAttachmentKind = "screenshot" | "video";

const KIND_BY_CONTENT_TYPE: Record<string, ActualAttachmentKind> = {
	"image/jpeg": "screenshot",
	"image/png": "screenshot",
	"image/webp": "screenshot",
	"video/mp4": "video",
	"video/webm": "video",
};

export const ATTACHMENT_ACCEPT_HINT = "PNG / JPEG / WebP / MP4 / WebM";

export const ATTACHMENT_ACCEPT_ATTRIBUTE =
	Object.keys(KIND_BY_CONTENT_TYPE).join(",");

export type AttachmentPrecheck =
	| { contentType: string; kind: ActualAttachmentKind; ok: true }
	| { message: string; ok: false };

/** 上传前在浏览器中检查格式和大小。服务端还会再检查一次。 */
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
