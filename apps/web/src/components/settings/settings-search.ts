/**
 * 设置页的 URL 查询参数。
 *
 * 「当前正在配置哪个项目」放在地址栏而不是组件状态里：刷新、后退、把链接
 * 贴给同事，三件事要落在同一个项目的设置上，只有 URL 能同时满足三者。
 */
import { z } from "zod";

export const settingsSearchSchema = z.object({
	/**
	 * `.catch(undefined)` 不是可有可无的兜底：手抄断的链接（截了一半的 uuid）
	 * 若让 validateSearch 抛出去，整页会掉到路由的错误边界上，而这时正确的
	 * 行为是当作「还没选项目」，让人在页面上重新挑一个。
	 */
	projectId: z.uuid().optional().catch(undefined),
});

export type SettingsSearch = z.infer<typeof settingsSearchSchema>;
