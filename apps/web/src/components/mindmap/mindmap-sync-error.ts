import { fallbackORPCErrorMessage, ORPCError } from "@orpc/client";

import {
	isNetworkFailure,
	NETWORK_FAILURE_REASON,
} from "@/utils/failure-message";

export interface MindmapSyncFailure {
	/** 失败的具体原因 */
	description: string;
	title: string;
}

const SYNC_FAILED_TITLE = "脑图同步失败，画布已恢复为服务端数据";

const NO_REASON = "服务端没有给出原因，可以重试一次。";

/**
 * 服务端中间件拒绝请求时用的错误码。这些错误没有在契约中声明，但 message 是写给用户看的中文，
 * 例如「请先登录」「你不是该项目的成员」。参数校验失败等其他未声明的错误是英文的内部细节。
 */
const MIDDLEWARE_ERROR_CODES: ReadonlySet<string> = new Set([
	"FORBIDDEN",
	"NOT_FOUND",
	"UNAUTHORIZED",
]);

/**
 * 写给用户看的原因：契约中声明的业务错误，或中间件的拒绝，
 * 并且 message 不是 ORPC 按错误码填的英文默认句。其他错误的 message 不显示。
 */
function serverReason(error: unknown): string | null {
	if (!(error instanceof ORPCError)) {
		return null;
	}
	if (!(error.defined || MIDDLEWARE_ERROR_CODES.has(error.code))) {
		return null;
	}
	const message = error.message.trim();
	if (message === "" || message === fallbackORPCErrorMessage(error.code, "")) {
		return null;
	}
	return message;
}

/** 批量操作失败时的提示：标题说明画布已恢复，说明写具体原因。 */
export function describeMindmapSyncFailure(error: unknown): MindmapSyncFailure {
	if (isNetworkFailure(error)) {
		return { description: NETWORK_FAILURE_REASON, title: SYNC_FAILED_TITLE };
	}
	return {
		description: serverReason(error) ?? NO_REASON,
		title: SYNC_FAILED_TITLE,
	};
}
