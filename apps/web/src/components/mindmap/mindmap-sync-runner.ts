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
import {
	describeMindmapSyncFailure,
	type MindmapSyncFailure,
} from "./mindmap-sync-error.ts";
import { MindmapSyncQueue } from "./mindmap-sync-queue.ts";
import {
	type MindmapProject,
	type MindmapTreeData,
	toMindmapTreeInput,
} from "./mindmap-tree-input.ts";

interface MindmapSnapshot {
	data: MindmapTreeData;
	project: MindmapProject;
}

export interface MindmapSyncRunnerDeps {
	notifyError: (message: string) => void;
	notifyLimit: (message: string) => void;
	notifySyncFailure: (failure: MindmapSyncFailure) => void;
	queryClient: QueryClient;
	scope: MindmapScope;
}

type IdMap = Readonly<Record<string, string>>;

const REFRESH_FAILED_MESSAGE = "脑图刷新失败，请重新进入页面";

function expandedCasesMessage(dropped: number): string {
	return `渲染预算已满：${dropped} 条用例的步骤已折叠，收起其它用例后可再展开`;
}

export class MindmapSyncRunner {
	private applyingRemote = false;
	private applied: MindmapSnapshot | null = null;
	private inFlight = 0;
	private readonly merge: TrailingMerge<MindmapSnapshot>;
	private mind: MindElixirInstance | null = null;
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

	handle(operation: Operation): void {
		const { mind } = this;
		if (mind === null || this.applyingRemote) {
			return;
		}
		if (operation.name === "addChild" || operation.name === "insertSibling") {
			adoptNewNode(mind, operation.obj, this.pendingKind);
		}
		const plan = planMindmapOperation(operation, this.deps.scope.projectId);
		if (plan !== null) {
			this.dispatch(plan);
		}
		this.merge.retry();
	}

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
		const stored = queryClient.getQueryData<MindmapTreeData>(queryKey);
		if (stored !== undefined && this.applied !== null) {
			this.applied = { data: stored, project: this.applied.project };
		}
		const selfHash = hashKey(queryKey);
		queryClient.invalidateQueries({
			predicate: (query) => hashKey(query.queryKey) !== selfHash,
			queryKey: orpc.mindmap.key(),
			refetchType: "none",
		});
		queryClient.invalidateQueries({ queryKey: orpc.modules.key() });
		queryClient.invalidateQueries({ queryKey: orpc.cases.key() });
	}

	private fail(error: unknown): void {
		this.deps.notifySyncFailure(describeMindmapSyncFailure(error));
		this.rebuild().catch(() => this.deps.notifyError(REFRESH_FAILED_MESSAGE));
	}
}
