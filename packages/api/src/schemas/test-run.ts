import { z } from "zod";

/**
 * 与 `packages/db/src/schema/test-runs.ts` 的 pgEnum 一一对应，但**故意重写一遍**
 * 而不是从 db 包 import 枚举值：那个对象是 drizzle 的 pgEnum 实例，
 * import 它会把 drizzle 拖进 api 包，而本包只允许 type-only 依赖 db。
 */
export const testRunStatusSchema = z.enum([
	"pending_review",
	"ready",
	"in_progress",
	"completed",
	"submitted",
]);

export const testRunCaseResultSchema = z.enum([
	"untested",
	"passed",
	"failed",
	"blocked",
	"skipped",
]);

export const runIdSchema = z.object({ runId: z.uuid() });

/**
 * **单个步骤**的判定。与 `testRunCaseResultSchema` 差一个 `untested`，
 * 理由见 db 侧 `TestRunStepResult` 的注释：保存时没点过的步骤一律落成
 * `skipped`，库里不存在「判了一半」的步骤。
 *
 * 同样是照着 pgEnum 的取值重写一遍而不是从 db 包 import——本包只允许
 * type-only 依赖 db，理由见本文件开头。
 */
export const testRunStepResultSchema = z.enum([
	"passed",
	"failed",
	"blocked",
	"skipped",
]);
