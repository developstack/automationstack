/**
 * 列表页那两个「把筛选写进 URL」的回调，从 TestRunListView 里整体搬出来。
 *
 * **在原处、按原顺序调用**：两个 useCallback 的相对次序与拆之前逐个相同，
 * 依赖数组（都是 `[navigate]`）也一个字没动。
 *
 * `navigate` 由调用方传进来，这个 hook 自己不调 useNavigate：原文件里
 * useNavigate 排在两个 useState **前面**，搬进来就等于把它往后挪三格。
 * 这一格今天不改变任何行为，但 hook 顺序是纯结构重构里最不值得赌的东西。
 *
 * 开合新建/编辑的那三个回调没有一起搬走：它们依赖组件自己的两个 setState，
 * 搬出去之后 biome 认不出「setState 的引用天然稳定」，会逼着往依赖数组里
 * 补两个名字——那就不再是「一个字没动」了。留在原地反而更干净。
 */
import type { TestRunStatus } from "@automationstack/db/schema/test-runs";
import type { UseNavigateResult } from "@tanstack/react-router";
import { useCallback } from "react";

type ListNavigate = UseNavigateResult<"/projects/$projectId/test-runs/">;

export function useTestRunListFilters(navigate: ListNavigate) {
	const setStatus = useCallback(
		(status: TestRunStatus | undefined) => {
			navigate({ search: (prev) => ({ ...prev, runStatus: status }) });
		},
		[navigate]
	);

	/*
	 * replace: true —— 关键词是防抖输入，每停手一次就是一条历史记录，
	 * 不 replace 的话「后退」要按到手软才能真的离开这一页。
	 * 值没变就原样返回，不产生导航：挂载时那次防抖也会推一遍当前值，
	 * 无条件 navigate 会让深链在进入页面 300ms 后被自己覆盖一次。
	 */
	const setKeyword = useCallback(
		(keyword: string) => {
			const runKeyword = keyword === "" ? undefined : keyword;
			navigate({
				replace: true,
				search: (prev) =>
					prev.runKeyword === runKeyword ? prev : { ...prev, runKeyword },
			});
		},
		[navigate]
	);

	return { setKeyword, setStatus };
}
