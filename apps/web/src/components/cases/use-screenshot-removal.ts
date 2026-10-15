import type { TestCase } from "@automationstack/db/schema/test-cases";
import { isDefinedError } from "@orpc/client";
import { useCallback } from "react";

import {
	type CaseFormValues,
	caseToFormValues,
} from "@/components/cases/case-meta";
import { withoutStepScreenshot } from "@/components/cases/step-screenshots";
import {
	type CaseSaveConflict,
	caseSaveBaseVersion,
	type useUpdateCase,
} from "@/components/cases/use-case-mutations";

interface ScreenshotRemovalInput {
	caseId: string;
	conflict: CaseSaveConflict | null;
	mutation: ReturnType<typeof useUpdateCase>["mutation"];
	/** 保存冲突时调用，参数是删除了截图的表单，用户的修改不丢失。 */
	onConflict: (values: CaseFormValues) => void;
	testCase: TestCase | undefined;
}

/**
 * 在只读视图中删除一张步骤截图：只保存步骤，使用与编辑区相同的更新和版本检查。
 * 其他人先保存时，进入编辑状态并显示冲突提示，删除保留在表单中。
 * R2 中的对象不删除，因为旧版本仍然显示它。
 */
export function useScreenshotRemoval({
	caseId,
	conflict,
	mutation,
	onConflict,
	testCase,
}: ScreenshotRemovalInput) {
	return useCallback(
		(stepId: string, attachmentId: string) => {
			if (!testCase || mutation.isPending) {
				return;
			}
			const steps = withoutStepScreenshot(testCase.steps, stepId, attachmentId);
			mutation.mutate(
				{
					expectedVersion: caseSaveBaseVersion(
						testCase.currentVersion,
						conflict
					),
					id: caseId,
					patch: { steps },
				},
				{
					onError: (error) => {
						if (isDefinedError(error) && error.code === "CONFLICT") {
							onConflict({ ...caseToFormValues(testCase), steps });
						}
					},
				}
			);
		},
		[caseId, conflict, mutation, onConflict, testCase]
	);
}
