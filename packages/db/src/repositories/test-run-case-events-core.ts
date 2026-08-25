import type { NewTestRunCaseEvent } from "../schema/test-run-case-events";
import type {
	TestRunCaseResult,
	TestRunExecutedVia,
} from "../schema/test-runs";

/**
 * 「这次打结论该不该留流水、流水里的说明记哪一段文字」的纯判定。
 *
 * 抽成纯函数而不是写在事务里，理由与 `test-run-status-core.ts` 相同：
 * 这两个判断都只在真库上跑一遍界面才能看出对错，而它们错了不会报错，
 * 只会让审计流水悄悄地少一条、或者把一段不该记的文字记成「他当时的理由」。
 * 事务那边只负责取旧值、落库，不做任何判断。
 */

/** 变更**之前**该行的样子：来源结论 + 那一刻挂在行上的说明。 */
export interface RunCaseVerdictSnapshot {
	comment: string | null;
	/**
	 * 变更**之前**这行的执行来源，只被 `automationTakeover` 那条判据读。
	 *
	 * **可选**是因为手工单条路径（`setRunCaseResult`）压根没 select 这一列，
	 * 而它也永远用不到；手工批量路径查回来的行结构上带着它（那条 SELECT 要
	 * 供 D23 的覆盖判据用），但只要 `automationTakeover` 不打开就没人读，
	 * 这正是那个开关必须显式传、而不能靠「快照里有没有这一列」来推断的原因——
	 * 后者会让手工批量在没人改代码的情况下悄悄换一套流水语义。
	 */
	executedVia?: TestRunExecutedVia | null;
	id: string;
	result: TestRunCaseResult;
}

export interface BuildRunCaseEventRowsInput {
	actorId: string | null;
	/**
	 * **只有自动化上报入口允许传 true**（唯一的传入点是
	 * `test-run-automation-verdict-core.ts` 的 `buildAutomationEventRows`）。
	 *
	 * 打开后，「结论没变就不记」那条丢弃规则多一个例外：`executedVia` 从
	 * `manual` 翻成 `automation` 时照记一行。理由与代价都写在
	 * `buildRunCaseEventRows` 的注释里；这里只说**为什么是一个显式开关**：
	 * 判据本身（`snapshot.executedVia === "manual"`）在手工批量路径上同样会成立
	 * ——「一键全部通过」扫过一批人工判过的行时，每一行都是 `manual`、
	 * 结论也可能没变。少了这个开关，那条路径会凭空多出一串
	 * `passed → passed`，而它恰恰是当初立下丢弃规则要挡的东西。
	 * 默认 `undefined`（等同关闭），手工两条路径一个字都不用改，也就不可能误开。
	 */
	automationTakeover?: boolean;
	/**
	 * 调用方**显式**给的说明。`undefined` 表示没给（`buildResultPatch` 的语义是
	 * 「没给就不动原值」），`null` 表示显式清空。批量路径永远不传。
	 */
	comment?: string | null;
	snapshots: RunCaseVerdictSnapshot[];
	toResult: TestRunCaseResult;
}

/**
 * 这一行是不是「自动化接管了一条人工结论、但结论本身没变」。
 *
 * 三个条件缺一不可：开关打开（只有自动化入口会打开）、结论确实没变
 * （变了的行走的是普通那条路，不归这里管）、旧来源是 `manual`。
 *
 * 只认 `manual` 而不认 `null`：`null` 表示这行从没被打过结论（历史行，或结论
 * 被回退成未测时连带清掉了来源），接管它没有覆盖掉任何人的判断，也就没有
 * 值得记的事。这与 D23 覆盖判据里的 `isManualVerdict` 是同一个方向
 * （见 `test-run-automation-verdict-core.ts`）——两处对「什么叫人工结论」
 * 的理解必须一致，否则会出现「跳过时算人工、记流水时不算」的错位。
 * 那边还多判一个 `result !== "untested"`，这里不必：自动化上报不接受
 * `untested`（`assertAutomationVerdictItems` 拦着），而走到这个判据时
 * `snapshot.result === input.toResult`，旧结论因此也不可能是 `untested`。
 *
 * 同样只认 `manual` 带来的另一半好处：脚本重跑同一批（SDK 重试、CI retry、
 * 幂等重放）时旧来源已经是 `automation`，返回 false，流水一行都不多——
 * `automation-execution-repository.ts` 里「重放是安全的」那段承诺仍然成立。
 */
function isAutomationTakeover(
	input: BuildRunCaseEventRowsInput,
	snapshot: RunCaseVerdictSnapshot
): boolean {
	return (
		input.automationTakeover === true &&
		snapshot.result === input.toResult &&
		snapshot.executedVia === "manual"
	);
}

/**
 * 记进流水的说明文字。
 *
 * - 自动化接管（`isTakeover`）：一律记**变更前**那段。这条路径上那次 UPDATE
 *   会把行上的 `comment` 换成脚本那段 message，被顶掉的人工说明
 *   （「支付网关 502，联系运维了」）是这次变更唯一销毁掉的证据，
 *   不在这里留档就永久消失了。脚本那段文字反而不必记——它此刻就明明白白
 *   挂在行上，读记录的人一眼就能看见。
 * - 回退成 `untested`：一律记**变更前**那段。`buildResultPatch` 在这条路径上会把
 *   `comment` 清成 null，那段文字正是「他当时为什么判失败」的唯一证据，
 *   不在这里留档就永久消失了；同时这条路径上调用方给的说明根本不会被写进行里
 *   （补丁最后无条件覆盖成 null），记它等于记一段从未生效过的文字。
 * - 其余结论：调用方显式给了就记它（那就是这次变更当时写下的理由，含显式清空）；
 *   没给则行上的说明不动，变更生效后的值就等于变更前的值，记快照即可。
 */
function pickEventComment(
	input: BuildRunCaseEventRowsInput,
	snapshot: RunCaseVerdictSnapshot,
	isTakeover: boolean
): string | null {
	if (isTakeover || input.toResult === "untested") {
		return snapshot.comment;
	}
	return input.comment === undefined ? snapshot.comment : input.comment;
}

/**
 * 把一次（单条或整批）结论变更折算成要插入的流水行，按入参顺序返回。
 * 空数组表示这次变更不该在时间线上留下任何东西——调用方据此跳过 INSERT。
 *
 * **结论没变的行会被剔掉**：重复点同一个结论（键盘快捷键连按、
 * 「一键全部通过」里本来就已经通过的那些行）是空操作，给它记一条
 * `passed → passed` 只会把真正的变更淹没在噪音里。这也顺带把「只改说明」
 * 那条路径（前端保存 comment 时带着当前结论回传）挡在流水之外。
 *
 * **例外只有一个，且只在自动化入口生效**（`automationTakeover`）：结论没变、
 * 但 `executedVia` 从 `manual` 翻成 `automation`。手工路径上「结论没变」确实
 * 等于「什么都没发生」，自动化这条路上却多一个手工路径没有的维度——那次 UPDATE
 * 会把 `comment` 换成脚本的 message、`executedVia` 翻成 automation、
 * `executedBy` 换成 token 主人、`lastAutomationExecutionId` 指到这次执行。
 * 也就是说：一个人的判断被脚本顶掉了。这正是 `overwriteManual` 这个开关存在的
 * 全部意义、也是它危险的全部原因，不留痕的话，时间线上最后一条还停在
 * 「张三 未测 → 失败」，读记录的人会以为张三那句说明仍是当前说明。
 *
 * 这一行的 `fromResult === toResult`——**这是事实，不要为了「看起来像一次变更」
 * 去造一个假的来源结论**。区分它与噪音的不是结论，是同一行里被换掉的说明。
 */
export function buildRunCaseEventRows(
	input: BuildRunCaseEventRowsInput
): NewTestRunCaseEvent[] {
	const rows: NewTestRunCaseEvent[] = [];
	for (const snapshot of input.snapshots) {
		const isTakeover = isAutomationTakeover(input, snapshot);
		if (!isTakeover && snapshot.result === input.toResult) {
			continue;
		}
		rows.push({
			actorId: input.actorId,
			comment: pickEventComment(input, snapshot, isTakeover),
			fromResult: snapshot.result,
			runCaseId: snapshot.id,
			toResult: input.toResult,
		});
	}
	return rows;
}
