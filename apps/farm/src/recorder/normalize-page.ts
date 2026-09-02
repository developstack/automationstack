/**
 * `Page.frameNavigated` 的归一化。
 *
 * 从 `normalize.ts` 拆出来：那份文件到了 403 行、越过了仓库 300 行的上限
 * （scripts/check-file-rules.js）。切在这里而不是别处，是因为它是全套归一化里
 * 唯一会返回 `null`（丢弃事件）、也是唯一不带时间戳的那一类，两条例外都只对
 * 它成立；它同时还是截图与 HAR 分页的锚点，单独一个文件更好找。
 */

import type {
	CdpFrameNavigatedParams,
	NormalizeContext,
	RecorderEvent,
} from "./normalize-types";
import { RECORDER_EVENT_TYPE } from "./normalize-types";

/**
 * 只记主 frame 导航：子 frame（iframe/广告位）导航既不该切 HAR 的 page，
 * 也不该触发截图。返回 null = 这条事件不入流。
 *
 * 注意 CDP 的 frameNavigated **不带时间戳**，只能用收到事件的时刻——它是
 * 分段锚点，毫秒级精度本来也不影响归属判断。
 */
export const normalizeFrameNavigated = (
	params: CdpFrameNavigatedParams,
	ctx: NormalizeContext
): RecorderEvent | null => {
	if (params.frame.parentId) {
		return null;
	}
	const ts = ctx.clock.now();

	return {
		data: {
			frameId: params.frame.id,
			timestamp: ts,
			url: params.frame.url,
		},
		targetId: ctx.targetId,
		ts,
		type: RECORDER_EVENT_TYPE.frameNavigated,
	};
};
