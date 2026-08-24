import type { ModuleTreeNode } from "@automationstack/api/lib/module-tree";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@automationstack/ui/components/empty";
import { DndContext } from "@dnd-kit/core";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useNavigate, useRouterState, useSearch } from "@tanstack/react-router";
import { FolderTreeIcon } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { CaseDraftsLink } from "@/components/workspace/case-drafts-link";
import {
	CreateModuleDialog,
	DeleteModuleDialog,
	type ModuleDialogState,
} from "@/components/workspace/module-dialogs";
import {
	createModuleDragAnnouncements,
	moduleDragInstructions,
} from "@/components/workspace/module-drag-a11y";
import { ModuleRootDropEnd } from "@/components/workspace/module-drag-parts";
import { ModuleSection } from "@/components/workspace/module-section";
import {
	type ModuleNodeActions,
	ModuleNodeItem,
} from "@/components/workspace/module-tree-node";
import { ProjectOverviewLink } from "@/components/workspace/project-overview-link";
import { TestRunsLink } from "@/components/workspace/test-runs-link";
import { useModuleDrag } from "@/components/workspace/use-module-drag";
import {
	type ModuleExpansion,
	useModuleExpansion,
} from "@/components/workspace/use-module-expansion";
import { clearModuleSelection } from "@/components/workspace/workspace-search";
import { orpc } from "@/utils/orpc";

const DRAG_CONTEXT_ID = "module-tree-dnd";

/** 概览页的路径后缀，用来判定侧栏第 0 行的选中态。 */
const OVERVIEW_PATH_SUFFIX = "/overview";

/**
 * 测试任务相关路径的公共片段。用 includes 而不是 endsWith：测试任务详情页
 * （/test-runs/<id>）与报告页也在这一支下面，侧栏那一行在它们上面同样要亮着。
 */
const TEST_RUNS_PATH_SEGMENT = "/test-runs";

/** 与 routes/projects/$projectId/route.tsx 同样的取法：只订阅 pathname。 */
const selectPathname = (state: { location: { pathname: string } }) =>
	state.location.pathname;

function ModuleTreeEmpty() {
	return (
		<Empty className="gap-2 p-4 md:p-6">
			<EmptyHeader>
				<EmptyMedia variant="icon">
					<FolderTreeIcon />
				</EmptyMedia>
				<EmptyTitle>暂无模块</EmptyTitle>
				<EmptyDescription className="text-xs">
					点击右上角的 + 新建第一个模块，用例会按模块归类。
				</EmptyDescription>
			</EmptyHeader>
		</Empty>
	);
}

interface ModuleTreeListProps {
	actions: ModuleNodeActions;
	expansion: ModuleExpansion;
	nodes: ModuleTreeNode[];
	projectId: string;
	selectedModuleId: string | undefined;
}

/** 模块树主体：整棵树共用一个 DndContext，落点条与根末尾落点都在其内。 */
function ModuleTreeList({
	actions,
	expansion,
	nodes,
	projectId,
	selectedModuleId,
}: ModuleTreeListProps) {
	const revealParent = useCallback(
		(parentId: string) => expansion.setOpen(parentId, true),
		[expansion]
	);
	const drag = useModuleDrag(projectId, nodes, revealParent);
	// 播报文案要按 id 查模块名，只能随树重建；useMemo 保住「不要每次渲染换新对象」
	const accessibility = useMemo(
		() => ({
			announcements: createModuleDragAnnouncements(nodes),
			screenReaderInstructions: moduleDragInstructions,
		}),
		[nodes]
	);
	if (nodes.length === 0) {
		return <ModuleTreeEmpty />;
	}
	return (
		<DndContext
			accessibility={accessibility}
			collisionDetection={drag.collisionDetection}
			// 固定 id：dnd-kit 默认用模块级自增计数器生成 aria-describedby，
			// SSR 与客户端算出的序号不一致会触发 hydration mismatch。
			id={DRAG_CONTEXT_ID}
			onDragCancel={drag.onDragCancel}
			onDragEnd={drag.onDragEnd}
			onDragStart={drag.onDragStart}
			sensors={drag.sensors}
		>
			<div>
				{nodes.map((node) => (
					<ModuleNodeItem
						actions={actions}
						depth={0}
						expansion={expansion}
						key={node.id}
						node={node}
						selectedModuleId={selectedModuleId}
					/>
				))}
				<ModuleRootDropEnd />
			</div>
		</DndContext>
	);
}

/** Dialog state plus the stable callbacks the tree rows trigger. */
function useModuleDialogState() {
	const [dialog, setDialog] = useState<ModuleDialogState>(null);
	const close = useCallback(() => setDialog(null), []);
	const createRoot = useCallback(
		() => setDialog({ kind: "create", parentId: null }),
		[]
	);
	const actions = useMemo<ModuleNodeActions>(
		() => ({
			onCreateChild: (parentId) => setDialog({ kind: "create", parentId }),
			onDelete: (node) => setDialog({ kind: "delete", module: node }),
		}),
		[]
	);
	return { actions, close, createRoot, dialog };
}

/** Clears the module selection when the selected module was deleted. */
function useHandleModuleDeleted(
	projectId: string,
	selectedModuleId: string | undefined
) {
	const navigate = useNavigate();
	return useCallback(
		(moduleId: string) => {
			if (selectedModuleId !== moduleId) {
				return;
			}
			navigate({
				params: { projectId },
				search: clearModuleSelection,
				to: "/projects/$projectId",
			});
		},
		[navigate, projectId, selectedModuleId]
	);
}

interface ModuleTreeDialogsProps {
	dialog: ModuleDialogState;
	onClose: () => void;
	onDeleted: (moduleId: string) => void;
	projectId: string;
}

function ModuleTreeDialogs(props: ModuleTreeDialogsProps) {
	const { dialog } = props;
	return (
		<>
			<CreateModuleDialog
				onClose={props.onClose}
				parentId={dialog?.kind === "create" ? dialog.parentId : undefined}
				projectId={props.projectId}
			/>
			<DeleteModuleDialog
				module={dialog?.kind === "delete" ? dialog.module : null}
				onClose={props.onClose}
				onDeleted={props.onDeleted}
			/>
		</>
	);
}

interface ModuleTreeProps {
	projectId: string;
}

/** Left-hand module tree: selection, inline rename, create and delete. */
export function ModuleTree({ projectId }: ModuleTreeProps) {
	const treeQuery = useSuspenseQuery(
		orpc.modules.tree.queryOptions({ input: { projectId } })
	);
	const search = useSearch({ strict: false });
	const selectedModuleId = search.moduleId;
	/*
	 * 选中态按 pathname 判，不按 `selectedModuleId === undefined` 判：概览页与
	 * 测试任务页都不带 moduleId，光看 moduleId 会让这两行跟着模块行一起亮，
	 * 看着像同时选中了两个去处。
	 */
	const pathname = useRouterState({ select: selectPathname });
	const onOverview = pathname.endsWith(OVERVIEW_PATH_SUFFIX);
	const onTestRuns = pathname.includes(TEST_RUNS_PATH_SEGMENT);
	const handleDeleted = useHandleModuleDeleted(projectId, selectedModuleId);
	const { actions, close, createRoot, dialog } = useModuleDialogState();
	const expansion = useModuleExpansion(
		projectId,
		treeQuery.data,
		selectedModuleId
	);

	return (
		/*
		 * 工作区 gutter 约定（header / 侧栏 / 内容区共用一档）：
		 * 每个区域的内容左边缘距该区域外边框 16px（Tailwind 刻度 4）。
		 *   header  = px-4                        → 16px
		 *   内容区   = p-4                          → 16px
		 *   侧栏    = aside p-2 (8) + 行 px-2 (8)   → 16px
		 * 侧栏拆成「面板 8 + 行 8」而不是直接 px-4，是因为行要有自己的
		 * hover / 选中底色：底色需要从面板边缘内缩 8px，文字才落在同一条 16px 线上。
		 * 所以侧栏里任何直接子行（标题行、项目级入口、模块行）一律 px-2，不要写 px-1。
		 * 底下的 <ModuleSection> 只是分组用的壳，本身不带内边距，这笔账不变。
		 */
		<aside aria-label="项目导航" className="flex flex-col gap-1 p-2">
			<ProjectOverviewLink projectId={projectId} selected={onOverview} />
			<TestRunsLink projectId={projectId} selected={onTestRuns} />
			{/*
			 * 「未完成草稿」也是项目级去处（草稿散落在各个模块下，不属于任何一个），
			 * 所以和概览、测试任务同组；它没有草稿时整行不渲染，见 case-drafts-link.tsx。
			 */}
			<CaseDraftsLink nodes={treeQuery.data} projectId={projectId} />
			{/*
			 * 上面几行是项目级去处，与模块无关；「模块」这一组从这里开始。
			 * 不另画分隔线：标题行本身就是分界，而侧栏至今没有任何 <Separator/>，
			 * 为这一处引进一种新的分隔方式反而多出一条与全局不一致的横线。
			 */}
			<ModuleSection onCreateRoot={createRoot} projectId={projectId}>
				<ModuleTreeList
					actions={actions}
					expansion={expansion}
					nodes={treeQuery.data}
					projectId={projectId}
					selectedModuleId={selectedModuleId}
				/>
			</ModuleSection>
			<ModuleTreeDialogs
				dialog={dialog}
				onClose={close}
				onDeleted={handleDeleted}
				projectId={projectId}
			/>
		</aside>
	);
}
