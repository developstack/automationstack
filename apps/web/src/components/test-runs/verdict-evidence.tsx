import { RunAttachments } from "@/components/test-runs/run-attachments";
import type { RunCaseDetail } from "@/components/test-runs/run-execution-meta";

interface VerdictEvidenceProps {
	runCase: RunCaseDetail["runCase"];
	stepIds: readonly string[];
}

/** 执行结论下方：只读的整条用例的附件。 */
export function VerdictEvidence({ runCase, stepIds }: VerdictEvidenceProps) {
	return <RunAttachments runCaseId={runCase.id} stepIds={stepIds} />;
}
