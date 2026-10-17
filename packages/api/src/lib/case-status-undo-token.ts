import type { CaseStatus } from "@automationstack/db/schema/test-cases";
import { z } from "zod";

import { signJson, verifySignedJson } from "../auth/hmac";
import { caseStatusSchema, MAX_FILTER_BATCH_CASES } from "../schemas/case";

/**
 * 撤销一次用例状态修改的凭证（undoToken）。cases.changeStatus 修改了状态时由服务端签发，
 * cases.undoStatusChange 凭它把用例恢复为原来的状态。凭证用 SESSION_SECRET 签名，客户端不能
 * 改变其中的用例、状态、项目或用户，所以撤销只能恢复这次修改改过的用例，按 id 一次改超过
 * MAX_BATCH_CASES 条用例只能通过按筛选条件修改和它的撤销。服务端不保存凭证，所以有效期内
 * 同一个用户可以再次使用同一个凭证；撤销只恢复现在还是这次修改改为的状态的用例，再次使用时
 * 只影响又被改回这个状态的用例，并且这个用户本来就可以修改这些用例。
 */

const SECONDS_PER_MINUTE = 60;

const MS_PER_SECOND = 1000;

/**
 * 凭证的有效期（分钟）。网页中带「撤销」的提示显示 4 秒（sonner 的默认值），鼠标停在提示上
 * 或页面在后台时计时暂停，所以留出两分钟。过期后要撤销只能手动修改状态。
 */
const CASE_STATUS_UNDO_TOKEN_TTL_MINUTES = 2;

export const CASE_STATUS_UNDO_TOKEN_TTL_SECONDS =
	CASE_STATUS_UNDO_TOKEN_TTL_MINUTES * SECONDS_PER_MINUTE;

/** 凭证的用途。同一个密钥也签名会话和上传凭证，用途不同的签名值不能当作撤销凭证。 */
const TOKEN_PURPOSE = "case-status-undo";

/** 一次状态修改：改为哪个状态，每条改过的用例原来的状态，所在的项目，以及修改的用户。 */
export interface CaseStatusUndo {
	/** 按原来的状态分组的用例 id。比每条用例带一个状态短，1000 条用例的凭证约 52 KB。 */
	idsByPreviousStatus: Partial<Record<CaseStatus, string[]>>;
	projectId: string;
	/** 这次修改改为的状态。撤销时只恢复现在还是这个状态的用例。 */
	status: CaseStatus;
	/** 修改的用户。只有这个用户可以撤销。 */
	userId: string;
}

const tokenPayloadSchema = z.object({
	exp: z.number(),
	idsByPreviousStatus: z.partialRecord(
		caseStatusSchema,
		z.array(z.uuid()).max(MAX_FILTER_BATCH_CASES)
	),
	projectId: z.uuid(),
	purpose: z.literal(TOKEN_PURPOSE),
	status: caseStatusSchema,
	userId: z.uuid(),
});

export type ReadCaseStatusUndoTokenResult =
	| { kind: "expired" }
	| { kind: "invalid" }
	| { kind: "ok"; undo: CaseStatusUndo };

interface TokenClock {
	now: number;
	secret: string;
}

export function signCaseStatusUndoToken(
	undo: CaseStatusUndo,
	{ now, secret }: TokenClock
): Promise<string> {
	return signJson(
		{
			...undo,
			exp: now + CASE_STATUS_UNDO_TOKEN_TTL_SECONDS * MS_PER_SECOND,
			purpose: TOKEN_PURPOSE,
		},
		secret
	);
}

export async function readCaseStatusUndoToken(
	token: string,
	{ now, secret }: TokenClock
): Promise<ReadCaseStatusUndoTokenResult> {
	const parsed = tokenPayloadSchema.safeParse(
		await verifySignedJson(token, secret)
	);
	if (!parsed.success) {
		return { kind: "invalid" };
	}
	const { exp, purpose: _purpose, ...undo } = parsed.data;
	if (now > exp) {
		return { kind: "expired" };
	}
	return { kind: "ok", undo };
}

/** cases.changeStatus 的一条结果中撤销用到的部分。 */
interface ChangedCase {
	previousStatus: CaseStatus;
	testCase: { id: string; projectId: string };
	/** 状态没有变化时为 null：撤销时不动。 */
	version: unknown;
}

/**
 * 一次状态修改的撤销内容：只含状态有变化的用例，按原来的状态分组。
 * 没有用例的状态有变化时返回 null，没有可以撤销的修改。
 */
export function caseStatusUndoOf(
	changes: readonly ChangedCase[],
	{ status, userId }: { status: CaseStatus; userId: string }
): CaseStatusUndo | null {
	const written = changes.filter((change) => change.version !== null);
	const [first] = written;
	if (first === undefined) {
		return null;
	}
	const idsByPreviousStatus: Partial<Record<CaseStatus, string[]>> = {};
	for (const { previousStatus, testCase } of written) {
		const ids = idsByPreviousStatus[previousStatus] ?? [];
		ids.push(testCase.id);
		idsByPreviousStatus[previousStatus] = ids;
	}
	return {
		idsByPreviousStatus,
		projectId: first.testCase.projectId,
		status,
		userId,
	};
}
