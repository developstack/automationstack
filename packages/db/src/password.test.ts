import { describe, expect, it } from "vitest";

import { generateRandomPassword, MIN_PASSWORD_LENGTH } from "./password";

const URL_SAFE = /^[A-Za-z0-9_-]+$/;
const GENERATED_LENGTH = 32;

describe("generateRandomPassword", () => {
	it("生成 32 个 base64url 字符，满足最小长度", () => {
		const password = generateRandomPassword();
		expect(password).toHaveLength(GENERATED_LENGTH);
		expect(password.length).toBeGreaterThanOrEqual(MIN_PASSWORD_LENGTH);
		expect(password).toMatch(URL_SAFE);
	});

	it("每次结果不同", () => {
		expect(generateRandomPassword()).not.toBe(generateRandomPassword());
	});
});
