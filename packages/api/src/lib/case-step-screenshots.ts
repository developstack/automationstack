import type { CaseStep } from "@automationstack/db/schema/test-cases";

/** 步骤中出现的所有步骤截图 id，去掉重复，按出现的顺序。 */
export function stepScreenshotIds(
	steps: readonly Pick<CaseStep, "screenshots">[] | undefined
): string[] {
	const ids = new Set<string>();
	for (const step of steps ?? []) {
		for (const id of step.screenshots ?? []) {
			ids.add(id);
		}
	}
	return [...ids];
}

/** 不属于这个用例的步骤截图 id。owned 是这个用例的附件 id。 */
export function foreignScreenshotIds(
	steps: readonly Pick<CaseStep, "screenshots">[] | undefined,
	owned: ReadonlySet<string>
): string[] {
	return stepScreenshotIds(steps).filter((id) => !owned.has(id));
}

export const FOREIGN_SCREENSHOT_MESSAGE = "步骤截图引用了不属于这个用例的附件";
