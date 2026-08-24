/**
 * 测试任务列表页的 URL search 参数。
 *
 * 与用例列表同一条约定（`workspace-search.ts`）：筛选状态写进 URL，
 * 刷新、后退、分享链接都能复原同一份视图。
 */
import { testRunStatusSchema } from "@automationstack/api/schemas/test-run";
import { z } from "zod";

/**
 * 参数名是 `runStatus` 而不是 `status`，这一条是硬约束不是口味问题。
 *
 * TanStack Router 把所有路由的 search 并成一个联合类型来校验 `<Link search={fn}>`
 * 这类「接受当前 search、返回新 search」的 reducer。用例列表页已经占了 `status`
 * （draft/active/deprecated），本页再占一次同名键，两个枚举会在那个联合里撞上，
 * 结果是 workspace-search.ts 里所有 reducer（clearModuleSelection 之类）
 * 在**别的页面**上集体编译不过——已经实测过一次。
 */
export const testRunsSearchSchema = z.object({
	/**
	 * 名称/说明关键词；缺省 = 不筛选。空串一律写成 undefined，
	 * 否则清空搜索框会在 URL 上留下一个 `?runKeyword=` 的尾巴。
	 *
	 * 前缀同 `runStatus`，理由见上：用例列表页已经占了 `kw`，这里再占一次同名键，
	 * 两个页面的 search 会在 TanStack Router 的联合类型里挤在一起。目前两边碰巧
	 * 都是 `string | undefined` 能对上，但那是巧合——哪天用例那边把 `kw` 改成
	 * 数组或对象，塌的会是**别的页面**的 reducer，而不是这里。
	 */
	runKeyword: z.string().optional(),
	/** 状态筛选；缺省 = 不筛选。 */
	runStatus: testRunStatusSchema.optional(),
});

export type TestRunsSearch = z.infer<typeof testRunsSearchSchema>;

/**
 * `testRuns.list` 的输入。
 *
 * 单独一处定义：路由 loader（SSR 预取）与页面组件必须命中**同一个 query key**，
 * 两边各拼一次早晚会差一个字段，那时预取会静默失效、首屏白等一次请求。
 */
export function testRunListInput(projectId: string, search: TestRunsSearch) {
	return {
		keyword: search.runKeyword,
		projectId,
		status: search.runStatus,
	};
}
