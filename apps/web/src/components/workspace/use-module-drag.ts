/**
 * 模块树拖拽的副作用层：dnd-kit 传感器 + 落点解析 + 落库 mutation。
 *
 * 没有做乐观更新：改挂/重排会改变整棵树的结构，乐观 patch 的成本远高于
 * 一次 invalidate；因此成功与失败都在 onSettled 里 invalidate —— 失败时
 * 这一步同时就是回滚（服务端赢），错误 toast 由 orpc 的 MutationCache 兜底。
 */
import type { ModuleTreeNode } from "@automationstack/api/lib/module-tree";
import type {
	CollisionDetection,
	DragEndEvent,
	DragStartEvent,
	KeyboardCoordinateGetter,
} from "@dnd-kit/core";
import {
	closestCenter,
	KeyboardSensor,
	PointerSensor,
	pointerWithin,
	useSensor,
	useSensors,
} from "@dnd-kit/core";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import {
	createModuleKeyboardDrag,
	type ModuleKeyboardDrag,
} from "@/components/workspace/module-drag-keyboard";
import {
	type ModuleDropAction,
	parseDropId,
	resolveModuleDrop,
} from "@/components/workspace/module-drop-plan";
import { orpc } from "@/utils/orpc";

/** 指针拖拽前的最小位移，避免和行内链接/按钮的点击抢事件。 */
const DRAG_ACTIVATION_DISTANCE_PX = 4;

/** 指针优先：pointerWithin 能精确命中 6px 的插入条，落空了才按中心距兜底。 */
const pointerCollisionDetection: CollisionDetection = (args) => {
	const pointerCollisions = pointerWithin(args);
	return pointerCollisions.length > 0 ? pointerCollisions : closestCenter(args);
};

/**
 * 键盘拖拽没有指针坐标（KeyboardEvent 上没有 clientX/clientY，dnd-kit 因此把
 * pointerCoordinates 置为 null），这时交给键盘自己的落点游标，
 * 不再用二维中心距去猜——那会让高亮和坐标推进器对不上。
 */
function createCollisionDetection(
	keyboard: CollisionDetection
): CollisionDetection {
	return (args) =>
		args.pointerCoordinates === null
			? keyboard(args)
			: pointerCollisionDetection(args);
}

/** 放下之后把新父节点展开出来，让被移动的模块留在视野里。 */
type RevealParent = (parentId: string) => void;

export interface ModuleDrag {
	activeModuleId: string | null;
	collisionDetection: CollisionDetection;
	onDragCancel: () => void;
	onDragEnd: (event: DragEndEvent) => void;
	onDragStart: (event: DragStartEvent) => void;
	sensors: ReturnType<typeof useSensors>;
}

function useModuleDragMutations() {
	const queryClient = useQueryClient();
	const settle = useCallback(() => {
		queryClient.invalidateQueries({ queryKey: orpc.modules.key() });
	}, [queryClient]);
	const move = useMutation(
		orpc.modules.move.mutationOptions({
			onSettled: settle,
			onSuccess: () => toast.success("模块已移动"),
		})
	);
	const reorder = useMutation(
		orpc.modules.reorder.mutationOptions({
			onSettled: settle,
			onSuccess: () => toast.success("模块顺序已更新"),
		})
	);
	return { move, reorder };
}

/** 把解析出来的动作落到服务端；非法落点只提示，不发请求。 */
function useApplyDropAction(projectId: string, onMoveInto: RevealParent) {
	const { move, reorder } = useModuleDragMutations();
	return useCallback(
		(action: ModuleDropAction) => {
			if (action.kind === "invalid") {
				toast.error(action.reason);
				return;
			}
			if (action.kind === "move") {
				// 新父节点可能是折叠的（默认只展开到二级）：不展开的话模块放下就
				// 从视野里消失，看起来像丢了。
				if (action.parentId !== null) {
					onMoveInto(action.parentId);
				}
				move.mutate({
					id: action.moduleId,
					index: action.index,
					parentId: action.parentId,
				});
				return;
			}
			if (action.kind === "reorder") {
				reorder.mutate({
					orderedIds: action.orderedIds,
					parentId: action.parentId,
					projectId,
				});
			}
		},
		[move, onMoveInto, projectId, reorder]
	);
}

function useModuleDragSensors(coordinateGetter: KeyboardCoordinateGetter) {
	return useSensors(
		useSensor(PointerSensor, {
			activationConstraint: { distance: DRAG_ACTIVATION_DISTANCE_PX },
		}),
		useSensor(KeyboardSensor, { coordinateGetter })
	);
}

/**
 * 键盘拖拽逻辑：落点游标要跨按键存活（但不跨拖拽），所以按组件实例只建一次。
 *
 * 键盘步进要按树过滤掉「放下必定 CYCLE」的落点，而 modules.tree 每次刷新都是新
 * 引用：把 tree 直接传进工厂会让工厂随之重建、游标被清空，拖到一半的位置就丢了。
 * 因此树存进 ref，工厂拿一个稳定的 getter，用的时候才读最新值。
 */
function useKeyboardDrag(tree: readonly ModuleTreeNode[]): ModuleKeyboardDrag {
	const treeRef = useRef(tree);
	useEffect(() => {
		treeRef.current = tree;
	}, [tree]);
	return useMemo(() => createModuleKeyboardDrag(() => treeRef.current), []);
}

export function useModuleDrag(
	projectId: string,
	tree: readonly ModuleTreeNode[],
	onMoveInto: RevealParent
): ModuleDrag {
	const [activeModuleId, setActiveModuleId] = useState<string | null>(null);
	const keyboard = useKeyboardDrag(tree);
	const sensors = useModuleDragSensors(keyboard.coordinateGetter);
	const apply = useApplyDropAction(projectId, onMoveInto);
	const collisionDetection = useMemo(
		() => createCollisionDetection(keyboard.collisionDetection),
		[keyboard]
	);

	const onDragStart = useCallback(
		(event: DragStartEvent) => {
			keyboard.reset();
			setActiveModuleId(String(event.active.id));
		},
		[keyboard]
	);

	const onDragCancel = useCallback(() => {
		keyboard.reset();
		setActiveModuleId(null);
	}, [keyboard]);

	const onDragEnd = useCallback(
		(event: DragEndEvent) => {
			keyboard.reset();
			setActiveModuleId(null);
			const overId = event.over?.id;
			if (overId === undefined) {
				return;
			}
			const drop = parseDropId(String(overId));
			if (drop === null) {
				return;
			}
			apply(resolveModuleDrop(tree, String(event.active.id), drop));
		},
		[apply, keyboard, tree]
	);

	return {
		activeModuleId,
		collisionDetection,
		onDragCancel,
		onDragEnd,
		onDragStart,
		sensors,
	};
}
