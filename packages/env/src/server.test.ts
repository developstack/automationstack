import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { KNOWN_DEV_SECRETS } from "./dev-secrets";

const DEV_SESSION_SECRET = "dev-only-session-secret-change-me-0123456789abcdef";
const STRONG_SESSION_SECRET = "kT9vQ2xL7pR4mW8zN1cB6hJ3fY5dS0aEuG2iO4rX";
const STRONG_ADMIN_PASSWORD = "a-real-production-secret";

const baseEnv: Record<string, string | undefined> = {
	ADMIN_INITIAL_PASSWORD: STRONG_ADMIN_PASSWORD,
	CORS_ORIGIN: "https://automation.example.com",
	DATABASE_URL:
		"postgresql://app:db-strong-pass@db.internal:5432/automationstack",
	SECRET_ENCRYPTION_KEY: undefined,
	SESSION_SECRET: STRONG_SESSION_SECRET,
	SKIP_ENV_VALIDATION: undefined,
};

function stubEnv(overrides: Record<string, string | undefined>): void {
	for (const [name, value] of Object.entries({ ...baseEnv, ...overrides })) {
		vi.stubEnv(name, value);
	}
}

/** 重新执行 server.ts 的环境校验；返回抛出的错误和 console.error 的全部输出。 */
async function loadEnv(): Promise<{ error: unknown; output: string }> {
	const consoleError = vi.spyOn(console, "error").mockImplementation(() => {
		// 校验失败时 t3-env 会打印问题列表；测试检查这段输出。
	});
	let error: unknown = null;
	try {
		await import("./server");
	} catch (caught) {
		error = caught;
	}
	const output = JSON.stringify(consoleError.mock.calls);
	consoleError.mockRestore();
	return { error, output };
}

beforeEach(() => {
	vi.resetModules();
});

afterEach(() => {
	vi.unstubAllEnvs();
});

describe("server env：生产环境拒绝开发默认密钥", () => {
	it("SESSION_SECRET 等于开发默认值（大小写不同、首尾空白）：启动失败，只点名变量", async () => {
		stubEnv({
			NODE_ENV: "production",
			SESSION_SECRET: `  ${DEV_SESSION_SECRET.toUpperCase()} `,
		});
		const { error, output } = await loadEnv();
		expect(error).toBeInstanceOf(Error);
		expect(output).toContain("SESSION_SECRET");
		for (const secret of KNOWN_DEV_SECRETS) {
			expect(output.toLowerCase()).not.toContain(secret.toLowerCase());
		}
	});

	it("所有密钥都用开发默认值：每个变量都报错，输出不含值", async () => {
		stubEnv({
			ADMIN_INITIAL_PASSWORD: "dev-only-admin-password",
			DATABASE_URL:
				"postgresql://postgres:automationstack-dev@127.0.0.1:5433/automationstack",
			NODE_ENV: "production",
			SECRET_ENCRYPTION_KEY: "U0t6cb4rxrzmt9qa9Po0Txv+IoE5wZ/3ZBYkt7TBbxo=",
			SESSION_SECRET: DEV_SESSION_SECRET,
		});
		const { error, output } = await loadEnv();
		expect(error).toBeInstanceOf(Error);
		for (const name of [
			"ADMIN_INITIAL_PASSWORD",
			"DATABASE_URL",
			"SECRET_ENCRYPTION_KEY",
			"SESSION_SECRET",
		]) {
			expect(output).toContain(name);
		}
		for (const secret of KNOWN_DEV_SECRETS) {
			expect(output.toLowerCase()).not.toContain(secret.toLowerCase());
		}
	});

	it.each([
		["生产环境使用自己的值", { NODE_ENV: "production" }],
		[
			"非生产环境使用开发默认值",
			{
				ADMIN_INITIAL_PASSWORD: "dev-only-admin-password",
				NODE_ENV: "development",
				SECRET_ENCRYPTION_KEY: "U0t6cb4rxrzmt9qa9Po0Txv+IoE5wZ/3ZBYkt7TBbxo=",
				SESSION_SECRET: DEV_SESSION_SECRET,
			},
		],
	])("%s：正常加载", async (_name, overrides) => {
		stubEnv(overrides);
		const { error } = await loadEnv();
		expect(error).toBeNull();
	});
});

describe("server env：Casdoor 默认值", () => {
	it("CASDOOR_ISSUER 带路径：启动失败", async () => {
		stubEnv({ CASDOOR_ISSUER: "https://casdoor.example.com/login" });
		const { error, output } = await loadEnv();
		expect(error).toBeInstanceOf(Error);
		expect(output).toContain("CASDOOR_ISSUER");
	});

	it("CASDOOR_WEBHOOK_SECRET 少于 32 个字符：启动失败", async () => {
		stubEnv({ CASDOOR_WEBHOOK_SECRET: "too-short" });
		const { error } = await loadEnv();
		expect(error).toBeInstanceOf(Error);
	});

	it("CASDOOR_INTERNAL_URL 结尾有斜杠：规范为 origin", async () => {
		stubEnv({
			CASDOOR_INTERNAL_URL: "http://casdoor.casdoor.svc.cluster.local:8000/",
		});
		const { env } = await import("./server");
		expect(env.CASDOOR_INTERNAL_URL).toBe(
			"http://casdoor.casdoor.svc.cluster.local:8000"
		);
	});
});

describe("server env：变量格式", () => {
	it.each([
		["IMAGE_PUBLIC_BASE_URL", "img.trendf.top", false],
		["IMAGE_PUBLIC_BASE_URL", "https://img.trendf.top", true],
		["AUTO_SUBMIT_SCAN_TZ", "UTC+8", false],
		["AUTO_SUBMIT_SCAN_TZ", "Asia/Shanghai", true],
		["SECRET_ENCRYPTION_KEY", "not base64!", false],
	])("%s=%s：正常加载是 %s，失败时点名变量", async (name, value, loads) => {
		stubEnv({ [name]: value });
		const { error, output } = await loadEnv();
		expect(error === null).toBe(loads);
		expect(output.includes(name)).toBe(!loads);
	});
});
