const BYTES_PER_MIB = 1024 * 1024;
const MAX_CASE_IMAGE_MIB = 10;

export const MAX_CASE_IMAGE_BYTES = MAX_CASE_IMAGE_MIB * BYTES_PER_MIB;

export const CASE_IMAGE_CONTENT_TYPES = [
	"image/png",
	"image/jpeg",
	"image/webp",
] as const;

const ACCEPT_HINT = "PNG / JPEG / WebP";
const MAX_SIZE_HINT = `${MAX_CASE_IMAGE_MIB}MB`;

export type CaseImagePrecheck = { ok: false; reason: string } | { ok: true };

const ALLOWED = new Set<string>(CASE_IMAGE_CONTENT_TYPES);

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
