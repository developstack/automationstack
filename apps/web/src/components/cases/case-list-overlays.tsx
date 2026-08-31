/**
 * 用例列表页的两个抽屉（详情 / 新建）。
 *
 * 从 case-list-view.tsx 拆出来，那边只留下工具栏装配与查询。
 */
import { CaseCreateSheet } from "@/components/cases/case-create-sheet";
import { CaseDetailSheet } from "@/components/cases/case-detail-sheet";
import type { WorkspaceNavigation } from "@/components/workspace/use-workspace-navigation";
import type { WorkspaceSearch } from "@/components/workspace/workspace-search";

interface CaseListOverlaysProps {
	navigation: WorkspaceNavigation;
	projectId: string;
	search: WorkspaceSearch;
}

/**
 * 详情抽屉与新建抽屉：都脱离文档流，不参与 main 的间距计算。
 *
 * 新建抽屉的开合读的是 URL 上的 `create`，不是本组件的 state：侧栏的
 * 「未完成草稿」要能把人送回某个模块的新建抽屉，而侧栏挂在父路由的 layout 上，
 * 够不到这里的 state（理由与参数定义见 workspace-search.ts）。
 * 顺带的好处是深链、后退/前进都能还原抽屉，与详情抽屉的行为对齐。
 */
export function CaseListOverlays(props: CaseListOverlaysProps) {
	const { navigation, search } = props;
	return (
		<>
			<CaseDetailSheet
				caseId={search.caseId}
				historyOpen={search.history === true}
				onClose={navigation.closeCase}
				onToggleHistory={navigation.setHistory}
			/>
			<CaseCreateSheet
				draftId={search.draft}
				moduleId={search.moduleId}
				onClose={navigation.closeCreate}
				// selectCase 会顺手清掉 create，抽屉随之关闭，不必再单独收一次。
				onCreated={navigation.selectCase}
				open={search.create === true}
				projectId={props.projectId}
			/>
		</>
	);
}
