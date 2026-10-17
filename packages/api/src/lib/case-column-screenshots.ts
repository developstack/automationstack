import {
	type CaseStep,
	COLUMN_SCREENSHOT_KEYS,
} from "@automationstack/db/schema/test-cases";

/** 步骤中两组截图的所有附件 id，去掉重复，按出现的顺序。 */
export function columnScreenshotIds(
	steps: readonly Partial<CaseStep>[] | undefined
): string[] {
	const ids = new Set<string>();
	for (const step of steps ?? []) {
		for (const key of COLUMN_SCREENSHOT_KEYS) {
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
	return columnScreenshotIds(steps).filter((id) => !owned.has(id));
}

export const FOREIGN_SCREENSHOT_MESSAGE =
	"操作截图或预期截图引用了不属于这个用例的附件";
