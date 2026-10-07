import type { TestCase } from "@automationstack/db/schema/test-cases";
import { TableCell } from "@automationstack/ui/components/table";
import { Link } from "@tanstack/react-router";
import { useCallback } from "react";

import type { WorkspaceSearch } from "@/components/workspace/workspace-search";

interface CaseNameCellProps {
	testCase: TestCase;
}

export function CaseNameCell({ testCase }: CaseNameCellProps) {
	const selectCase = useCallback(
		(prev: WorkspaceSearch): WorkspaceSearch => ({
			...prev,
			caseId: testCase.id,
			history: undefined,
		}),
		[testCase.id]
	);

	return (
		<TableCell>
			<Link
				className="text-left font-medium hover:underline"
				params={{ projectId: testCase.projectId }}
				search={selectCase}
				to="/projects/$projectId"
			>
				{testCase.name}
			</Link>
		</TableCell>
	);
}
