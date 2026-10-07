import { useParams, useRouterState } from "@tanstack/react-router";

import { isCaseSectionPathname } from "@/components/layout/case-section-path";

const selectPathname = (state: { location: { pathname: string } }) =>
	state.location.pathname;

export function useIsCaseSection(): boolean {
	const { projectId } = useParams({ strict: false });
	const pathname = useRouterState({ select: selectPathname });
	return projectId !== undefined && isCaseSectionPathname(pathname, projectId);
}
