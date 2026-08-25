/**
 * 附件通道里**两个阶段共用**的拒绝文案（plan §5.6）。
 *
 * 单独成一个模块是因为它们跨阶段：presign（`./attachment-presign`）与
 * register（`./attachment-register`）会对同一件事——任务已提交、任务不存在、
 * 用例行已被移出任务范围——给出同一句话。措辞一旦在两边各写一份就会分叉，
 * 而上报方读到的是同一份对账单，两种口径解释同一件事只会让人以为是两回事。
 *
 * 这里一行 SQL 都不发、也没有任何 db import，纯字符串拼装。
 */

/** R2 未配置时每条请求项的拒绝理由（§5.6 / 第二期 D9 同构的优雅降级）。 */
export const REASON_STORAGE_UNCONFIGURED =
	"附件存储（R2）未配置，本轮附件未上传；结论已照常写入";

/**
 * 任务名在**登记**阶段拿不到（请求里只有 id，presign 那一轮才带过 `runName`），
 * 所以两个阶段共用的说明都收 `string | null`：
 * 有名字就指名道姓，没有就说「该测试任务」，绝不在文案里塞一个 uuid——
 * SDK 那边已经有 runId，人看的那一行不需要再念一遍。
 */
function nameRun(runName: string | null): string {
	return runName === null ? "该测试任务" : `测试任务「${runName}」`;
}

/** 解析之后、签名/登记之前用例行被移出了任务范围（`prepareRunAttachmentUploads` 的差集）。 */
export function describeRunCaseVanished(runName: string | null): string {
	return `${nameRun(runName)}的用例范围被改动，这条用例行已不在其中，请重跑`;
}

/** `test_runs` 行已被提交/删除时的说明，与结论那一侧的措辞对齐。 */
export function describeRunUnwritable(
	rejection: { kind: "locked"; submittedAt: Date } | { kind: "not-found" },
	runName: string | null
): string {
	if (rejection.kind === "locked") {
		return `${nameRun(runName)}已于 ${rejection.submittedAt.toLocaleString("zh-CN")} 提交并锁定，附件未受理`;
	}
	return `${nameRun(runName)}已不存在，附件未受理`;
}
