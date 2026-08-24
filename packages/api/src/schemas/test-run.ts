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
