/**
 * 「打回未测」这一下到底会丢掉什么——判据与文案都只在这里算，且只算一次。
 *
 * 写成不 import React 的纯函数，是因为它决定的事有两个方向的代价：判「不会丢」
 * 判错，有人写过的字一声不响地没了；判「会丢」判错，每条判过的用例都要多付一次
 * 二次确认的摩擦。这种判断要能被直接断言，不能只活在一个 JSX 分支里。
 *
 * ## 回退到底清哪些列
 *
 * 答案在 `packages/db/src/repositories/test-run-verdict-patch.ts` 的
 * `buildResultPatch`：`result` 置回 `untested` 的同时，把 `comment`、
 * `stepResults`、`caseVersion`、`executedAt`、`executedBy`、`executedVia`、
 * `lastAutomationExecutionId` 一并清空。
 *
 * 这七列里只有前两列装着**人写进去的东西**：
 *
 * - `comment`：失败 / 阻塞原因，一段没人会替他再写一遍的字；
 * - `stepResults`：一整屏逐步判定，连同每一步各自的说明。
 *
 * 其余五列全是「这条结论是谁、什么时候、对着哪一版用例打的」。它们描述的正是
 * 用户此刻主动要撤销的那个结论——撤了结论还留着执行痕迹才是脏数据（那边的注释
 * 管它叫「测过但没有结论的幽灵记录」），所以谈不上「丢」，不进判据。
 *
 * ## 附件与缺陷关联**不在**清空之列
 *
 * 附件在另一张表（`test_run_attachments`，外键只在 run_case 行本身被删掉时才
 * 级联），缺陷那四列（`defect_key` / `defect_url` / `defect_title` /
 * `defect_status`）压根不在 patch 里。打回未测碰不到它们，所以这里不必为它们
 * 留一档——真要是会连附件一起清掉，这个按钮就该无条件确认，而不是靠一个判据。
 * 将来动 `buildResultPatch` 的人请回头看这一段。
 */

/**
 * 说明整段丢掉时的那句话。
 *
 * 括号里那半句是实话，不是安慰：结论流水记的是**变更前**那段说明的快照
 * （见 `test-run-case-events-core.ts`），所以这段字撤销之后确实还查得到。
 * 分步判定没有这种快照，所以下面那句话说得比它重。
 */
const COMMENT_LOSS =
	"这条用例的说明会被一起清掉，结论回到未测；那段字在下面的「判定记录」里还留着变更前的快照。";

const STEP_RESULTS_LOSS =
	"这条用例的全部分步判定会被清空，回到一步都没判的状态；要恢复只能逐步重新判一遍。";

const BOTH_LOSS =
	"这条用例的全部分步判定与说明都会被清空：分步判定回到一步都没判的状态，要恢复只能逐步重新判一遍；说明在下面的「判定记录」里还留着变更前的快照。";

export interface ResetImpactInput {
	/** 用例级说明。null 与全空白同义：都没有字可丢。 */
	comment: string | null;
	/** 已保存的分步判定条数，取 `runCase.stepResults.length`。 */
	stepResultCount: number;
}

/**
 * 要不要拦一下，以及拦下来该说什么——**同一个函数回答**。
 *
 * `null` = 这次回退什么都不会丢，直接执行，不弹框：一条判过「通过」、没写说明、
 * 没有分步记录的用例，打回未测与再点一次「通过」是等价可逆的，为它弹一个
 * 「确定吗」只是在每条用例上收一次过路费。
 *
 * 非 null = 正文本身。拆成「要不要弹」与「弹什么」两个函数的话，两边迟早会对
 * 不上号（弹了框却说不出丢的是什么，或者反过来），而这正是这次要修的那类分叉。
 * 所以文案不写「确定吗」这种放之四海皆准的话：**弹框只在真会丢东西时出现，
 * 它就必须点名丢的是什么**，否则用户学会的只是「闭着眼睛点确认」。
 */
export function resetWarning(input: ResetImpactInput): string | null {
	const losesComment = (input.comment ?? "").trim() !== "";
	const losesStepResults = input.stepResultCount > 0;
	if (losesComment && losesStepResults) {
		return BOTH_LOSS;
	}
	if (losesStepResults) {
		return STEP_RESULTS_LOSS;
	}
	if (losesComment) {
		return COMMENT_LOSS;
	}
	return null;
}
