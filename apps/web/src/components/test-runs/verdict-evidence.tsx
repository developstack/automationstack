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
