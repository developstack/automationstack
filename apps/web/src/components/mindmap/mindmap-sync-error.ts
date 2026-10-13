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

const FIRST_SERVER_ERROR_STATUS = 500;

/**
 * 服务端写给用户看的原因：4xx 的 ORPCError，并且 message 不是 ORPC 按错误码填的英文默认句。
 * 5xx 和其他 Error 的 message 是内部细节，不显示。
 */
function serverReason(error: unknown): string | null {
	if (
		!(error instanceof ORPCError) ||
		error.status >= FIRST_SERVER_ERROR_STATUS
	) {
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
