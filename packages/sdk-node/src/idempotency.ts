import { createHash, randomUUID } from "node:crypto";

const UUID_SEGMENT_ENDS = [8, 12, 16, 20, 32] as const;
const UUID_HEX_LENGTH = 32;
const VERSION_NIBBLE_INDEX = 12;
const VARIANT_NIBBLE_INDEX = 16;

export function resolveRunIdempotencyKey(
	env: Record<string, string | undefined>
): string {
	const configured = env.AS_IDEMPOTENCY_KEY?.trim();
	if (configured) {
		return configured;
	}
	return randomUUID();
}

export function deriveBatchIdempotencyKey(
	runKey: string,
	batchIndex: number
): string {
	if (batchIndex === 0) {
		return runKey;
	}
	const digest = createHash("sha1")
		.update(`${runKey}:${batchIndex}`)
		.digest("hex")
		.slice(0, UUID_HEX_LENGTH);
	return formatAsUuidV5(digest);
}

function formatAsUuidV5(hex: string): string {
	const nibbles = [...hex];
	nibbles[VERSION_NIBBLE_INDEX] = "5";
	nibbles[VARIANT_NIBBLE_INDEX] = "8";
	const normalized = nibbles.join("");
	let cursor = 0;
	const segments: string[] = [];
	for (const end of UUID_SEGMENT_ENDS) {
		segments.push(normalized.slice(cursor, end));
		cursor = end;
	}
	return segments.join("-");
}
