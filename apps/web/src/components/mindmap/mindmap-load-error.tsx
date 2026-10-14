import { CaseListError } from "@/components/cases/case-list-error";

export interface MindmapLoadQuery {
	error: unknown;
	isError: boolean;
	isFetching: boolean;
	refetch: () => Promise<unknown>;
}

interface MindmapLoadErrorProps {
	project: MindmapLoadQuery;
	tree: MindmapLoadQuery;
}

const TITLE = "脑图加载失败";

/** 项目或脑图数据加载失败时显示原因和重试按钮。重试只重新加载失败的查询。 */
export function MindmapLoadError({ project, tree }: MindmapLoadErrorProps) {
	const failed = [project, tree].filter((item) => item.isError);
	const query = {
		error: failed[0]?.error,
		isFetching: project.isFetching || tree.isFetching,
		refetch: () => Promise.all(failed.map((item) => item.refetch())),
	};

	return <CaseListError query={query} title={TITLE} />;
}
