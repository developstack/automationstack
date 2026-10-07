export const SECRET_KEY_BYTES = 32;

const IV_BYTES = 12;

const TAG_BITS = 128;

const ALGORITHM = "aes_256_gcm";

const BOX_SEGMENTS = 3;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function toBase64(bytes: Uint8Array): string {
	let binary = "";
	for (const byte of bytes) {
		binary += String.fromCharCode(byte);
	}
	return btoa(binary);
}

function fromBase64(value: string): Uint8Array<ArrayBuffer> {
	const binary = atob(value);
	const bytes = new Uint8Array(binary.length);
	for (let index = 0; index < binary.length; index += 1) {
		bytes[index] = binary.charCodeAt(index);
	}
	return bytes;
}

export function decodeSecretKey(
	keyBase64: string
): Uint8Array<ArrayBuffer> | null {
	let bytes: Uint8Array<ArrayBuffer>;
	try {
		bytes = fromBase64(keyBase64);
	} catch {
		return null;
	}
	return bytes.length === SECRET_KEY_BYTES ? bytes : null;
}

type SecretKey = Awaited<ReturnType<typeof crypto.subtle.importKey>>;

const keyCache = new Map<string, Promise<SecretKey>>();

function importSecretKey(raw: Uint8Array<ArrayBuffer>): Promise<SecretKey> {
	return crypto.subtle.importKey("raw", raw, "AES-GCM", false, [
		"decrypt",
		"encrypt",
	]);
}

function resolveKey(keyBase64: string): Promise<SecretKey> | null {
	const cached = keyCache.get(keyBase64);
	if (cached) {
		return cached;
	}
	const raw = decodeSecretKey(keyBase64);
	if (raw === null) {
		return null;
	}
	const pending = importSecretKey(raw);
	keyCache.set(keyBase64, pending);
	return pending;
}

export type SecretEncryption =
	| { kind: "invalid-key" }
	| { kind: "ok"; box: string };

export async function encryptSecret(
	plaintext: string,
	keyBase64: string
): Promise<SecretEncryption> {
	const key = resolveKey(keyBase64);
	if (key === null) {
		return { kind: "invalid-key" };
	}
	const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
	const ciphertext = await crypto.subtle.encrypt(
		{ iv, name: "AES-GCM", tagLength: TAG_BITS },
		await key,
		encoder.encode(plaintext)
	);
	const box = `${ALGORITHM}$${toBase64(iv)}$${toBase64(new Uint8Array(ciphertext))}`;
	return { box, kind: "ok" };
}

export type SecretDecryption =
	| { kind: "invalid-key" }
	| { kind: "malformed" }
	| { kind: "ok"; value: string }
	| { kind: "undecryptable" };

interface ParsedBox {
	ciphertext: Uint8Array<ArrayBuffer>;
	iv: Uint8Array<ArrayBuffer>;
}

function parseBox(box: string): ParsedBox | null {
	const parts = box.split("$");
	if (parts.length !== BOX_SEGMENTS) {
		return null;
	}
	const [algorithm, ivBase64, ciphertextBase64] = parts;
	if (!(algorithm === ALGORITHM && ivBase64 && ciphertextBase64)) {
		return null;
	}
	try {
		const iv = fromBase64(ivBase64);
		if (iv.length !== IV_BYTES) {
			return null;
		}
		return { ciphertext: fromBase64(ciphertextBase64), iv };
	} catch {
		return null;
	}
}

export async function decryptSecret(
	box: string,
	keyBase64: string
): Promise<SecretDecryption> {
	const key = resolveKey(keyBase64);
	if (key === null) {
		return { kind: "invalid-key" };
	}
	const parsed = parseBox(box);
	if (parsed === null) {
		return { kind: "malformed" };
	}
	try {
		const plaintext = await crypto.subtle.decrypt(
			{ iv: parsed.iv, name: "AES-GCM", tagLength: TAG_BITS },
			await key,
			parsed.ciphertext
		);
		return { kind: "ok", value: decoder.decode(plaintext) };
	} catch {
		return { kind: "undecryptable" };
	}
}
