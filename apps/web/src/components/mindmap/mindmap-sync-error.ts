import {
	fallbackORPCErrorMessage,
	isDefinedError,
	ORPCError,
} from "@orpc/client";

export const MINDMAP_SYNC_FAILED_MESSAGE = "脑图同步失败，已恢复为服务端数据";

const RECOVERED_SUFFIX = "；画布已恢复为服务端数据";

export function describeMindmapSyncFailure(error: unknown): string {
	if (error instanceof ORPCError && isDefinedError(error)) {
		const { message } = error;
		if (message !== fallbackORPCErrorMessage(error.code, "")) {
			return `${message}${RECOVERED_SUFFIX}`;
		}
	}
	return MINDMAP_SYNC_FAILED_MESSAGE;
}
