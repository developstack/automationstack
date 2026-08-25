import {
	type IngestExecutionResult,
	MAX_INGEST_COMMENT_LENGTH,
} from "./execution-contract";

/**
 * 上报请求里那批 `results` **自身**的两道纯折算：整批去重与 `message` 归一化
 * （plan §5.1.1）。
 *
 * 与「哪条用例落在哪个任务上」无关——这两件事只看请求体，不需要
 * `AutomationTargetRow`，也就没有理由跟着分桶一起长。分在这里之后
 * `./execution-reconcile` 只剩「候选行 → 桶」一件事，而去重能在**任何写操作
 * 之前**被 `./execution-ingest` 单独调用（整批拒绝就该是「什么都没发生」）。
 */

/** 截断标记本身也算进上限，否则「防御性截断」会把长度顶出上限一点点。 */
const TRUNCATION_MARKER = "…（已截断）";

/**
 * 这一批里重复出现的 `sourceRef`。非空即整批拒绝（400），不做「后者胜」。
 *
 * **为什么不静默挑一条**：同一条用例在一次上报里报了两次，哪一次是权威结论
 * 是真正的产品歧义——脚本 retry 了？两个 suite 用了同一个 ref？参数化用例
 * 忘了区分？沉默地挑一条，上报方会以为一切正常，而库里躺着的那条结论
 * 是抛硬币抛出来的。db 层的 `applyAutomationVerdicts` 对重复 `runCaseId`
 * 已经抛错兜底，但那是一句给不出人话的 500；在这一层拒绝，
 * 上报方拿到的是「这几条报重了」加一串 ref。
 */
export function findDuplicateSourceRefs(
	results: IngestExecutionResult[]
): string[] {
	const seen = new Set<string>();
	const duplicated = new Set<string>();
	for (const item of results) {
		if (seen.has(item.sourceRef)) {
			duplicated.add(item.sourceRef);
			continue;
		}
		seen.add(item.sourceRef);
	}
	return [...duplicated];
}

/**
 * `message` → `comment`：去空白、空串折算成 null、超长截断（§5.1.1）。
 *
 * 空串折算成 null 而不是原样存：`comment` 为空串时前端的失败清单会渲染出
 * 一个空的说明行，而「没有说明」和「说明是空的」对看清单的人没有区别。
 */
export function normalizeIngestComment(
	message: string | null | undefined
): string | null {
	if (message === null || message === undefined) {
		return null;
	}
	const trimmed = message.trim();
	if (trimmed.length === 0) {
		return null;
	}
	if (trimmed.length <= MAX_INGEST_COMMENT_LENGTH) {
		return trimmed;
	}
	return (
		trimmed.slice(0, MAX_INGEST_COMMENT_LENGTH - TRUNCATION_MARKER.length) +
		TRUNCATION_MARKER
	);
}
