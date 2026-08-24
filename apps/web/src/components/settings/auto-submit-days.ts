/**
 * 自动提交等待天数的取值区间与输入校验。
 *
 * **区间不是在这里定的**，权威在 `packages/db/src/schema/project-settings.ts`
 * （同一对常量既喂给 CHECK 约束，也喂给 API 层的 zod）。这里做的是把那两个值
 * **钉在编译期**：`typeof` 取到的是 `const` 声明的字面量类型（`1` / `30`），
 * 后端哪天把上界从 30 改成 60，下面这两行会立刻编译不过，而不是等到用户在
 * 输入框里填 45、被服务端的 zod 悄悄退回来。
 *
 * 为什么不直接 `import { MIN_... }` 把值拿过来：那是**值导入**，会把
 * `drizzle-orm/pg-core` 连同整张表定义拖进浏览器产物。`apps/web` 里所有
 * `@automationstack/db` 的引用至今都是 `import type`（类型在编译期抹掉，
 * 零运行时代价），这条边界不该由一个设置页来破。
 *
 * 后端**没有把这两个常量放在 `packages/api` 的可共享出口上**（`schemas/` 下
 * 那种既是值又不带 drizzle 的模块），有的话这里就该直接引用、连镜像都不必写。
 */
import type {
	MAX_AUTO_SUBMIT_AFTER_COMPLETED_DAYS,
	MIN_AUTO_SUBMIT_AFTER_COMPLETED_DAYS,
} from "@automationstack/db/schema/project-settings";

export const MIN_AUTO_SUBMIT_DAYS: typeof MIN_AUTO_SUBMIT_AFTER_COMPLETED_DAYS = 1;
export const MAX_AUTO_SUBMIT_DAYS: typeof MAX_AUTO_SUBMIT_AFTER_COMPLETED_DAYS = 30;

/** 只认十进制正整数：`3.5`、`3e0`、`+3` 一律不是天数。 */
const INTEGER_PATTERN = /^\d+$/;

export type AutoSubmitDaysResult =
	| { kind: "invalid"; message: string }
	| { kind: "ok"; days: number };

/**
 * 校验输入框里的原始字符串。
 *
 * 输入框的值一律按字符串管理、不在 onChange 里转数字：转了之后「删空重填」
 * 的中间态（空串、单个 `-`）会被 Number 折成 0 或 NaN 回写进框里，
 * 光标位置和已输入的内容一起被冲掉。
 */
export function validateAutoSubmitDays(raw: string): AutoSubmitDaysResult {
	const trimmed = raw.trim();
	if (trimmed === "") {
		return { kind: "invalid", message: "请填写天数。" };
	}
	if (!INTEGER_PATTERN.test(trimmed)) {
		return { kind: "invalid", message: "天数必须是整数。" };
	}
	const days = Number(trimmed);
	if (days < MIN_AUTO_SUBMIT_DAYS || days > MAX_AUTO_SUBMIT_DAYS) {
		return {
			kind: "invalid",
			message: `天数需在 ${MIN_AUTO_SUBMIT_DAYS}–${MAX_AUTO_SUBMIT_DAYS} 之间。`,
		};
	}
	return { days, kind: "ok" };
}
