import { describe, expect, it } from "vitest";

import { isAllowedOrigin } from "./allowed-origin";

const CORS_ORIGIN = "https://automation.example.com";

describe("isAllowedOrigin", () => {
	it.each([
		["development", CORS_ORIGIN, true],
		["development", "http://localhost:3005", true],
		["development", "http://127.0.0.1:4001", true],
		["development", "http://localhost.evil.com", false],
		["development", "https://evil.com", false],
		["development", "not a url", false],
		["production", CORS_ORIGIN, true],
		["production", "http://localhost:3001", false],
		["test", "http://localhost:3001", false],
	] as const)("%s：%s → %s", (nodeEnv, origin, expected) => {
		expect(isAllowedOrigin(origin, { corsOrigin: CORS_ORIGIN, nodeEnv })).toBe(
			expected
		);
	});
});
