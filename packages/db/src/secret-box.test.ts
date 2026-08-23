/**
 * secret-box 存的是数据库里唯一一份 AI API Key。这里盯死三件事：
 * 往返能解开、换了主密钥必须是**可判别**的失败（而不是静默返回垃圾明文）、
 * 以及同一明文两次加密的密文必须不同（IV 不复用，否则 GCM 的安全性直接归零）。
 */
import { describe, expect, it } from "vitest";

import {
	decodeSecretKey,
	decryptSecret,
	encryptSecret,
	SECRET_KEY_BYTES,
} from "./secret-box";

/** 32 字节全 0 / 全 1 的 base64，够用且可复现。 */
function makeKey(fill: number): string {
	const bytes = new Uint8Array(SECRET_KEY_BYTES).fill(fill);
	let binary = "";
	for (const byte of bytes) {
		binary += String.fromCharCode(byte);
	}
	return btoa(binary);
}

/** 自描述前缀：格式本身不依赖任何全局配置就能被认出来。 */
const BOX_PREFIX = /^aes_256_gcm\$/;

const KEY = makeKey(1);
const OTHER_KEY = makeKey(2);
const PLAINTEXT = "sk-测试-Key-🔑";

async function box(plaintext: string, key: string): Promise<string> {
	const encrypted = await encryptSecret(plaintext, key);
	if (encrypted.kind !== "ok") {
		throw new Error(`encryptSecret failed: ${encrypted.kind}`);
	}
	return encrypted.box;
}

describe("decodeSecretKey 对主密钥长度的校验", () => {
	it("accepts a 32-byte base64 key", () => {
		expect(decodeSecretKey(KEY)).not.toBeNull();
	});

	it("rejects a key of the wrong length", () => {
		expect(decodeSecretKey(btoa("too-short"))).toBeNull();
	});

	it("rejects a value that is not base64 at all", () => {
		expect(decodeSecretKey("not base64!!")).toBeNull();
	});
});

describe("encryptSecret / decryptSecret 往返", () => {
	it("round-trips the plaintext, including non-ASCII", async () => {
		const decrypted = await decryptSecret(await box(PLAINTEXT, KEY), KEY);
		expect(decrypted).toEqual({ kind: "ok", value: PLAINTEXT });
	});

	it("round-trips an empty string", async () => {
		const decrypted = await decryptSecret(await box("", KEY), KEY);
		expect(decrypted).toEqual({ kind: "ok", value: "" });
	});

	it("writes a self-describing prefix so the format is parseable on its own", async () => {
		expect(await box(PLAINTEXT, KEY)).toMatch(BOX_PREFIX);
	});

	it("never puts the plaintext in the stored box", async () => {
		expect(await box(PLAINTEXT, KEY)).not.toContain(PLAINTEXT);
	});
});

describe("IV 不复用", () => {
	it("produces different ciphertexts for the same plaintext and key", async () => {
		const first = await box(PLAINTEXT, KEY);
		const second = await box(PLAINTEXT, KEY);
		expect(first).not.toBe(second);
		// 两条都必须仍能解开——差异只应来自随机 IV，而不是别的地方出了错。
		await expect(decryptSecret(first, KEY)).resolves.toEqual({
			kind: "ok",
			value: PLAINTEXT,
		});
		await expect(decryptSecret(second, KEY)).resolves.toEqual({
			kind: "ok",
			value: PLAINTEXT,
		});
	});
});

describe("解密失败是可判别的", () => {
	it("reports undecryptable when the master key was rotated", async () => {
		const decrypted = await decryptSecret(await box(PLAINTEXT, KEY), OTHER_KEY);
		expect(decrypted.kind).toBe("undecryptable");
	});

	it("reports undecryptable when the ciphertext was tampered with", async () => {
		const original = await box(PLAINTEXT, KEY);
		const [algorithm, iv, ciphertext] = original.split("$");
		const flipped = `${ciphertext?.startsWith("A") ? "B" : "A"}${ciphertext?.slice(1) ?? ""}`;
		const decrypted = await decryptSecret(`${algorithm}$${iv}$${flipped}`, KEY);
		expect(decrypted.kind).toBe("undecryptable");
	});

	it("reports malformed for a string this module never wrote", async () => {
		await expect(decryptSecret("plain-api-key", KEY)).resolves.toEqual({
			kind: "malformed",
		});
	});

	it("reports malformed when the IV segment has the wrong length", async () => {
		const original = await box(PLAINTEXT, KEY);
		const [algorithm, , ciphertext] = original.split("$");
		await expect(
			decryptSecret(`${algorithm}$${btoa("short")}$${ciphertext}`, KEY)
		).resolves.toEqual({ kind: "malformed" });
	});

	it("reports invalid-key rather than a decryption failure when the master key is unusable", async () => {
		await expect(
			decryptSecret("anything", "not-a-32-byte-key")
		).resolves.toEqual({ kind: "invalid-key" });
	});

	it("refuses to encrypt with an unusable master key", async () => {
		await expect(encryptSecret(PLAINTEXT, "")).resolves.toEqual({
			kind: "invalid-key",
		});
	});
});
