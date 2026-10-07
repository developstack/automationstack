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

const PRESENCE_FOREGROUND_DARK = "oklch(0.145 0 0)";
const PRESENCE_FOREGROUND_LIGHT = "oklch(0.985 0 0)";
const FOREGROUND_LIGHTNESS_THRESHOLD = 0.6;
const OKLCH_LIGHTNESS_PATTERN = /^oklch\(\s*([\d.]+)/;

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
const HASH_MODULUS = 2_147_483_647;

function hashText(text: string): number {
	let hash = HASH_SEED;
	for (const char of text) {
		hash = (hash * HASH_MULTIPLIER + (char.codePointAt(0) ?? 0)) % HASH_MODULUS;
	}
	return hash;
}

export function colorForName(name: string): string {
	const index = hashText(name) % PRESENCE_COLOR_PALETTE.length;
	return PRESENCE_COLOR_PALETTE[index] ?? PRESENCE_COLOR_PALETTE[0];
}
