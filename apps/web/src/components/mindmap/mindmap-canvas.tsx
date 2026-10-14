import { cn } from "@automationstack/ui/lib/utils";
import type { MindElixirInstance } from "mind-elixir";
import MindElixir from "mind-elixir";
import "mind-elixir/style.css";
import "./mindmap-pan.css";
import "./mindmap-theme.css";
import { type RefObject, useEffect, useRef, useState } from "react";

import { toMindElixirData } from "./mindmap-adapter.ts";
import { pruneMindmapContextMenu } from "./mindmap-context-menu.ts";
import { MindmapDeleteDialog } from "./mindmap-delete-dialog.tsx";
import { useMindmapFullscreen } from "./mindmap-fullscreen.ts";
import { bindMindmapKeyGuard } from "./mindmap-key-guard.ts";
import { NEW_MODULE_TOPIC } from "./mindmap-node-utils.ts";
import { bindMindmapPan } from "./mindmap-pan.ts";
import type { MindmapScope } from "./mindmap-scope.ts";
import { MINDMAP_THEME } from "./mindmap-theme.ts";
import { MindmapToolbar } from "./mindmap-toolbar.tsx";
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

const CANVAS_LABEL = "脑图画布";

type CanvasSession = Pick<MindmapSync, "attach" | "before" | "contextMenu">;

function useMindElixirInstance(
	containerRef: RefObject<HTMLDivElement | null>,
	snapshotRef: RefObject<MindmapSnapshotInput>,
	session: CanvasSession
) {
	const instanceRef = useRef<MindElixirInstance | null>(null);
	const [instance, setInstance] = useState<MindElixirInstance | null>(null);
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
			toolBar: false,
		});
		instanceRef.current = mind;
		const snapshot = snapshotRef.current;
		mind.init(
			toMindElixirData(toMindmapTreeInput(snapshot.project, snapshot.data))
		);
		pruneMindmapContextMenu(mind);
		mind.container.setAttribute("role", "application");
		mind.container.setAttribute("aria-label", CANVAS_LABEL);
		const detachPan = bindMindmapPan(el, mind);
		const detachKeyGuard = bindMindmapKeyGuard(el);
		const detach = attach(mind, snapshot);
		setInstance(mind);
		return () => {
			setInstance(null);
			detach();
			detachKeyGuard();
			detachPan();
			mind.destroy();
			instanceRef.current = null;
		};
	}, [attach, before, contextMenu, containerRef, snapshotRef]);

	return instance;
}

export function MindmapCanvas({ data, project, scope }: MindmapCanvasProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	const snapshotRef = useRef<MindmapSnapshotInput>({ data, project });
	const sync = useMindmapSync(scope);
	const { syncExternal } = sync;

	const mind = useMindElixirInstance(containerRef, snapshotRef, sync);
	const fullscreen = useMindmapFullscreen(mind);

	useEffect(() => {
		syncExternal({ data, project });
	}, [data, project, syncExternal]);

	return (
		<div
			className={cn(
				"bg-background",
				fullscreen.active ? "fixed inset-0 z-40" : "relative h-full w-full"
			)}
			data-fullscreen={fullscreen.active ? "" : undefined}
		>
			<div className="h-full w-full" ref={containerRef} />
			{mind === null ? null : (
				<MindmapToolbar fullscreen={fullscreen} viewport={mind} />
			)}
			<MindmapDeleteDialog {...sync.deleteDialog} />
		</div>
	);
}
