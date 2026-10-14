import { expect, it } from "vitest";

import {
	containsPattern,
	escapeLikePattern,
	prefixPattern,
} from "./case-list-filter-core";

// escapeLikePattern 转义 LIKE 的三个特殊字符、不动普通文本；containsPattern 两端加通配符；
// prefixPattern 只在右侧加通配符（左侧锚定），用户输入的通配符保持字面
it.each([
	[escapeLikePattern, "100%_off", "100\\%\\_off"],
	[escapeLikePattern, "a\\b", "a\\\\b"],
	[
		escapeLikePattern,
		"gen:PROJ-1234#refund-over-total",
		"gen:PROJ-1234#refund-over-total",
	],
	[containsPattern, "退款", "%退款%"],
	[containsPattern, "50%", "%50\\%%"],
	[prefixPattern, "gen:PROJ-1234#", "gen:PROJ-1234#%"],
	[prefixPattern, "gen:PRD_v2#", "gen:PRD\\_v2#%"],
])("%o(%j) → %j", (pattern, input, expected) => {
	expect(pattern(input)).toBe(expected);
});
