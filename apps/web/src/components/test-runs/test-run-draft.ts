/**
 * 测试任务表单「有没有未保存的改动」的判定，供三个抽屉共用：
 * 新建测试任务、从失败用例创建重测任务、追加用例。
 *
 * 与用例表单那一份（cases/case-form-dirty.ts）分开写而不是套过来：
 * 那边的指纹是按用例的字段（步骤、优先级、标签…）列的，测试任务这边
 * 只有名称、说明和一批勾中的用例 id。硬套的结果是两边谁改字段都要动对方。
 */

export interface TestRunDraft {
	/** 勾中的用例 id。追加用例的抽屉只用这一项，名称与说明留空。 */
	caseIds: string[];
	description: string;
	name: string;
}

/**
 * 指纹里的 caseIds 先排序再比：选中集是 `[...new Set(...)]` 展开出来的，
 * 勾掉再勾回来会换一个顺序，但那明明是「什么都没改」。
 * 名称与说明不 trim——用户敲进去的空格也是敲进去的内容，误关一样会丢。
 */
function testRunDraftFingerprint(draft: TestRunDraft): string {
	return JSON.stringify([
		[...draft.caseIds].sort(),
		draft.description,
		draft.name,
	]);
}

/**
 * 当前草稿与基线（新建为空、重测为预填的「XX 重测」）是否已经不同。
 * 基线不是常量：从失败用例创建时名称一开始就有值，拿空表单当基线的话
 * 一打开就被判定为「有未保存的改动」，每次关闭都要多点一次确认。
 */
export function isTestRunDraftDirty(
	draft: TestRunDraft,
	baseline: TestRunDraft
): boolean {
	return testRunDraftFingerprint(draft) !== testRunDraftFingerprint(baseline);
}
