import type { ModuleTreeNode } from "@automationstack/api/lib/module-tree";
import { Button } from "@automationstack/ui/components/button";
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
import { FolderTreeIcon, PlusIcon } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { AllCasesLink } from "@/components/workspace/all-cases-link";
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
import {
	type ModuleNodeActions,
	ModuleNodeItem,
} from "@/components/workspace/module-tree-node";
import { ProjectOverviewLink } from "@/components/workspace/project-overview-link";
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

/** 项目路由的前缀，用来拼出列表页（项目根路径）自身的地址。 */
const PROJECTS_PATH_PREFIX = "/projects";

/**
 * 当前是不是这个项目的用例列表页本身。列表页就是项目根路径，
 * /overview、/mindmap 等兄弟路由都在它下面多一段，等值判断天然把它们排除掉。
 * 尾斜杠是同一个地址，一并算上。
 */
function isCaseListPath(pathname: string, projectId: string): boolean {
	const projectRootPath = `${PROJECTS_PATH_PREFIX}/${projectId}`;
	return pathname === projectRootPath || pathname === `${projectRootPath}/`;
}

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
	 * 选中态必须同时看 pathname：概览页与「全部用例」一样不带 moduleId，
	 * 只按 `selectedModuleId === undefined` 判断的话，人在 /overview 时两行会
	 * 一起高亮，看着像同时选中了两个去处。
	 *
	 * 「全部用例」用**正向**匹配列表页，而不是逐个排除别的视图。原先写的是
	 * `!onOverview && selectedModuleId === undefined`，只排掉了概览，于是人在
	 * /mindmap 时这一行照样亮着——它指向列表页，可用户并不在列表页，这个高亮
	 * 是假的。改成逐个补 `&& !onMindmap` 的话，$projectId 底下每加一个子路由
	 * 都要回来补一次，漏掉的那个会重犯同样的错（route.tsx 的 viewFor 已经踩过
	 * 这个坑，它的注释里专门写了这条告诫）。列表页的地址就是项目根路径本身，
	 * 拿它做等值判断，新增兄弟路由不会再影响这里。
	 */
	const pathname = useRouterState({ select: selectPathname });
	const onOverview = pathname.endsWith(OVERVIEW_PATH_SUFFIX);
	const onCaseList = isCaseListPath(pathname, projectId);
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
		 * 所以侧栏里任何直接子行（标题行、全部用例、模块行）一律 px-2，不要写 px-1。
		 */
		<aside aria-label="模块树" className="flex flex-col gap-1 p-2">
			<div className="flex items-center justify-between px-2">
				<h2 className="font-medium text-muted-foreground text-xs">模块</h2>
				<Button
					aria-label="新建根模块"
					onClick={createRoot}
					size="icon-xs"
					variant="ghost"
				>
					<PlusIcon />
				</Button>
			</div>
			<ProjectOverviewLink projectId={projectId} selected={onOverview} />
			<AllCasesLink
				projectId={projectId}
				selected={onCaseList && selectedModuleId === undefined}
			/>
			<ModuleTreeList
				actions={actions}
				expansion={expansion}
				nodes={treeQuery.data}
				projectId={projectId}
				selectedModuleId={selectedModuleId}
			/>
			<ModuleTreeDialogs
				dialog={dialog}
				onClose={close}
				onDeleted={handleDeleted}
				projectId={projectId}
			/>
		</aside>
	);
}
