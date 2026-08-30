import { useParams, useRouterState } from "@tanstack/react-router";

import { isCaseSectionPathname } from "@/components/layout/case-section-path";

/** 只取 pathname：整个 location 拿来比较的话，search/hash 一变外壳就白重画一次。 */
const selectPathname = (state: { location: { pathname: string } }) =>
	state.location.pathname;

/**
 * 当前是不是用例管理这一段（判据见 case-section-path.ts）。
 *
 * 做成 hook 而不是让调用方各自传一个布尔 prop：用它的两处——外壳里的二级面板
 * 与顶栏里的面板开关——分处 ProjectShell 与 ProjectShellHeader 两个组件，而
 * ProjectShellHeader 还被加载态骨架复用。走 prop 就得在三个调用点各算一遍，
 * 算错一处的表现是「有开关没面板」或「加载完面板凭空出现」。
 *
 * projectId 从路由参数里取而不是当参数传，也是同一个理由：ProjectShellHeader
 * 手上没有 projectId，为它加一个 prop 等于把这份耦合摊到每个调用点。
 * strict: false —— 这个 hook 只在 /projects/$projectId 底下用得着，但类型上
 * 不绑死在那条路由上；拿不到 projectId 时（不该发生）当作「不在用例段」。
 */
export function useIsCaseSection(): boolean {
	const { projectId } = useParams({ strict: false });
	const pathname = useRouterState({ select: selectPathname });
	return projectId !== undefined && isCaseSectionPathname(pathname, projectId);
}
