/**
 * 执行结论面板里的证据两块：缺陷与附件。从 `run-case-verdict-panel.tsx` 拆出来
 * （那个文件的私有辅助组件超过了一个文件 2 个的上限）。
 */

import { RunAttachments } from "@/components/test-runs/run-attachments";
import { RunDefectPanel } from "@/components/test-runs/run-defect-panel";
import type { RunCaseDetail } from "@/components/test-runs/run-execution-meta";

interface VerdictEvidenceProps {
	editing: boolean;
	onStorageUnavailable: () => void;
	projectId: string;
	runCase: RunCaseDetail["runCase"];
	storageUnavailable: boolean;
}

/**
 * 这次执行留下的证据：缺陷与附件。
 *
 * 拆出来是为了压住 `VerdictPanelBody` 的行数，但切口不是随便找的——这两块共用
 * 同一条规则：**结果页面上有内容才出现，没有就整块不渲染；修改页面上一律给入口**。
 * 面板里那几块（提示 / 谁判的 / 判定入口 / 说明）各有各的显隐条件，跟它们不是一类。
 *
 * 两块都自己决定显不显示（`RunDefectPanel` 看有没有关联，`RunAttachments` 看列表
 * 长度——只有它查得到有几条），所以这里不包边框也不加标题：外面套一层就得先知道
 * 「里面到底有没有东西」，而附件那一条谁也替不了它回答。
 */
export function VerdictEvidence({
	editing,
	onStorageUnavailable,
	projectId,
	runCase,
	storageUnavailable,
}: VerdictEvidenceProps) {
	return (
		<>
			<RunDefectPanel
				defectKey={runCase.defectKey}
				defectStatus={runCase.defectStatus}
				defectTitle={runCase.defectTitle}
				defectUrl={runCase.defectUrl}
				editing={editing}
				projectId={projectId}
				runCaseId={runCase.id}
			/>
			<RunAttachments
				editing={editing}
				onStorageUnavailable={onStorageUnavailable}
				runCaseId={runCase.id}
				storageUnavailable={storageUnavailable}
			/>
		</>
	);
}
