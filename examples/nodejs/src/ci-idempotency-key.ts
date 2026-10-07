/** biome-ignore-all lint/suspicious/noConsole: 这个入口的全部输出就是那一行 key */

import { createHash } from "node:crypto";
import process from "node:process";

const UUID_HEX_LENGTH = 32;
const VERSION_NIBBLE_INDEX = 12;
const VARIANT_NIBBLE_INDEX = 16;
const UUID_SEGMENT_ENDS = [8, 12, 16, 20, 32];

export const LANGUAGE_TAG = "node:";

export function deriveIdempotencyKey(name: string): string {
	const nibbles = [
		...createHash("sha1")
			.update(LANGUAGE_TAG + name)
			.digest("hex")
			.slice(0, UUID_HEX_LENGTH),
	];
	nibbles[VERSION_NIBBLE_INDEX] = "5";
	nibbles[VARIANT_NIBBLE_INDEX] = "8";
	const hex = nibbles.join("");
	let cursor = 0;
	const segments: string[] = [];
	for (const end of UUID_SEGMENT_ENDS) {
		segments.push(hex.slice(cursor, end));
		cursor = end;
	}
	return segments.join("-");
}

const USAGE_EXIT_CODE = 1;

if (import.meta.main) {
	const [, , name] = process.argv;
	if (name) {
		console.log(deriveIdempotencyKey(name));
	} else {
		console.error(
			'用法：node src/ci-idempotency-key.ts "<CI 的 job-attempt 标识>"'
		);
		process.exit(USAGE_EXIT_CODE);
	}
}
