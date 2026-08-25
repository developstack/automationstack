import { describe, expect, it } from "vitest";

import {
	formatLastUsedAt,
	tokenStatusLabel,
	validateTokenName,
} from "@/components/api-tokens/api-token-meta";

describe("validateTokenName", () => {
	it("accepts an ordinary name", () => {
		expect(validateTokenName("CI 流水线")).toBeNull();
	});

	it("rejects a name that is only whitespace", () => {
		// 服务端 schema 先 trim 再 min(1)，全空格在那边同样会被拒
		expect(validateTokenName("   ")).not.toBeNull();
	});

	it("measures length after trimming, like the server schema does", () => {
		const fiftyChars = "a".repeat(50);
		expect(validateTokenName(`  ${fiftyChars}  `)).toBeNull();
		expect(validateTokenName("a".repeat(51))).not.toBeNull();
	});
});

describe("formatLastUsedAt", () => {
	it("spells out the never-used case instead of leaving it blank", () => {
		expect(formatLastUsedAt(null)).toBe("从未使用");
	});

	it("formats a real timestamp", () => {
		const formatted = formatLastUsedAt(new Date("2026-03-04T05:06:07Z"));
		expect(formatted).not.toBe("从未使用");
		expect(formatted.length).toBeGreaterThan(0);
	});
});

describe("tokenStatusLabel", () => {
	it("reads active while revokedAt is null", () => {
		expect(tokenStatusLabel(null)).toBe("生效中");
	});

	it("reads revoked once revokedAt is set", () => {
		expect(tokenStatusLabel(new Date())).toBe("已吊销");
	});
});
