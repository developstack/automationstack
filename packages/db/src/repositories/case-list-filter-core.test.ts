/**
 * 三件事出错都不会有任何东西报警，所以逐条钉住：元字符必须被转义成字面量、
 * 前缀模式左端不许出现 `%`（否则「这个需求上一轮生成了什么」会捞到别的需求）、
 * 不含元字符的普通输入不许被改写（否则 sourceRef 前缀会永远匹不上）。
 */
import { describe, expect, it } from "vitest";

import {
	containsPattern,
	escapeLikePattern,
	prefixPattern,
} from "./case-list-filter-core";

describe("escapeLikePattern", () => {
	it("escapes the three LIKE special characters", () => {
		expect(escapeLikePattern("100%_off")).toBe("100\\%\\_off");
		expect(escapeLikePattern("a\\b")).toBe("a\\\\b");
	});

	it("leaves ordinary text untouched", () => {
		expect(escapeLikePattern("gen:PROJ-1234#refund-over-total")).toBe(
			"gen:PROJ-1234#refund-over-total"
		);
	});
});

describe("containsPattern", () => {
	it("wraps the escaped keyword in wildcards on both ends", () => {
		expect(containsPattern("退款")).toBe("%退款%");
		expect(containsPattern("50%")).toBe("%50\\%%");
	});
});

describe("prefixPattern", () => {
	it("anchors at the left: no leading wildcard", () => {
		expect(prefixPattern("gen:PROJ-1234#")).toBe("gen:PROJ-1234#%");
		expect(prefixPattern("gen:PROJ-1234#").startsWith("%")).toBe(false);
	});

	it("keeps user-supplied wildcards literal", () => {
		expect(prefixPattern("gen:PRD_v2#")).toBe("gen:PRD\\_v2#%");
	});
});
