import { saveRunCaseStepResults } from "@automationstack/db/repositories/test-run-step-verdicts-repository";
import { z } from "zod";

import { protectedProcedure } from "../index";
import { requireRunCaseMember } from "../lib/project-scope";
import { publishInvalidate } from "../lib/realtime-publish";
import {
	REVIEW_PENDING_MESSAGE,
	rejectRunWrite,
	testRunErrors,
} from "../lib/test-run-errors";
import { testRunStepResultSchema } from "../schemas/test-run";

/**
 * 分步判定的保存入口。单独成文件而不是并进 `test-run-execution.ts`：
 * 那边五个 procedure 都是「调用方给结论」，这一条反过来是「调用方给分步、
 * 结论由服务端推导」，两种口径混在一个文件里最容易被人照着隔壁抄成
 * 「顺手把 result 也收下」——那等于把通过率交给浏览器。
 *
 * 与那边一样：只做 zod 校验 + 调 repository + 翻错误码。守卫、行锁、
 * 版本校验全部在 repository 的事务里，这里连一次「先查查看能不能改」都不做。
 */

const stepVerdictSchema = z.object({
	/**
	 * 原因文本。这里收下**任何结论**的原因（包括判成通过的那些）没有意义，
	 * 所以前端只发它认为该发的；真正决定「哪几步留得住原因」的是 db 侧的
	 * `pickComment`，判成通过的一律落成 null。
	 */
	comment: z.string().nullable(),
	result: testRunStepResultSchema,
	stepId: z.string().min(1),
});

const saveStepResultsSchema = z.object({
	/** 用户判定时看到的用例版本。对不上就整单拒收，见 repository 的 `case-changed`。 */
	caseVersion: z.number().int().positive(),
	runCaseId: z.uuid(),
	/**
	 * **只含用户点过的步骤**，没点的由服务端补成跳过（「未点 = 跳过」是一条业务
	 * 规则，只在 `fillStepResults` 一处兑现）。因此这里允许空数组：一步都没点
	 * 就按保存，是「整条用例全部跳过」这个合法意图。
	 *
	 * 同一个 stepId 出现两次直接打回。不打回的话下面折成对象时会**静默**
	 * 只留最后一条，用户点的第一条判定凭空消失且没有任何地方报错。
	 */
	steps: z
		.array(stepVerdictSchema)
		.refine(
			(steps) =>
				new Set(steps.map((step) => step.stepId)).size === steps.length,
			{ message: "同一个步骤不能提交两次判定" }
		),
});

type StepVerdict = z.infer<typeof stepVerdictSchema>;

/**
 * 线上格式（数组）折成 repository 要的两张表。
 *
 * 走数组而不是直接收一个 `Record<stepId, ...>`：对象的键是用户可控的任意字符串，
 * 数组元素才能被 zod 逐条校验，重复键也才有地方拦（见上面那条 refine）。
 * `Object.fromEntries` 建的是普通对象且用 CreateDataProperty 定义每个键，
 * `__proto__` 这样的键名不会污染原型。
 */
function splitStepVerdicts(steps: StepVerdict[]) {
	return {
		comments: Object.fromEntries(
			steps
				.filter((step) => step.comment !== null)
				.map((step) => [step.stepId, step.comment as string])
		),
		judged: Object.fromEntries(steps.map((step) => [step.stepId, step.result])),
	};
}

export const testRunStepExecutionProcedures = {
	saveStepResults: protectedProcedure
		.errors(testRunErrors)
		.input(saveStepResultsSchema)
		.use(requireRunCaseMember)
		.handler(async ({ context, errors, input }) => {
			const result = await saveRunCaseStepResults({
				actorId: context.user.id,
				caseVersion: input.caseVersion,
				...splitStepVerdicts(input.steps),
				runCaseId: input.runCaseId,
			});
			if (result.kind === "review-pending") {
				throw errors.CONFLICT({ message: REVIEW_PENDING_MESSAGE });
			}
			if (result.kind === "case-changed") {
				// 说清楚「你的判定还在本地」——不说的话用户会以为刚才那一屏白点了，
				// 而草稿其实好好地留在浏览器里（见 use-run-step-draft.ts）。
				throw errors.CONFLICT({
					message: `用例已被改到 v${result.currentVersion}，请刷新后对着新步骤重新判定（你刚才的判定仍留在本机草稿里）`,
				});
			}
			if (result.kind === "no-steps") {
				throw errors.BAD_REQUEST({
					message: "该用例没有步骤，请直接给整条用例打结论",
				});
			}
			if (result.kind === "unknown-steps") {
				throw errors.BAD_REQUEST({
					message: `以下步骤不属于该用例：${result.stepIds.join("、")}`,
				});
			}
			if (result.kind !== "ok") {
				rejectRunWrite(result, errors);
			}
			publishInvalidate({
				action: "update",
				context,
				entity: "testRun",
				ids: [result.run.id],
				projectId: result.run.projectId,
			});
			return result;
		}),
};
