import { expect, test } from "vitest";

import {
	ingestAttachmentPresignRequestSchema,
	ingestAttachmentRegisterRequestSchema,
	MAX_INGEST_STORAGE_KEY_LENGTH,
} from "./attachment-contract";

const PROJECT_ID = "11111111-1111-4111-8111-111111111111";
const RUN_ID = "22222222-2222-4222-8222-222222222222";
const RUN_CASE_ID = "33333333-3333-4333-8333-333333333333";

const REAL_KEY = `test-runs/${PROJECT_ID}/${RUN_ID}/${RUN_CASE_ID}/screenshot-44444444-4444-4444-8444-444444444444.webp`;

function registerWith(storageKey: string) {
	return ingestAttachmentRegisterRequestSchema.safeParse({
		attachments: [
			{
				fileName: "shot.png",
				kind: "screenshot",
				runCaseId: RUN_CASE_ID,
				runId: RUN_ID,
				storageKey,
			},
		],
	});
}

test("presign：runIds 不传就是 null（不收窄），空数组是「这轮谁都不签」", () => {
	const runIdsOf = (extra: object) =>
		ingestAttachmentPresignRequestSchema.parse({
			attachments: [],
			projectId: PROJECT_ID,
			...extra,
		}).runIds;
	expect(runIdsOf({})).toBeNull();
	expect(runIdsOf({ runIds: [] })).toEqual([]);
});

test("register：我们自己签出来的最长 key 也进得来，离上限还有余量", () => {
	expect(REAL_KEY.length).toBeLessThan(MAX_INGEST_STORAGE_KEY_LENGTH);
	expect(registerWith(REAL_KEY).success).toBe(true);
});

test("register：storageKey 有长度上限，任意长的字符串进不来", () => {
	const parsed = registerWith("a".repeat(MAX_INGEST_STORAGE_KEY_LENGTH + 1));
	expect(parsed.success).toBe(false);
	expect(JSON.stringify(parsed.error?.issues)).toContain(
		String(MAX_INGEST_STORAGE_KEY_LENGTH)
	);
});

test("register：空 storageKey 仍然拒（上限没把下限挤掉）", () => {
	expect(registerWith("").success).toBe(false);
});
