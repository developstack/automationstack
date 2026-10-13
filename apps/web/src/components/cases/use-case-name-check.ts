import { useCallback, useState } from "react";

import {
	focusCaseNameField,
	validateCaseName,
} from "@/components/cases/case-form-validation";
import type { CaseFormValues } from "@/components/cases/case-meta";

export interface CaseNameCheck {
	/** 提交前检查名称。名称为空时记下错误，把焦点移到名称字段，并返回 false。 */
	check: (values: CaseFormValues) => boolean;
	/**
	 * 名称字段旁边显示的错误。第一次提交之后实时检查：
	 * 名称填好后错误立即消失，名称再次清空时错误再次出现。
	 */
	errorFor: (values: CaseFormValues | null) => string | null;
	reset: () => void;
}

/** 编辑和新建用例共用的名称检查。错误显示在名称字段旁边。 */
export function useCaseNameCheck(): CaseNameCheck {
	const [submittedError, setSubmittedError] = useState<string | null>(null);

	const check = useCallback((values: CaseFormValues) => {
		const error = validateCaseName(values);
		setSubmittedError(error);
		if (error !== null) {
			focusCaseNameField();
		}
		return error === null;
	}, []);

	const errorFor = useCallback(
		(values: CaseFormValues | null) =>
			submittedError !== null && values !== null
				? validateCaseName(values)
				: null,
		[submittedError]
	);

	const reset = useCallback(() => setSubmittedError(null), []);

	return { check, errorFor, reset };
}
