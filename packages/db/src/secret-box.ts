/**
 * 对称加密盒：AES-256-GCM，走 WebCrypto（`crypto.subtle`）。
 *
 * 选 WebCrypto 而不是 node:crypto 的理由与 password.ts 相同——同一个模块要能在
 * 服务端、种子脚本、以及将来可能出现的边缘运行时里都跑，且不引入原生依赖。
 *
 * 存储格式自描述，解密时不依赖任何全局配置来解析格式本身：
 *
 *   `aes_256_gcm$<iv_b64>$<ciphertext_b64>`
 *
 * 算法名写进串里而不是读常量——将来换算法（比如换成 XChaCha20）时，老密文靠自己
 * 那一段前缀仍能被识别并解开，不必先做一次全表迁移。
 *
 * 主密钥不由本模块读取，而是由调用方以 base64 串传入（与 session.ts 把
 * SESSION_SECRET 当参数传的做法一致）：这样本模块是纯函数，单测里不需要拉起
 * 整套环境变量校验。
 */

/** AES-256 的密钥长度。主密钥 base64 解出来必须正好这么多字节。 */
export const SECRET_KEY_BYTES = 32;

/**
 * GCM 的 IV 长度。12 字节是 NIST SP 800-38D 推荐值：这个长度下 IV 被直接当作
 * 计数器初值使用，不需要额外的 GHASH 折叠，也是各家实现最优化的路径。
 */
const IV_BYTES = 12;

/** GCM 认证标签位数；WebCrypto 默认也是 128，这里写明以免依赖默认值。 */
const TAG_BITS = 128;

const ALGORITHM = "aes_256_gcm";

/** `algorithm$iv$ciphertext` 三段。 */
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

/** base64 主密钥解码；长度不对或不是合法 base64 时返回 null。 */
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

/**
 * `CryptoKey` 这个全局类型在 `lib: ["ESNext"] + types: ["node"]` 下不可见，
 * 从 importKey 的返回类型反推出来，避免为了一个类型名去改全局 lib 配置。
 */
type SecretKey = Awaited<ReturnType<typeof crypto.subtle.importKey>>;

/**
 * 导入的密钥对象按 base64 串缓存。importKey 本身很便宜，但它是异步的，
 * 每次加解密都 await 一次没有意义；主密钥在进程生命周期内不会变。
 */
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

/**
 * 加密结果。`invalid-key` 与 `ok` 分开，是为了让调用方能把「主密钥没配好」
 * 当成配置问题上报，而不是当成用户输入错误。
 */
export type SecretEncryption =
	| { kind: "invalid-key" }
	| { kind: "ok"; box: string };

/** 加密明文；每次都新取随机 IV，绝不复用。 */
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

/**
 * 解密结果。三种失败刻意分开，运维据此就能判断该查什么：
 * - `invalid-key`：主密钥没配 / 不是 32 字节的 base64 —— 查环境变量；
 * - `malformed`：存储串不是本模块写出来的格式 —— 查数据是不是被手改过；
 * - `undecryptable`：格式对但 GCM 认证标签对不上 —— **几乎一定是主密钥被换了**
 *   （也可能是密文被篡改）。这两者密码学上无法区分，但运维处置一样：
 *   要么把旧主密钥找回来，要么让管理员重新填一次 API Key。
 *
 * 任何一种失败都不携带密钥或明文片段，可以安全地写进日志。
 */
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

/** 解密存储串；失败一律以可判别的结果返回，不抛裸异常。 */
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
		// WebCrypto 对认证失败只抛一个无信息的 OperationError，
		// 原样吞掉即可——它里面没有可用于定位的内容，更不该外泄。
		return { kind: "undecryptable" };
	}
}
