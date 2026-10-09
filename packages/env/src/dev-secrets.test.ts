import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
	DEV_SECRET_VARIABLES,
	type DevSecretCheckInput,
	type DevSecretVariable,
	databaseUrlPassword,
	devSecretMessage,
	findDevSecretsInProduction,
	isKnownDevSecret,
	KNOWN_DEV_SECRETS,
} from "./dev-secrets";

const STRONG_VALUE = "kT9vQ2xL7pR4mW8zN1cB6hJ3fY5dS0aE";
const SECRET_LIKE_KEY = /SECRET|PASSWORD|KEY|TOKEN/;
const ENV_LINE = /^([A-Z][A-Z0-9_]*)=(.*)$/;

function inputWith(
	variable: DevSecretVariable,
	value: string
): DevSecretCheckInput {
	const secret =
		variable === "DATABASE_URL"
			? `postgresql://postgres:${encodeURIComponent(value)}@db.internal:5432/automationstack`
			: value;
	return { NODE_ENV: "production", [variable]: secret };
}

function variantsOf(secret: string): string[] {
	return [secret, secret.toUpperCase(), secret.toLowerCase(), `  ${secret}\t`];
}

function readEnvExample(relativePath: string): Map<string, string> {
	const text = readFileSync(new URL(relativePath, import.meta.url), "utf8");
	const entries = new Map<string, string>();
	for (const line of text.split("\n")) {
		const match = line.match(ENV_LINE);
		if (match?.[1] !== undefined) {
			entries.set(match[1], match[2]?.trim() ?? "");
		}
	}
	return entries;
}

describe("findDevSecretsInProduction：生产环境", () => {
	for (const variable of DEV_SECRET_VARIABLES) {
		it(`${variable} 等于任一开发默认值（含大小写不同、首尾空白）：拒绝`, () => {
			for (const secret of KNOWN_DEV_SECRETS) {
				for (const variant of variantsOf(secret)) {
					expect(
						findDevSecretsInProduction(inputWith(variable, variant))
					).toEqual([variable]);
				}
			}
		});

		it(`${variable} 是自己生成的值：接受`, () => {
			expect(
				findDevSecretsInProduction(inputWith(variable, STRONG_VALUE))
			).toEqual([]);
		});
	}

	it("几个变量同时用了开发默认值：全部列出", () => {
		expect(
			findDevSecretsInProduction({
				ADMIN_INITIAL_PASSWORD: "dev-only-admin-password",
				DATABASE_URL:
					"postgresql://postgres:automationstack-dev@127.0.0.1:5433/automationstack",
				NODE_ENV: "production",
				SESSION_SECRET: "dev-only-session-secret-change-me-0123456789abcdef",
			})
		).toEqual(["ADMIN_INITIAL_PASSWORD", "DATABASE_URL", "SESSION_SECRET"]);
	});

	it("没有配置的变量和没有密码的连接串：接受", () => {
		expect(
			findDevSecretsInProduction({
				DATABASE_URL: "postgresql://john@localhost:5432/automationstack",
				NODE_ENV: "production",
			})
		).toEqual([]);
	});
});

describe("findDevSecretsInProduction：非生产环境", () => {
	for (const nodeEnv of ["development", "test", undefined]) {
		it(`NODE_ENV=${nodeEnv}：开发默认值也接受`, () => {
			for (const variable of DEV_SECRET_VARIABLES) {
				for (const secret of KNOWN_DEV_SECRETS) {
					expect(
						findDevSecretsInProduction({
							...inputWith(variable, secret),
							NODE_ENV: nodeEnv,
						})
					).toEqual([]);
				}
			}
		});
	}
});

describe("devSecretMessage", () => {
	it("只写变量名，不写任何开发默认值", () => {
		for (const variable of DEV_SECRET_VARIABLES) {
			const message = devSecretMessage(variable);
			expect(message).toContain(variable);
			for (const secret of KNOWN_DEV_SECRETS) {
				expect(message.toLowerCase()).not.toContain(secret.toLowerCase());
			}
		}
	});
});

describe("databaseUrlPassword", () => {
	it("取出并解码连接串中的密码", () => {
		expect(databaseUrlPassword("postgresql://u:p%40ss@h:5433/db")).toBe("p@ss");
	});

	it("没有密码、不是 URL 或未配置：返回 undefined", () => {
		expect(databaseUrlPassword("postgresql://u@h/db")).toBeUndefined();
		expect(databaseUrlPassword("host=h password=x")).toBeUndefined();
		expect(databaseUrlPassword(undefined)).toBeUndefined();
	});
});

// 在 .env.example 里加一个新的开发密钥但没有登记，下面的测试就会失败。
describe("KNOWN_DEV_SECRETS 与 .env.example 一致", () => {
	it("apps/server/.env.example 中每个有值的密钥都已登记，并且生产环境检查它", () => {
		const entries = readEnvExample("../../../apps/server/.env.example");
		const secrets = [...entries].filter(
			([key, value]) => SECRET_LIKE_KEY.test(key) && value !== ""
		);
		expect(secrets.length).toBeGreaterThan(0);
		for (const [key, value] of secrets) {
			expect(DEV_SECRET_VARIABLES, key).toContain(key);
			expect(isKnownDevSecret(value), key).toBe(true);
		}
	});

	it("apps/server/.env.example 中 DATABASE_URL 的密码已登记", () => {
		const entries = readEnvExample("../../../apps/server/.env.example");
		expect(
			isKnownDevSecret(databaseUrlPassword(entries.get("DATABASE_URL"))),
			"DATABASE_URL"
		).toBe(true);
	});

	it("根目录 .env.example 中每个有值的密钥都已登记", () => {
		const entries = readEnvExample("../../../.env.example");
		const secrets = [...entries].filter(
			([key, value]) => SECRET_LIKE_KEY.test(key) && value !== ""
		);
		expect(secrets.length).toBeGreaterThan(0);
		for (const [key, value] of secrets) {
			expect(isKnownDevSecret(value), key).toBe(true);
		}
	});
});
