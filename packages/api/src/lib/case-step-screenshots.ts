import {
	CASE_STEP_SCREENSHOT_KEYS,
	type CaseStep,
} from "@automationstack/db/schema/test-cases";

/** 步骤中两组截图的所有附件 id，去掉重复，按出现的顺序。 */
export function stepScreenshotIds(
	steps: readonly Partial<CaseStep>[] | undefined
): string[] {
	const ids = new Set<string>();
	for (const step of steps ?? []) {
		for (const key of CASE_STEP_SCREENSHOT_KEYS) {
			for (const id of step[key] ?? []) {
				ids.add(id);
			}
		}
	}
	return [...ids];
}

/** 不属于这个用例的截图 id。owned 是这个用例的附件 id。 */
export function foreignScreenshotIds(
	steps: readonly Partial<CaseStep>[] | undefined,
	owned: ReadonlySet<string>
): string[] {
	return stepScreenshotIds(steps).filter((id) => !owned.has(id));
}

export const FOREIGN_SCREENSHOT_MESSAGE =
	"操作截图或预期截图引用了不属于这个用例的附件";
