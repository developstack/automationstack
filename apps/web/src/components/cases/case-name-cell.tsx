import type { TestCase } from "@automationstack/db/schema/test-cases";
import { TableCell } from "@automationstack/ui/components/table";
import { cn } from "@automationstack/ui/lib/utils";
import { Link } from "@tanstack/react-router";
import { useCallback } from "react";

import type { WorkspaceSearch } from "@/components/workspace/workspace-search";

interface CaseNameCellProps {
	className?: string;
	testCase: TestCase;
}

export function CaseNameCell({ className, testCase }: CaseNameCellProps) {
	const selectCase = useCallback(
		(prev: WorkspaceSearch): WorkspaceSearch => ({
			...prev,
			caseId: testCase.id,
			history: undefined,
		}),
		[testCase.id]
	);

	return (
		<TableCell className={cn("min-w-48 whitespace-normal", className)}>
			<Link
				className="inline-block break-words rounded-sm py-0.5 text-left font-medium underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2"
				params={{ projectId: testCase.projectId }}
				search={selectCase}
				to="/projects/$projectId"
			>
				{testCase.name}
			</Link>
		</TableCell>
	);
}
