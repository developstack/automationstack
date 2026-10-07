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
