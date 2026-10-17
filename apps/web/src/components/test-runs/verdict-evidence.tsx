import { RunAttachments } from "@/components/test-runs/run-attachments";
import { RunDefectPanel } from "@/components/test-runs/run-defect-panel";
import type { RunCaseDetail } from "@/components/test-runs/run-execution-meta";

interface VerdictEvidenceProps {
	editing: boolean;
	projectId: string;
	runCase: RunCaseDetail["runCase"];
	stepIds: readonly string[];
}

/** 执行结论下方：关联的缺陷，以及只读的整条用例的附件。 */
export function VerdictEvidence({
	editing,
	projectId,
	runCase,
	stepIds,
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
			<RunAttachments runCaseId={runCase.id} stepIds={stepIds} />
		</>
	);
}
