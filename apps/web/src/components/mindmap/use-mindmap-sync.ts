/**
 * React wiring for the mindmap canvas: guards, context menu, delete
 * confirmation and the operation listener that mirrors edits to the server.
 *
 * Everything handed to mind-elixir must be reference-stable, because the
 * instance is created once and keeps the callbacks it was constructed with.
 */

import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import type { MindElixirInstance, NodeObj, Operation } from "mind-elixir";
import { type RefObject, useCallback, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { buildMindmapContextMenu } from "./mindmap-context-menu.ts";
import {
	createMindmapGuards,
	type MindmapGuardHost,
} from "./mindmap-guards.ts";
import type { MindmapScope } from "./mindmap-scope.ts";
import { MindmapSyncRunner } from "./mindmap-sync-runner.ts";
import type { MindmapProject, MindmapTreeData } from "./mindmap-tree-input.ts";

/** The tree + project pair one canvas render is built from. */
export interface MindmapSnapshotInput {
	data: MindmapTreeData;
	project: MindmapProject;
}

export interface MindmapDeleteDialogState {
	count: number;
	onCancel: () => void;
	onConfirm: () => void;
	open: boolean;
}

export interface MindmapSync {
	/** Subscribes the runner to one instance; returns the teardown. */
	attach: (
		mind: MindElixirInstance,
		snapshot: MindmapSnapshotInput
	) => () => void;
	before: ReturnType<typeof createMindmapGuards>;
	contextMenu: ReturnType<typeof buildMindmapContextMenu>;
	deleteDialog: MindmapDeleteDialogState;
	/** Redraws the canvas for data this client did not produce. */
	syncExternal: (snapshot: MindmapSnapshotInput) => void;
}

const notify = (message: string) => {
	toast.error(message);
};

/** 能力提示（超出渲染预算），不是错误：用中性的样式，别用红色。 */
const notifyLimit = (message: string) => {
	toast.warning(message);
};

/** Bridges the async `before.removeNodes` veto to an AlertDialog. */
function useRemovalConfirm() {
	const resolverRef = useRef<((confirmed: boolean) => void) | null>(null);
	const [count, setCount] = useState(0);

	const confirmRemoval = useCallback(
		(nodes: readonly NodeObj[]) =>
			new Promise<boolean>((resolve) => {
				resolverRef.current?.(false);
				resolverRef.current = resolve;
				setCount(nodes.length);
			}),
		[]
	);

	const settle = useCallback((confirmed: boolean) => {
		resolverRef.current?.(confirmed);
		resolverRef.current = null;
		setCount(0);
	}, []);

	const onCancel = useCallback(() => settle(false), [settle]);
	const onConfirm = useCallback(() => settle(true), [settle]);

	return {
		confirmRemoval,
		dialog: { count, onCancel, onConfirm, open: count > 0 },
	};
}

/** Opens the case detail in the list view (the URL owns that selection). */
function useOpenCase(projectId: string) {
	const navigate = useNavigate();
	return useCallback(
		(caseId: string) => {
			navigate({
				params: { projectId },
				search: { caseId },
				to: "/projects/$projectId",
			});
		},
		[navigate, projectId]
	);
}

function useMindmapHost(
	scope: MindmapScope,
	runner: MindmapSyncRunner,
	instanceRef: RefObject<MindElixirInstance | null>,
	confirmRemoval: (nodes: readonly NodeObj[]) => Promise<boolean>
): MindmapGuardHost {
	const openCase = useOpenCase(scope.projectId);
	return useMemo(
		() => ({
			confirmRemoval,
			getInstance: () => instanceRef.current,
			openCase,
			reject: notify,
			scope,
			setPendingKind: (kind) => runner.setPendingKind(kind),
		}),
		[confirmRemoval, instanceRef, openCase, runner, scope]
	);
}

export function useMindmapSync(scope: MindmapScope): MindmapSync {
	const queryClient = useQueryClient();
	const instanceRef = useRef<MindElixirInstance | null>(null);
	const { confirmRemoval, dialog } = useRemovalConfirm();
	const runner = useMemo(
		() =>
			new MindmapSyncRunner({
				notifyError: notify,
				notifyLimit,
				queryClient,
				scope,
			}),
		[queryClient, scope]
	);
	const host = useMindmapHost(scope, runner, instanceRef, confirmRemoval);

	const attach = useCallback(
		(mind: MindElixirInstance, snapshot: MindmapSnapshotInput) => {
			instanceRef.current = mind;
			runner.attach(mind, snapshot);
			const listener = (operation: Operation) => runner.handle(operation);
			mind.bus.addListener("operation", listener);
			return () => {
				mind.bus.removeListener("operation", listener);
				runner.detach();
				instanceRef.current = null;
			};
		},
		[runner]
	);

	const syncExternal = useCallback(
		(snapshot: MindmapSnapshotInput) => runner.syncExternal(snapshot),
		[runner]
	);

	return {
		attach,
		before: useMemo(() => createMindmapGuards(host), [host]),
		contextMenu: useMemo(() => buildMindmapContextMenu(host), [host]),
		deleteDialog: dialog,
		syncExternal,
	};
}
