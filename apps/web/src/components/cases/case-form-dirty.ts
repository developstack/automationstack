/**
 * 用例表单「有没有未保存的改动」的判定。
 *
 * 抽屉外壳本身（宽度、字号、二次确认弹层）在 components/wide-sheet-shell.tsx，
 * 那份是全站共用的；留在这里的只有**用例表单自己的字段口径**——每张表单的
 * 字段都不一样，这一份没法、也不该被别的表单复用。
 */
import type { CaseFormValues } from "@/components/cases/case-meta";

/**
 * 字段级指纹，用来判断「有没有未保存的改动」。
 * 不直接 JSON.stringify 整个对象：那样结果依赖键的插入顺序，
 * 而表单值一路是 `{...values, name}` 这样展开出来的。
 */
function caseFormFingerprint(values: CaseFormValues): string {
	return JSON.stringify([
		values.caseType,
		values.maintainer,
		values.name,
		values.preconditions,
		values.priority,
		values.status,
		values.tagsText,
		values.steps.map((step) => [step.id, step.step, step.expected]),
	]);
}

/** 当前表单值与基线（新建为空表单 / 编辑为服务端最新值）是否已经不同。 */
export function isCaseFormDirty(
	values: CaseFormValues | null,
	baseline: CaseFormValues
): boolean {
	if (values === null) {
		return false;
	}
	return caseFormFingerprint(values) !== caseFormFingerprint(baseline);
}
