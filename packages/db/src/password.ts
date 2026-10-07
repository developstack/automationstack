const ITERATIONS = 600_000;
const MAX_ITERATIONS = 5_000_000;
const KEY_BITS = 256;
const SALT_BYTES = 16;
const ALGORITHM = "pbkdf2_sha256";
const HASH_SEGMENTS = 4;

const encoder = new TextEncoder();

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

function timingSafeEqual(left: Uint8Array, right: Uint8Array): boolean {
	if (left.length !== right.length) {
		return false;
	}
	let diff = 0;
	for (let index = 0; index < left.length; index += 1) {
		// biome-ignore lint/suspicious/noBitwiseOperators: 恒定时间比较靠异或累积差异
		diff |= (left[index] ?? 0) ^ (right[index] ?? 0);
	}
	return diff === 0;
}

async function deriveKey(
	password: string,
	salt: Uint8Array<ArrayBuffer>,
	iterations: number
): Promise<Uint8Array> {
	const keyMaterial = await crypto.subtle.importKey(
		"raw",
		encoder.encode(password),
		"PBKDF2",
		false,
		["deriveBits"]
	);
	const bits = await crypto.subtle.deriveBits(
		{ hash: "SHA-256", iterations, name: "PBKDF2", salt },
		keyMaterial,
		KEY_BITS
	);
	return new Uint8Array(bits);
}

export async function hashPassword(password: string): Promise<string> {
	const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
	const hash = await deriveKey(password, salt, ITERATIONS);
	return `${ALGORITHM}$${ITERATIONS}$${toBase64(salt)}$${toBase64(hash)}`;
}

interface ParsedHash {
	hash: Uint8Array;
	iterations: number;
	salt: Uint8Array<ArrayBuffer>;
}

function parseStoredHash(stored: string): ParsedHash | null {
	const parts = stored.split("$");
	if (parts.length !== HASH_SEGMENTS) {
		return null;
	}
	const [algorithm, iterationsValue, saltBase64, hashBase64] = parts;
	if (
		!(algorithm === ALGORITHM && iterationsValue && saltBase64 && hashBase64)
	) {
		return null;
	}
	const iterations = Number(iterationsValue);
	if (
		!Number.isSafeInteger(iterations) ||
		iterations <= 0 ||
		iterations > MAX_ITERATIONS
	) {
		return null;
	}
	try {
		return {
			hash: fromBase64(hashBase64),
			iterations,
			salt: fromBase64(saltBase64),
		};
	} catch {
		return null;
	}
}

export async function verifyPassword(
	password: string,
	stored: string
): Promise<boolean> {
	const parsed = parseStoredHash(stored);
	if (parsed === null) {
		return false;
	}
	const actual = await deriveKey(password, parsed.salt, parsed.iterations);
	return timingSafeEqual(actual, parsed.hash);
}
