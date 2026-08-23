/**
 * 用例表单的必填校验。
 *
 * 表单用 noValidate 关掉浏览器原生气泡：原生提示是英文的、不受读屏 aria 关联，
 * 也无法在同一处同时表达 aria-invalid + 内联错误文案，所以自己校验。
 */
import type { CaseFormValues } from "@/components/cases/case-meta";

export const CASE_NAME_FIELD_ID = "case-name";

const NAME_REQUIRED_MESSAGE = "请填写用例名称";

/** 返回错误文案；通过校验时返回 null。 */
export function validateCaseName(values: CaseFormValues): string | null {
	return values.name.trim() === "" ? NAME_REQUIRED_MESSAGE : null;
}

/**
 * 校验失败后把焦点移到第一个错误字段。
 * 这里按 id 取而不是层层传 ref：输入框藏在 CaseForm → CaseTextFields →
 * CaseTextField 三层里，为了一次聚焦把 ref 串三层反而更容易失手。
 */
export function focusCaseNameField(): void {
	document.getElementById(CASE_NAME_FIELD_ID)?.focus();
}
