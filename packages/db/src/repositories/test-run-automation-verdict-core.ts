import type { NewTestRunCaseEvent } from "../schema/test-run-case-events";
import type { TestRunCaseResult } from "../schema/test-runs";
import { buildRunCaseEventRows } from "./test-run-case-events-core";
import { dedupe, type RunCaseVerdictSnapshotRow } from "./test-run-case-guards";

/**
 * 自动化上报结论的**纯逻辑**：契约校验、覆盖判据、分组折算审计流水行。
 *
 * 与 `test-run-automation-verdicts.ts` 分文件，界线是**一行 SQL 都不发**：
 * 这里的四个函数只吃 items 与 snapshot，不接触事务，也不知道 `db` 的存在。
 * 事务编排、`ensureRunWritable` 守卫与那条整批 UPDATE 都在那边。
 *
 * 这条界线不是为了行数：本文件里的判据（`untested` 拒收、重复 id 拒收、
 * D23 的覆盖与否）错一个方向的表现全都是「自动化静默地写错或什么都没写」，
 * 不会抛、不会红。把它们摘成不依赖数据库的纯函数，是让这些判据将来可以被
 * 直接单测的前提。
 */

export interface AutomationVerdictItem {
	comment: string | null;
	result: TestRunCaseResult;
	runCaseId: string;
}

/** `partitionAutomationTargets` 的产物：这批上报里要写的和被跳过的两堆。 */
export interface AutomationTargetPartition {
	/** 因 overwriteManual=false 被跳过的 runCaseId。 */
	skippedRunCaseIds: string[];
	targets: AutomationVerdictItem[];
}

/**
 * `overwriteManual = false` 时该不该放过这一行（D23）。
 *
 * `executedVia === null` 表示这行**从没被打过结论**（历史行，或结论被回退成未测时
 * 连带清掉了来源），它不是人工结论，要照常写入——否则「跑一次自动化把任务铺满」
 * 在所有存量任务上永远一条都铺不进去。判据写成具名函数而不是塞进一长串条件里，
 * 是因为这里错一个 `null` 的方向，表现是「自动化静默地什么都没写」，不会报错。
 */
function isManualVerdict(snapshot: RunCaseVerdictSnapshotRow): boolean {
	return snapshot.executedVia === "manual" && snapshot.result !== "untested";
}

/**
 * 按 D23 把这一批上报分成「要写的」与「跳过的」。
 *
 * 拿不到 snapshot 的 item 一律进 `targets`：调用方在此之前已经用
 * `findMissingRunCaseIds` 把不属于本任务的 id 全拒了，所以走到这里还查不到
 * snapshot 是不可能的；真要发生也该由那条 UPDATE 匹配不到行来暴露，
 * 而不是在这里被当成「人工结论」悄悄跳过——那会把一个 bug 伪装成一次正常跳过。
 */
export function partitionAutomationTargets(
	items: AutomationVerdictItem[],
	snapshotById: Map<string, RunCaseVerdictSnapshotRow>,
	overwriteManual: boolean
): AutomationTargetPartition {
	const skippedRunCaseIds: string[] = [];
	const targets: AutomationVerdictItem[] = [];
	for (const item of items) {
		const snapshot = snapshotById.get(item.runCaseId);
		if (!overwriteManual && snapshot && isManualVerdict(snapshot)) {
			skippedRunCaseIds.push(item.runCaseId);
			continue;
		}
		targets.push(item);
	}
	return { skippedRunCaseIds, targets };
}

/**
 * 把一批自动化结论折算成审计流水行：按 `(result, comment)` 二元组分组，每组调一次
 * `buildRunCaseEventRows`。
 *
 * 分组而不是自己写一套过滤，是因为「结论没变的行不记流水」「说明记哪一段」这两个
 * 判断必须永远只有 `buildRunCaseEventRows` 一处定义（重放同一批时全靠它把
 * `passed → passed` 剔干净）。它是纯函数、不发 SQL，调几十次没有成本；
 * 拼出来的行最后仍然只发一条 INSERT。
 *
 * **`automationTakeover: true` 只在这里传，而且是本仓库唯一的传入点。**
 * 它让「结论没变就不记」多一个例外：结论没变、但 `executedVia` 从 `manual`
 * 翻成 `automation`（也就是这次上报把一个人的判断顶掉了）时照记一行，
 * 记的说明是**被覆盖掉的那一段**。判据与代价写在 `buildRunCaseEventRows` 那边；
 * 开关摆在调用点而不是让它去嗅探快照，是因为同一个判据在手工批量路径上也会成立
 * （「一键全部通过」扫过一批人工判过的行），那条路径必须一个字节都不变。
 * 传得进这个开关的前提是 `snapshotById` 里带着 `executedVia`——它本来就在
 * 那条 SELECT 里（D23 的覆盖判据要用），不为此多一次查询。
 */
export function buildAutomationEventRows(
	actorId: string | null,
	items: AutomationVerdictItem[],
	snapshotById: Map<string, RunCaseVerdictSnapshotRow>
): NewTestRunCaseEvent[] {
	const groups = new Map<string, AutomationVerdictItem[]>();
	for (const item of items) {
		// JSON 编码而不是字符串拼接：`comment` 是外部来的文本，
		// null 与字面量 "null" 必须落进不同的组。
		const key = JSON.stringify([item.result, item.comment]);
		const group = groups.get(key);
		if (group) {
			group.push(item);
			continue;
		}
		groups.set(key, [item]);
	}
	const rows: NewTestRunCaseEvent[] = [];
	for (const group of groups.values()) {
		const [first] = group;
		if (!first) {
			continue;
		}
		const snapshots: RunCaseVerdictSnapshotRow[] = [];
		for (const item of group) {
			const snapshot = snapshotById.get(item.runCaseId);
			if (snapshot) {
				snapshots.push(snapshot);
			}
		}
		rows.push(
			...buildRunCaseEventRows({
				actorId,
				automationTakeover: true,
				comment: first.comment,
				snapshots,
				toResult: first.result,
			})
		);
	}
	return rows;
}

/**
 * 上报批次的**契约校验**：不合契约就抛，绝不静默纠正。
 *
 * 两条都不是可预期的业务分支（那些走类型化返回值），而是调用方把请求拼错了，
 * 所以走异常——让 ingest 层在自己那一侧显式处理，而不是由 db 原语替它兜底。
 *
 * 1. **`untested`**：上报没有「未测」这个语义（脚本跑了就有结论）。真让它进来，
 *    那条 UPDATE 会写出一行「未测但标着自动化执行」——plan §3.6 点名的幽灵行，
 *    而且不会有任何地方报错。
 *
 * 2. **重复 `runCaseId`**（SDK 重试、参数化用例重名、按 sourceRef 映射时都容易产生）。
 *    **为什么不在这一层自动去重、后者胜**：去重就是替调用方从两条冲突的结论里挑一条、
 *    丢一条，而「同一条用例在一次上报里报了两次到底算哪次」是产品语义，必须由上层
 *    （ingest）显式决定——取最后一条、整批拒收、还是逐条回报冲突——并且要能在响应里
 *    告诉上报方哪几条被合并了。db 原语里沉默地挑一条，上层就会以为这件事不用管，
 *    上报方也永远不知道自己报重了。
 *
 *    而放它往下走是三重静默错：那条 UPDATE 的 `from (values ...)` 里会有两行同 id，
 *    Postgres 对「同一目标行匹配到多行」明写 the result is unpredictable——目标行只被
 *    更新一次，用的是哪一行的 result/comment 不确定；`returning` 也只回一行，
 *    `updatedRunCaseIds` 于是与 items 对不上；最坏的是 `buildAutomationEventRows` 按
 *    `(result, comment)` 分组，两条落进两个组、各自拿同一份 snapshot 算 `fromResult`，
 *    审计流水里凭空多出一条从没发生过的状态变更——库里写进哪个结论不确定，
 *    流水却声称两件事都发生了。
 */
export function assertAutomationVerdictItems(
	items: AutomationVerdictItem[]
): void {
	for (const item of items) {
		if (item.result === "untested") {
			throw new Error(
				"applyAutomationVerdicts: 自动化上报不能把结论写成 untested"
			);
		}
	}
	const ids = items.map((item) => item.runCaseId);
	// 报上重复的那几个 id：调用方要的是「哪几条得自己定夺」，
	// 而不是一句「这批有重复」再自己扫一遍。
	const duplicatedRunCaseIds = dedupe(
		ids.filter((id, index) => ids.indexOf(id) !== index)
	);
	if (duplicatedRunCaseIds.length > 0) {
		throw new Error(
			`applyAutomationVerdicts: 同一批上报里出现重复 runCaseId：${duplicatedRunCaseIds.join(", ")}`
		);
	}
}
