/**
 * 同步失败时给用户看的那一句话。
 *
 * 批量是全有或全无：一个操作被拒，用户刚做的一整批改名 / 移动 / 新建全部回滚。
 * 「哪一项、为什么」只在服务端那句 message 里说得清（`routers/mindmap.ts`
 * 已经把 reason 翻成中文），画布上又没有第二层界面去展开它——丢掉它，用户
 * 就只能靠一个个试来定位是哪个模块挡住了。
 *
 * 但只有**预期内的业务错误**能这样直接透出。非预期错误（网络中断、500、
 * 反序列化失败）的 message 是内部细节，给用户看既读不懂又可能泄漏实现，
 * 一律回落到通用文案。`isDefinedError` 正是这条界线：只有路由契约里
 * 显式声明过的错误码才为真（用法同 `components/cases/use-case-mutations.ts`）。
 */
import {
	fallbackORPCErrorMessage,
	isDefinedError,
	ORPCError,
} from "@orpc/client";

/** 非预期错误的兜底：只说结果，不说原因。 */
export const MINDMAP_SYNC_FAILED_MESSAGE = "脑图同步失败，已恢复为服务端数据";

/**
 * 透出具体原因时仍要补这一句：画布已经被整棵重绘过了，用户得知道自己刚才
 * 那批编辑没留下，否则会以为只有被拒的那一条没生效。
 */
const RECOVERED_SUFFIX = "；画布已恢复为服务端数据";

export function describeMindmapSyncFailure(error: unknown): string {
	// 先 instanceof 再 isDefinedError：后者的入参是泛型的，直接喂 unknown
	// 会把类型收窄成 never，拿不到 message。
	if (error instanceof ORPCError && isDefinedError(error)) {
		const { message } = error;
		// 路由没写 message 时，ORPCError 会自己填上按错误码来的英文默认句
		// （"Bad Request"）。那句不是服务端写给用户看的，透出去就是往中文界面
		// 里塞一句英文，还不如通用文案。
		if (message !== fallbackORPCErrorMessage(error.code, "")) {
			return `${message}${RECOVERED_SUFFIX}`;
		}
	}
	return MINDMAP_SYNC_FAILED_MESSAGE;
}
