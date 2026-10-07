const MINDMAP_PATH_SUFFIX = "/mindmap";

export function isCaseSectionPathname(
	pathname: string,
	projectId: string
): boolean {
	if (pathname.endsWith(MINDMAP_PATH_SUFFIX)) {
		return true;
	}
	const projectRoot = `/projects/${projectId}`;
	return pathname === projectRoot || pathname === `${projectRoot}/`;
}
