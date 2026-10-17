import type { TestCase } from "@automationstack/db/schema/test-cases";
import { describe, expect, it } from "vitest";

import { signJson } from "../auth/hmac";
import { MAX_FILTER_BATCH_CASES } from "../schemas/case";
import { testCaseId as caseId } from "../test-fixtures";
import {
	CASE_STATUS_UNDO_TOKEN_TTL_SECONDS,
	type CaseStatusUndo,
	caseStatusUndoOf,
	readCaseStatusUndoToken,
	signCaseStatusUndoToken,
} from "./case-status-undo-token";

const SECRET = "test-session-secret-0123456789abcdef";
const NOW = Date.parse("2026-10-18T08:00:00Z");
const TTL_MS = CASE_STATUS_UNDO_TOKEN_TTL_SECONDS * 1000;
const PROJECT_ID = "55555555-5555-4555-8555-555555555555";
const USER_ID = "11111111-1111-4111-8111-111111111111";

const UNDO: CaseStatusUndo = {
	idsByPreviousStatus: { active: [caseId(2)], draft: [caseId(1), caseId(3)] },
	projectId: PROJECT_ID,
	status: "deprecated",
	userId: USER_ID,
};

const sign = (undo: CaseStatusUndo = UNDO) =>
	signCaseStatusUndoToken(undo, { now: NOW, secret: SECRET });

const read = async (token: string, now = NOW) =>
	readCaseStatusUndoToken(token, { now, secret: SECRET });

describe("撤销凭证：签名后客户端不能改变其中的用例、状态、项目或用户，过期后不能再用", () => {
	it.each([
		["签发后立刻", NOW],
		["到期的那一刻", NOW + TTL_MS],
	])("%s读回这次修改", async (_name, now) => {
		expect(await read(await sign(), now)).toEqual({ kind: "ok", undo: UNDO });
	});

	it("有效期过后：报告过期", async () => {
		expect(await read(await sign(), NOW + TTL_MS + 1)).toEqual({
			kind: "expired",
		});
	});

	it.each<[string, () => Promise<string>]>([
		[
			"用别的密钥签名的凭证",
			() => signCaseStatusUndoToken(UNDO, { now: NOW, secret: `${SECRET}x` }),
		],
		[
			"改过载荷的凭证",
			async () => {
				const [, signature] = (await sign()).split(".");
				const forged = await signJson({ ...UNDO, status: "active" }, SECRET);
				return `${forged.split(".")[0]}.${signature}`;
			},
		],
		[
			"同一个密钥签名的其他值（例如截图上传凭证）",
			() =>
				signJson(
					{
						...UNDO,
						exp: NOW + TTL_MS,
						purpose: "case-step-screenshot-upload",
					},
					SECRET
				),
		],
		["空字符串", () => Promise.resolve("")],
	])("%s：无效", async (_name, token) => {
		expect(await read(await token())).toEqual({ kind: "invalid" });
	});

	it(`${MAX_FILTER_BATCH_CASES} 条用例的凭证远小于 RPC 请求体的上限（2 MiB）`, async () => {
		const ids = Array.from({ length: MAX_FILTER_BATCH_CASES }, (_, index) =>
			caseId(index)
		);
		const token = await sign({
			...UNDO,
			idsByPreviousStatus: {
				active: ids.slice(0, 500),
				draft: ids.slice(500),
			},
		});
		expect(token.length).toBeLessThan(64 * 1024);
		expect((await read(token)).kind).toBe("ok");
	});
});

function change(
	index: number,
	previousStatus: TestCase["status"],
	written: boolean
) {
	return {
		previousStatus,
		testCase: { id: caseId(index), projectId: PROJECT_ID },
		version: written ? { version: 2 } : null,
	};
}

describe("caseStatusUndoOf：撤销只恢复状态有变化的用例，按原来的状态分组", () => {
	it("原来就是目标状态的用例不在其中", () => {
		expect(
			caseStatusUndoOf(
				[
					change(1, "draft", true),
					change(2, "active", true),
					change(3, "draft", true),
					change(4, "deprecated", false),
				],
				{ status: "deprecated", userId: USER_ID }
			)
		).toEqual(UNDO);
	});

	it.each([
		["没有修改任何用例", []],
		["用例原来都是目标状态", [change(1, "deprecated", false)]],
	])("%s：没有可以撤销的修改，返回 null", (_name, changes) => {
		expect(
			caseStatusUndoOf(changes, { status: "deprecated", userId: USER_ID })
		).toBeNull();
	});
});
