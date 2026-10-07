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

const DRAG_ACTIVATION_DISTANCE_PX = 4;

const pointerCollisionDetection: CollisionDetection = (args) => {
	const pointerCollisions = pointerWithin(args);
	return pointerCollisions.length > 0 ? pointerCollisions : closestCenter(args);
};

function createCollisionDetection(
	keyboard: CollisionDetection
): CollisionDetection {
	return (args) =>
		args.pointerCoordinates === null
			? keyboard(args)
			: pointerCollisionDetection(args);
}

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

function useApplyDropAction(projectId: string, onMoveInto: RevealParent) {
	const { move, reorder } = useModuleDragMutations();
	return useCallback(
		(action: ModuleDropAction) => {
			if (action.kind === "invalid") {
				toast.error(action.reason);
				return;
			}
			if (action.kind === "move") {
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
