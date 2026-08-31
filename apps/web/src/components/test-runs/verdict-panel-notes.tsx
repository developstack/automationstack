/**
 * 执行结论面板顶部那两句提示。从 `run-case-verdict-panel.tsx` 拆出来（那个文件的
 * 私有辅助组件超过了一个文件 2 个的上限）。
 */

import { RUN_SECTION_TEXT } from "@/components/test-runs/run-panel-typography";
import { canPickCaseVerdict } from "@/components/test-runs/run-verdict-entry";
import { VERDICT_SHORTCUT_KEYS } from "@/components/test-runs/test-run-meta";

interface VerdictPanelNotesProps {
	canConclude: boolean;
	editing: boolean;
	hasSteps: boolean;
	locked: boolean;
}

/** 面板顶部两句提示：待评审阶段的说明，以及非分步形态的快捷键说明。 */
export function VerdictPanelNotes({
	canConclude,
	editing,
	hasSteps,
	locked,
}: VerdictPanelNotesProps) {
	return (
		<>
			{!(canConclude || locked) && (
				<p className={RUN_SECTION_TEXT}>
					该测试任务还在待评审阶段，评审完成后才能打结论；现在可以增删用例。
				</p>
			)}
			{/*
			 * 提示与键同真同假：两边都问 `canPickCaseVerdict`。
			 *
			 * 这里原先写的是 `canConclude && !hasSteps`，理由是当时 P/F/B/S 挂在页面
			 * 一层、看不见本面板的读 / 改态，在结果页面上照样生效——提示藏起来而键还
			 * 活着，就成了按下去会悄悄改写结论的隐形快捷键。那个「键还活着」本身才是
			 * bug：监听已经搬进 `RunCasePanel`、与四颗按钮同源，所以提示也跟着回到同
			 * 一条判据上。三处（按钮 / 键 / 这行提示）从此只有一份真话。
			 */}
			{/* 与上面那句同字号同颜色：两句都是面板在说话，没有主次之分 */}
			{canPickCaseVerdict({ editing, hasSteps }) ? (
				<p className={RUN_SECTION_TEXT}>
					快捷键 {VERDICT_SHORTCUT_KEYS.passed} / {VERDICT_SHORTCUT_KEYS.failed}{" "}
					/ {VERDICT_SHORTCUT_KEYS.blocked} / {VERDICT_SHORTCUT_KEYS.skipped}
					，通过/跳过自动跳下一条，失败/阻塞留在本条填写说明
				</p>
			) : null}
		</>
	);
}
