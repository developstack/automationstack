/**
 * 分步判定的提交，以及它那一套快捷键。
 *
 * 从 `run-steps-section.tsx` 拆出来，那边只剩「这一段由哪几块组成」。
 * 两件事都只在那一个组件里用到，放在同一个文件里是因为它们共享同一份
 * 「哪几步点过了」的输入。
 */
import { stepNeedsComment } from "@automationstack/db/repositories/test-run-step-results-core";
import type { CaseStep } from "@automationstack/db/schema/test-cases";
import type {
	TestRunCaseResult,
	TestRunStepResult,
} from "@automationstack/db/schema/test-runs";
import { useCallback } from "react";

import { useRunShortcuts } from "@/components/test-runs/use-run-shortcuts";
import { useSaveRunCaseStepResults } from "@/components/test-runs/use-test-run-mutations";

export interface StepVerdictPayload {
	comment: string | null;
	result: TestRunStepResult;
	stepId: string;
}

/**
 * 工作副本 → 要发上去的那一份。
 *
 * 两条口径都在这里，且只在这里：
 *
 * 1. **没点过的步骤不发**。「未点 = 跳过」是一条业务规则，兑现在服务端的
 *    `fillStepResults` 一处；前端补一遍，将来规则改成别的（比如「未点 = 阻塞」）
 *    就会有两个地方要改，而漏掉的那个不会报错。
 * 2. **原因只跟着失败 / 阻塞发**。草稿里的原因是不分结论一直留着的（那是
 *    「点错了点回来，字还在」的机制），但没必要把一段用户已经判成通过的文字
 *    发到网络上——服务端的 `pickComment` 同样会把它丢掉，这里先滤一道。
 */
function buildStepPayload(
	steps: readonly CaseStep[],
	judged: Record<string, TestRunStepResult>,
	comments: Record<string, string>
): StepVerdictPayload[] {
	const payload: StepVerdictPayload[] = [];
	for (const step of steps) {
		const result = judged[step.id];
		if (result === undefined) {
			continue;
		}
		const text = (comments[step.id] ?? "").trim();
		payload.push({
			comment: stepNeedsComment(result) && text !== "" ? text : null,
			result,
			stepId: step.id,
		});
	}
	return payload;
}

export interface RunStepSaveOptions {
	/** 用户是对着哪一版用例判的。对不上时服务端整单拒收。 */
	caseVersion: number;
	comments: Record<string, string>;
	judged: Record<string, TestRunStepResult>;
	/** 保存成功后调用：清本机草稿。失败时**绝不调用**——草稿是这时唯一的备份。 */
	onSaved: () => void;
	runCaseId: string;
	steps: readonly CaseStep[];
}

export interface RunStepSaveHandle {
	handleSave: () => void;
	saving: boolean;
}

export function useRunStepSave(options: RunStepSaveOptions): RunStepSaveHandle {
	const { caseVersion, comments, judged, onSaved, runCaseId, steps } = options;
	const mutation = useSaveRunCaseStepResults();
	const { mutate } = mutation;

	const handleSave = useCallback(() => {
		mutate(
			{
				caseVersion,
				runCaseId,
				steps: buildStepPayload(steps, judged, comments),
			},
			{ onSuccess: onSaved }
		);
	}, [caseVersion, comments, judged, mutate, onSaved, runCaseId, steps]);

	return { handleSave, saving: mutation.isPending };
}

export interface RunStepShortcutOptions {
	enabled: boolean;
	judged: Record<string, TestRunStepResult>;
	setResult: (stepId: string, result: TestRunStepResult) => void;
	steps: readonly CaseStep[];
}

/**
 * P / F / B / S 作用在**第一个还没判的步骤**上。
 *
 * 分步之后这几个键不能再照原样打整条用例的结论了：那会走 `setResult`，
 * 把一个结论铺满每一步，把刚才逐步点出来的东西一键抹平（见
 * `test-run-verdict-patch.ts` 里那段覆盖式写入的注释）。一个手滑的单字母
 * 快捷键不该有这种破坏力。
 *
 * 但也不能就此把快捷键关掉：从上往下逐步判定恰恰是最适合键盘的流程。
 * 改成「打给下一个未判的步骤」之后，连按 P P F 就是「1 通过 2 通过 3 失败」，
 * 与原来「打一条跳一条」的手感是同一个。全部判完后再按不做任何事。
 */
export function useRunStepShortcuts(options: RunStepShortcutOptions): void {
	const { enabled, judged, setResult, steps } = options;

	const onVerdict = useCallback(
		(result: TestRunCaseResult) => {
			// `untested` 不在键面映射里（`VERDICT_SHORTCUT_KEYS` 给它的是空串，
			// 会被过滤掉），这一句只是把类型收窄到步骤的四态。
			if (result === "untested") {
				return;
			}
			const next = steps.find((step) => judged[step.id] === undefined);
			if (next !== undefined) {
				setResult(next.id, result);
			}
		},
		[judged, setResult, steps]
	);

	useRunShortcuts({ enabled, onVerdict });
}
