import { RUN_SECTION_TEXT } from "@/components/test-runs/run-panel-typography";
import { canPickCaseVerdict } from "@/components/test-runs/run-verdict-entry";
import { VERDICT_SHORTCUT_KEYS } from "@/components/test-runs/test-run-meta";

interface VerdictPanelNotesProps {
	canConclude: boolean;
	editing: boolean;
	hasSteps: boolean;
	locked: boolean;
}

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
