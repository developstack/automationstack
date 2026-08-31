/**
 * 执行台右栏里「用例本身」的第二段：步骤与判定。
 *
 * 原先与前置条件那一段合住在 `run-case-panel-sections.tsx`（那个文件对外导出
 * 两个组件），按「一个文件一个组件」拆开之后另一段在 `run-case-content.tsx`，
 * 两段的来历与这一栏还剩哪几块也记在那边的文件头。
 *
 * 定义在模块顶层，而不是写进 `RunCasePanel` 内部：写在内部的话，父组件每次重渲染
 * 都会造出新的组件类型，React 认不出是同一个，会把整段卸载重建——「说明」输入框里
 * 还没失焦保存的草稿会当场丢掉。
 *
 * 这里不调任何 hook：`useCaseAttachmentUrls` 留在 `RunCasePanel` 的原位置一次签完
 * 全部贴图，签好的表按 `imageUrls` 传进来。
 */
import type { MarkdownImageUrls } from "@/components/cases/markdown-inline-render";
import type { RunCaseDetail } from "@/components/test-runs/run-execution-meta";
import { RunStepsSection } from "@/components/test-runs/run-steps-section";
import type { VerdictEditingMode } from "@/components/test-runs/run-verdict-editing-mode";

export interface RunCaseStepsBlockProps {
	editingMode: VerdictEditingMode;
	hasSteps: boolean;
	imageUrls: MarkdownImageUrls;
	item: RunCaseDetail;
}

/** 「步骤与判定」那一段，或者「这条用例没有步骤」那一句。 */
export function RunCaseStepsBlock({
	editingMode,
	hasSteps,
	imageUrls,
	item,
}: RunCaseStepsBlockProps) {
	if (!hasSteps) {
		return <p className="text-muted-foreground text-sm">该用例没有步骤。</p>;
	}
	return (
		<RunStepsSection
			editingMode={editingMode}
			imageUrls={imageUrls}
			item={item}
			/*
			 * 切用例时整段重建：草稿 state 按 runCaseId 存，不带 key 的话
			 * React 会把上一条的 judged / comments 原样留给下一条，
			 * 用户会看到一屏别人的判定。用例改版（currentVersion 变）同样
			 * 重建——那时旧的分步判定已经不指向用户读过的文案了。
			 *
			 * 读 / 改态**不**跟着这个 key 重置（它住在 `RunCasePanel` 上）：
			 * 用例改版时那句「请对着新步骤重新判定」正需要用户能接着点，
			 * 把他弹回结果页面、要求再点一次「修改」是反的。
			 */
			key={`${item.runCase.id}:${item.testCase.currentVersion}`}
		/>
	);
}
