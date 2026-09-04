/**
 * Mirrors canvas edits to `mindmap.batch`.
 *
 * mind-elixir has already applied the edit locally when the `operation` event
 * fires, so the canvas *is* the optimistic UI: nothing is re-rendered on
 * success. Ordering is per entity (see `MindmapSyncQueue`) because structural
 * edits are discrete — no debounce, but a rename must never overtake the create
 * of the same node. On success the cached `mindmap.tree` is patched surgically;
 * a wholesale invalidate would push fresh data at the canvas and rebuild it
 * under the user's cursor. On failure the server wins: refetch and `refresh()`.
 *
 * Changes we did *not* cause (another user editing the same project, whose
 * invalidate reaches `mindmap.tree`) must still redraw the canvas. The runner
 * therefore remembers the exact snapshot reference the canvas is currently
 * showing — including the one it wrote into the cache itself — so `syncExternal`
 * can tell "someone else's data" from "the echo of my own patch" by identity
 * alone, with no dependency on the realtime layer.
 *
 * 那条外部路径是高频的：每个队友每次保存都来一次失效。所以它不直接重绘，
 * 而是进 `TrailingMerge` 的 300ms 合并窗口（mindmap-refresh-merge.ts），
 * 窗口里的快照互相覆盖；画布正忙（有 in-flight 批次 / 编辑框开着）时继续
 * 挂起并轮询重试，这一段替代了原来的 `deferred` + 500ms 重试定时器。
 */
import { hashKey, type QueryClient } from "@tanstack/react-query";
import type { MindElixirInstance, Operation } from "mind-elixir";

import { client, orpc } from "@/utils/orpc";
import { type MindmapEntityRef, toMindElixirData } from "./mindmap-adapter.ts";
import { planMindmapRender } from "./mindmap-budget.ts";
import { patchMindmapTree } from "./mindmap-cache.ts";
import { adoptNewNode, applyRealNodeId } from "./mindmap-node-utils.ts";
import {
	type MindmapBatchOperation,
	type MindmapOperationPlan,
	planMindmapOperation,
} from "./mindmap-operation-map.ts";
import { redrawMindmap } from "./mindmap-redraw.ts";
import {
	MINDMAP_MERGE_DELAY_MS,
	MINDMAP_MERGE_MAX_WAIT_MS,
	TrailingMerge,
} from "./mindmap-refresh-merge.ts";
import type { MindmapScope } from "./mindmap-scope.ts";
import { mindmapTreeQueryOptions } from "./mindmap-scope-query.ts";
import { describeMindmapSyncFailure } from "./mindmap-sync-error.ts";
import { MindmapSyncQueue } from "./mindmap-sync-queue.ts";
import {
	type MindmapProject,
	type MindmapTreeData,
	toMindmapTreeInput,
} from "./mindmap-tree-input.ts";

/** One rendered state of the canvas: the tree plus the root node's project. */
interface MindmapSnapshot {
	data: MindmapTreeData;
	project: MindmapProject;
}

export interface MindmapSyncRunnerDeps {
	notifyError: (message: string) => void;
	/** 非错误的能力提示（超出渲染预算时的说明）。 */
	notifyLimit: (message: string) => void;
	queryClient: QueryClient;
	/**
	 * 画布正在看的作用域。同步器补的缓存条目必须与画布读的是同一条，否则
	 * `applied` 认领的引用与画布实际读的引用分属两条缓存，「自己的编辑不触发
	 * 重绘」这条机制就会失效。两边都只经由 `mindmapTreeQueryOptions(scope)`
	 * 取键，作用域参数在代码里只出现一次。
	 */
	scope: MindmapScope;
}

type IdMap = Readonly<Record<string, string>>;

const REFRESH_FAILED_MESSAGE = "脑图刷新失败，请重新进入页面";

function expandedCasesMessage(dropped: number): string {
	return `渲染预算已满：${dropped} 条用例的步骤已折叠，收起其它用例后可再展开`;
}

export class MindmapSyncRunner {
	/** Suppresses the echo of edits we apply ourselves (`refresh`). */
	private applyingRemote = false;
	/** Snapshot the canvas currently draws; identity marks it as "ours". */
	private applied: MindmapSnapshot | null = null;
	private inFlight = 0;
	/** 300ms 尾沿合并：连续 5 次远端失效只重绘一次，画最后那份数据。 */
	private readonly merge: TrailingMerge<MindmapSnapshot>;
	private mind: MindElixirInstance | null = null;
	/** Kind of the node the pending `addChild` / `insertSibling` will create. */
	private pendingKind: MindmapEntityRef["kind"] = "module";
	private readonly queue = new MindmapSyncQueue();
	private readonly deps: MindmapSyncRunnerDeps;

	constructor(deps: MindmapSyncRunnerDeps) {
		this.deps = deps;
		this.merge = new TrailingMerge<MindmapSnapshot>({
			canFlush: () => !this.isBusy(),
			delayMs: MINDMAP_MERGE_DELAY_MS,
			maxWaitMs: MINDMAP_MERGE_MAX_WAIT_MS,
			onFlush: (snapshot) => this.apply(snapshot),
		});
	}

	attach(mind: MindElixirInstance, snapshot: MindmapSnapshot): void {
		this.mind = mind;
		this.applied = snapshot;
	}

	detach(): void {
		this.mind = null;
		this.applied = null;
		this.merge.cancel();
		this.queue.clear();
	}

	setPendingKind(kind: MindmapEntityRef["kind"]): void {
		this.pendingKind = kind;
	}

	/** Entry point for `bus.addListener("operation", ...)`. */
	handle(operation: Operation): void {
		const { mind } = this;
		if (mind === null || this.applyingRemote) {
			return;
		}
		if (operation.name === "addChild" || operation.name === "insertSibling") {
			// Nodes mind-elixir minted itself get an id in our scheme first, so the
			// mapper can tell a module from a case.
			adoptNewNode(mind, operation.obj, this.pendingKind);
		}
		const plan = planMindmapOperation(operation, this.deps.scope.projectId);
		if (plan !== null) {
			this.dispatch(plan);
		}
		// `finishEdit` closes the inline editor, so a parked redraw may now run.
		this.merge.retry();
	}

	/**
	 * Redraws for data the canvas did not produce. Snapshots we wrote ourselves
	 * are recognised by reference, so surgical patches never rebuild the canvas.
	 *
	 * 不直接重绘：远端失效是高频路径（每个队友每次保存来一次），先进 300ms
	 * 尾沿合并窗口，窗口里的快照互相覆盖，最后只画一次。
	 */
	syncExternal(snapshot: MindmapSnapshot): void {
		const { applied } = this;
		if (
			this.mind === null ||
			(applied !== null &&
				applied.data === snapshot.data &&
				applied.project === snapshot.project)
		) {
			return;
		}
		this.merge.push(snapshot);
	}

	/** Refetches the tree and redraws the canvas; the server wins. */
	async rebuild(): Promise<void> {
		const { queryClient, scope } = this.deps;
		this.queue.clear();
		const [tree, project] = await Promise.all([
			queryClient.fetchQuery({
				...mindmapTreeQueryOptions(scope),
				staleTime: 0,
			}),
			queryClient.ensureQueryData(
				orpc.projects.get.queryOptions({ input: { id: scope.projectId } })
			),
		]);
		this.apply({ data: tree, project });
	}

	/** Draws one snapshot and records it as the canvas' current state. */
	private apply(snapshot: MindmapSnapshot): void {
		const { mind } = this;
		if (mind === null) {
			return;
		}
		this.applied = snapshot;
		this.merge.cancel();
		this.applyingRemote = true;
		let dropped = 0;
		try {
			const input = toMindmapTreeInput(snapshot.project, snapshot.data);
			const plan = planMindmapRender(input);
			dropped = redrawMindmap(
				mind,
				toMindElixirData(input, plan),
				plan.expandedCaseAllowance
			).droppedExpandedCases;
		} finally {
			this.applyingRemote = false;
		}
		if (dropped > 0) {
			this.deps.notifyLimit(expandedCasesMessage(dropped));
		}
	}

	/** True while a redraw would destroy work in progress. */
	private isBusy(): boolean {
		const { mind } = this;
		return (
			this.inFlight > 0 ||
			(mind !== null && mind.container.querySelector("#input-box") !== null)
		);
	}

	private dispatch(plan: MindmapOperationPlan): void {
		this.inFlight += 1;
		this.queue
			.enqueue(plan.keys, () => this.send(plan))
			.catch((error: unknown) => this.fail(error))
			.finally(() => {
				this.inFlight -= 1;
				this.merge.retry();
			});
	}

	private async send(plan: MindmapOperationPlan): Promise<void> {
		const operations = plan.toOperations((id) => this.queue.resolve(id));
		if (operations.length === 0) {
			return;
		}
		const { idMap } = await client.mindmap.batch({ operations });
		this.commit(plan, operations, idMap);
	}

	private commit(
		plan: MindmapOperationPlan,
		operations: readonly MindmapBatchOperation[],
		idMap: IdMap
	): void {
		const { created } = plan;
		const realId = created === null ? undefined : idMap[created.tempId];
		if (created !== null && realId !== undefined) {
			this.queue.link(created.tempId, realId);
			if (this.mind !== null) {
				applyRealNodeId(this.mind, created.nodeId, realId);
			}
		}
		this.patchCache(operations, idMap);
	}

	private patchCache(
		operations: readonly MindmapBatchOperation[],
		idMap: IdMap
	): void {
		const { queryClient, scope } = this.deps;
		const { queryKey } = mindmapTreeQueryOptions(scope);
		queryClient.setQueryData(queryKey, (previous?: MindmapTreeData) =>
			previous === undefined
				? previous
				: patchMindmapTree(previous, operations, idMap)
		);
		// Read the stored reference back (react-query may keep the previous one
		// through structural sharing) and claim it: this is the snapshot the
		// canvas already shows, so `syncExternal` must not redraw for it.
		const stored = queryClient.getQueryData<MindmapTreeData>(queryKey);
		if (stored !== undefined && this.applied !== null) {
			this.applied = { data: stored, project: this.applied.project };
		}
		// 别的作用域（全量脑图、别的模块）现在也有自己的缓存条目，它们没被上面
		// 这次 patch 覆盖到。staleTime 是 60s，不标记的话切回全量脑图会看到编辑前
		// 的旧树。`refetchType: "none"` 只标记不重取，且按 hash 排除掉自己这一条
		// —— 重取自己就会产生新引用，画布会在用户手底下重建。
		const selfHash = hashKey(queryKey);
		queryClient.invalidateQueries({
			predicate: (query) => hashKey(query.queryKey) !== selfHash,
			queryKey: orpc.mindmap.key(),
			refetchType: "none",
		});
		// Sibling views (module tree, case list) are separate queries: refreshing
		// them cannot rebuild the canvas.
		queryClient.invalidateQueries({ queryKey: orpc.modules.key() });
		queryClient.invalidateQueries({ queryKey: orpc.cases.key() });
	}

	/** 整批被服务端拒绝：先把原因说清楚，再让服务端数据覆盖画布。 */
	private fail(error: unknown): void {
		this.deps.notifyError(describeMindmapSyncFailure(error));
		this.rebuild().catch(() => this.deps.notifyError(REFRESH_FAILED_MESSAGE));
	}
}
