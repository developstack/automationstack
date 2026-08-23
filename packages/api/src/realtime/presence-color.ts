/**
 * 协作身份的配色。放在 api 包里是因为**服务端和前端都要用**：
 * 颜色在 WS 握手时由服务端按用户名派生（客户端不再自报，见 ws.ts），
 * 前端则用同一套函数决定光标标签和头像上的前景色。
 */

/**
 * 固定色板：10 个色相从 60° 排到 344°，相邻间隔约 31~32°，统一取 L=0.8。
 * 唯独 344° 绕回 60° 之间是 76° 的大缺口，这是**刻意留的**，不是漏排：
 * 缺口正好罩住 --destructive 的色相区，新增颜色不得落进这段区间。
 *
 * 两条硬约束决定了这组值：
 * 1. 与 --destructive（浅 27°／深 22.216°）色相至少差 33°——旧色板首色
 *    #e11d48 只差 4.6°，谁哈希到它，光标就长得像一条报错。
 * 2. L=0.8 让箭头在深色画布（--background oklch(0.145)）上 APCA |Lc| 达
 *    64~72（旧色板只有 21~26），同时头像/标签配深色前景 Lc 达 65~73
 *    （旧色板的白字在 3 个颜色上不达标）。
 * 色相之间不与 --primary 比较：深浅两套 primary 都是 chroma 0 的中性灰，
 * 没有色相可言，靠明度而非色相区分。
 */
export const PRESENCE_COLOR_PALETTE = [
	"oklch(0.8 0.14 60)",
	"oklch(0.8 0.16 92)",
	"oklch(0.8 0.195 123)",
	"oklch(0.8 0.195 155)",
	"oklch(0.8 0.14 186)",
	"oklch(0.8 0.14 218)",
	"oklch(0.8 0.105 249)",
	"oklch(0.8 0.1 280)",
	"oklch(0.8 0.14 312)",
	"oklch(0.8 0.145 344)",
] as const;

/** 色板上的深色前景（= --foreground 浅色值），在 L=0.8 的底色上 Lc≈65~73。 */
const PRESENCE_FOREGROUND_DARK = "oklch(0.145 0 0)";
/** 深色底上的浅色前景，仅用于兜底。 */
const PRESENCE_FOREGROUND_LIGHT = "oklch(0.985 0 0)";
/** 明暗前景的分界：底色 L 高于此值时深色字的 APCA 对比更好。 */
const FOREGROUND_LIGHTNESS_THRESHOLD = 0.6;
const OKLCH_LIGHTNESS_PATTERN = /^oklch\(\s*([\d.]+)/;

/**
 * 按底色明度选前景色。
 * 解析不出明度（非 oklch 字面量）时按浅色前景兜底。
 */
export function presenceForeground(color: string): string {
	const lightness = OKLCH_LIGHTNESS_PATTERN.exec(color)?.[1];
	if (lightness === undefined) {
		return PRESENCE_FOREGROUND_LIGHT;
	}
	return Number(lightness) >= FOREGROUND_LIGHTNESS_THRESHOLD
		? PRESENCE_FOREGROUND_DARK
		: PRESENCE_FOREGROUND_LIGHT;
}

const HASH_SEED = 5381;
const HASH_MULTIPLIER = 33;
/** 2^31-1（梅森素数）：取模防止溢出 Number 安全整数范围。 */
const HASH_MODULUS = 2_147_483_647;

/** djb2 变体字符串哈希（无位运算）：同一用户名永远得到同一颜色。 */
function hashText(text: string): number {
	let hash = HASH_SEED;
	for (const char of text) {
		hash = (hash * HASH_MULTIPLIER + (char.codePointAt(0) ?? 0)) % HASH_MODULUS;
	}
	return hash;
}

/** 用户名 → 色板取色：同名同色，跨端稳定，无需存储。 */
export function colorForName(name: string): string {
	const index = hashText(name) % PRESENCE_COLOR_PALETTE.length;
	// 取模保证下标合法，`??` 只是喂给 noUncheckedIndexedAccess 的形式兜底
	return PRESENCE_COLOR_PALETTE[index] ?? PRESENCE_COLOR_PALETTE[0];
}
