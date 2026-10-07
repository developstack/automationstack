import type { MindElixirInstance } from "mind-elixir";
import MindElixir from "mind-elixir";
import "mind-elixir/style.css";
import "./mindmap-pan.css";
import { type RefObject, useEffect, useRef } from "react";

import { toMindElixirData } from "./mindmap-adapter.ts";
import { pruneMindmapContextMenu } from "./mindmap-context-menu.ts";
import { MindmapDeleteDialog } from "./mindmap-delete-dialog.tsx";
import { bindMindmapKeyGuard } from "./mindmap-key-guard.ts";
import { NEW_MODULE_TOPIC } from "./mindmap-node-utils.ts";
import { bindMindmapPan } from "./mindmap-pan.ts";
import type { MindmapScope } from "./mindmap-scope.ts";
import { MINDMAP_THEME } from "./mindmap-theme.ts";
import { pruneMindmapToolbar } from "./mindmap-toolbar.ts";
import {
	type MindmapProject,
	type MindmapTreeData,
	toMindmapTreeInput,
} from "./mindmap-tree-input.ts";
import {
	type MindmapSnapshotInput,
	type MindmapSync,
	useMindmapSync,
} from "./use-mindmap-sync.ts";

export interface MindmapCanvasProps {
	data: MindmapTreeData;
	project: MindmapProject;
	scope: MindmapScope;
}

// biome-ignore lint/suspicious/noEmptyBlockStatements: intentional
const noop = () => {};

const DIRECTION_RIGHT = 1;

type CanvasSession = Pick<MindmapSync, "attach" | "before" | "contextMenu">;

function useMindElixirInstance(
	containerRef: RefObject<HTMLDivElement | null>,
	snapshotRef: RefObject<MindmapSnapshotInput>,
	session: CanvasSession
) {
	const instanceRef = useRef<MindElixirInstance | null>(null);
	const { attach, before, contextMenu } = session;

	useEffect(() => {
		const el = containerRef.current;
		if (el === null || instanceRef.current !== null) {
			return noop;
		}
		const mind = new MindElixir({
			allowUndo: false,
			before,
			contextMenu,
			direction: DIRECTION_RIGHT,
			editable: true,
			el,
			newTopicName: NEW_MODULE_TOPIC,
			theme: MINDMAP_THEME,
		});
		instanceRef.current = mind;
		const snapshot = snapshotRef.current;
		mind.init(
			toMindElixirData(toMindmapTreeInput(snapshot.project, snapshot.data))
		);
		pruneMindmapContextMenu(mind);
		pruneMindmapToolbar(mind);
		const detachPan = bindMindmapPan(el, mind);
		const detachKeyGuard = bindMindmapKeyGuard(el);
		const detach = attach(mind, snapshot);
		return () => {
			detach();
			detachKeyGuard();
			detachPan();
			mind.destroy();
			instanceRef.current = null;
		};
	}, [attach, before, contextMenu, containerRef, snapshotRef]);
}

export function MindmapCanvas({ data, project, scope }: MindmapCanvasProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	const snapshotRef = useRef<MindmapSnapshotInput>({ data, project });
	const sync = useMindmapSync(scope);
	const { syncExternal } = sync;

	useMindElixirInstance(containerRef, snapshotRef, sync);

	useEffect(() => {
		syncExternal({ data, project });
	}, [data, project, syncExternal]);

	return (
		<>
			<div className="h-full w-full" ref={containerRef} />
			<MindmapDeleteDialog {...sync.deleteDialog} />
		</>
	);
}
