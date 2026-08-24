/**
 * 自动提交天数的三个常量，**这个文件不 import drizzle，也不 import 任何 db 运行时**。
 *
 * 单独成文件的唯一理由是消费方：前端要用它们做输入框的 min/max 与提示文案，
 * 而它们原本长在 `./project-settings.ts` 里——那个文件顶上是
 * `from "drizzle-orm/pg-core"`，前端一旦 value-import 就把整个 pg-core 拖进
 * 浏览器产物，于是前端只能 `import type` + `typeof` 再手抄一份 `1` / `30`，
 * 「单一真相」当场变成两份，而且抄错了没有任何地方会报错。
 *
 * 同类先例：`repositories/test-run-metrics-core.ts`（`apps/web` 已在 value-import 它）。
 * 判断标准就一条：**这个模块的 import 里不许出现 drizzle。**
 *
 * `./project-settings.ts` 反过来 import 这里，并原样 re-export，
 * 所以既有的 `@automationstack/db/schema/project-settings` 导入路径不变。
 */

/**
 * 测试任务完成后无人提交、超时自动提交并锁死的**兜底默认天数**。
 *
 * 「兜底」是关键：`project_settings` 行是**懒创建**的，项目没进过设置页就没有行，
 * 读取方一律 `COALESCE(project_settings.auto_submit_after_completed_days, 3)`。
 * 建项目时不插默认行——那会让「用户显式选了 3 天」和「用户从没管过」变得无法区分，
 * 将来想改默认值时也只能改新项目，老项目全被钉死在旧默认上。
 *
 * **没有定时任务，自动提交是读路径上的惰性结算**（详见
 * `schema/test-runs.ts` 的 `submittedAt`）。判定条件：
 *
 * ```sql
 * status = 'completed' AND submitted_at IS NULL
 *   AND completed_at < now() - (coalesce(ps.auto_submit_after_completed_days, 3) || ' days')::interval
 * ```
 *
 * 天数挂在 `completedAt` 而不是 `updatedAt` 上，于是**重开会自然重置倒计时**：
 * 测试任务退回 `in_progress` 时 `completedAt` 置 null，再次完成时重新开始计时。
 */
export const DEFAULT_AUTO_SUBMIT_AFTER_COMPLETED_DAYS = 3;

/**
 * 自动提交天数的合法下界。
 *
 * 0 天等于「一完成就锁死」，那等于取消了「完成后还能改」这件事，
 * 想要这个语义应该是另一个开关，而不是把天数调成 0 悄悄改变流程含义。
 */
export const MIN_AUTO_SUBMIT_AFTER_COMPLETED_DAYS = 1;

/**
 * 自动提交天数的合法上界。
 *
 * 再长就不是「给团队几天确认」而是「永远不锁」，报告会无限期停在可改状态，
 * 等于没有终态。
 *
 * API 层的 zod schema 与数据库 CHECK 约束都直接复用这两个常量，
 * 前端的输入框也应当从这里取，让校验只有一处真相。
 */
export const MAX_AUTO_SUBMIT_AFTER_COMPLETED_DAYS = 30;
