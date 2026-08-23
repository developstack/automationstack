/**
 * 口令散列：PBKDF2-HMAC-SHA256，走 WebCrypto（`crypto.subtle`）。
 *
 * 选 WebCrypto 而不是 node:crypto 的 scrypt/argon2，是为了让同一个模块在服务端、
 * 种子脚本、以及将来可能出现的边缘运行时里都能跑，且不引入原生依赖。
 *
 * 存储格式自描述，验证时不依赖任何外部配置：
 *
 *   `pbkdf2_sha256$<iterations>$<salt_b64>$<hash_b64>`
 *
 * 迭代次数写在散列里而非读全局常量——调高 ITERATIONS 只影响新散列，
 * 老账号照旧能登录（verifyPassword 按每条记录里的次数派生）。
 */

/**
 * OWASP 2023 对 PBKDF2-HMAC-SHA256 的建议值。本机实测 600k ≈ 75ms、
 * 210k ≈ 28ms、100k ≈ 15ms；登录是低频路径，75ms 换四倍暴破成本值得。
 * WebCrypto 的 deriveBits 在 Node 里走线程池，不阻塞事件循环。
 */
const ITERATIONS = 600_000;
/** 解析上限：防止被篡改的散列串用天文数字的迭代次数把 CPU 钉死。 */
const MAX_ITERATIONS = 5_000_000;
const KEY_BITS = 256;
const SALT_BYTES = 16;
const ALGORITHM = "pbkdf2_sha256";
/** `algorithm$iterations$salt$hash` 四段。 */
const HASH_SEGMENTS = 4;

const encoder = new TextEncoder();

function toBase64(bytes: Uint8Array): string {
	let binary = "";
	for (const byte of bytes) {
		binary += String.fromCharCode(byte);
	}
	return btoa(binary);
}

/**
 * 返回类型写成 `Uint8Array<ArrayBuffer>` 而不是裸 `Uint8Array`：后者在 TS 5.7+
 * 里是 `Uint8Array<ArrayBufferLike>`，可能背靠 SharedArrayBuffer，因而不满足
 * WebCrypto 的 `BufferSource`。这里的字节永远来自新分配的 ArrayBuffer。
 */
function fromBase64(value: string): Uint8Array<ArrayBuffer> {
	const binary = atob(value);
	const bytes = new Uint8Array(binary.length);
	for (let index = 0; index < binary.length; index += 1) {
		bytes[index] = binary.charCodeAt(index);
	}
	return bytes;
}

/**
 * 恒定时间比较：逐字节累积异或，绝不提前 return。
 * 用 `===` 逐字节短路比较会把「前几字节猜对了」通过耗时泄露出去。
 */
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

/** 生成随机盐并派生散列，返回自描述的存储串。 */
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

/** 解析存储串；格式或迭代次数不合法时返回 null（一律按验证失败处理）。 */
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

/** 用存储串里自带的盐与迭代次数重新派生并恒定时间比较。 */
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
