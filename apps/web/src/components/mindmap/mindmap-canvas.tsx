/**
 * The mind-elixir canvas.
 *
 * mind-elixir owns plain DOM, so React only provides the container: the
 * instance is created once from the first snapshot and is never re-initialised
 * from prop changes — the canvas *is* the optimistic UI and a rebuild under the
 * user's cursor would lose the selection and the in-flight edit. Only
 * `MindmapSyncRunner` redraws: after a failed batch, or for data this client did
 * not produce.
 *
 * That second case is the collaboration path: when another user's change
 * invalidates `mindmap.tree`, the refetched snapshot arrives as a new `data`
 * reference and `syncExternal` redraws. Our own edits patch the cache through
 * the runner, which claims the reference it wrote, so they never reach it — the
 * canvas is not rebuilt while its owner is typing.
 */

import type { MindElixirInstance } from "mind-elixir";
import MindElixir from "mind-elixir";
import "mind-elixir/style.css";
// 必须排在库样式之后：光标规则要覆盖 `.map-container` 的默认表现。
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
	/** 这份 data 是按哪个作用域取的；换作用域时由调用方 remount。 */
	scope: MindmapScope;
}

const noop = () => {
	// nothing was created, so there is nothing to tear down
};

/** Right-hand layout: sibling order then maps 1:1 to `sortOrder`. */
const DIRECTION_RIGHT = 1;

/** The parts of `MindmapSync` the instance is constructed with. */
type CanvasSession = Pick<MindmapSync, "attach" | "before" | "contextMenu">;

/**
 * Creates exactly one mind-elixir instance for the container and tears it down
 * on unmount. Nothing here depends on the live `data` prop: the first snapshot
 * seeds the canvas, every later change goes through the runner.
 */
function useMindElixirInstance(
	containerRef: RefObject<HTMLDivElement | null>,
	snapshotRef: RefObject<MindmapSnapshotInput>,
	session: CanvasSession
) {
	const instanceRef = useRef<MindElixirInstance | null>(null);
	const { attach, before, contextMenu } = session;

	useEffect(() => {
		const el = containerRef.current;
		// StrictMode mounts effects twice; the ref keeps a single live instance.
		if (el === null || instanceRef.current !== null) {
			return noop;
		}
		const mind = new MindElixir({
			// v1 disables undo/redo: mind-elixir would replay local state the
			// server never saw, and `mindmap.batch` has no inverse operations.
			allowUndo: false,
			before,
			contextMenu,
			direction: DIRECTION_RIGHT,
			editable: true,
			el,
			newTopicName: NEW_MODULE_TOPIC,
			// 不传的话 mind-elixir 会按**操作系统**的 prefers-color-scheme 二选一，
			// 跟 <html> 上的 .dark 无关；MINDMAP_THEME 的每个值都是 var(--token)，
			// 主题一切换画布自己跟着变，这里不需要任何运行时切换代码。
			theme: MINDMAP_THEME,
			// `overflowHidden: true` is NOT a styling flag: mind-elixir uses it to
			// skip binding its whole pointer layer (select / drag / dblclick-edit),
			// and `.map-container` already sets `overflow: hidden` in its own CSS.
		});
		instanceRef.current = mind;
		const snapshot = snapshotRef.current;
		mind.init(
			toMindElixirData(toMindmapTreeInput(snapshot.project, snapshot.data))
		);
		pruneMindmapContextMenu(mind);
		// 工具栏是 `init()` 同步建出来的，所以摘除只能排在它后面。
		pruneMindmapToolbar(mind);
		// 左键拖空白画布平移：库自己那条路是死的，见 mindmap-pan.ts 的说明。
		const detachPan = bindMindmapPan(el, mind);
		// 屏蔽 Cmd/Ctrl + ←/→/↑ 与 Cmd/Ctrl + K：它们会改写 direction 或整棵
		// refresh 掉画布，见 mindmap-key-guard.ts 的说明。
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

	// Data the canvas did not cause (another user's edit reaching this client
	// through an invalidate) arrives as a new reference and redraws.
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
