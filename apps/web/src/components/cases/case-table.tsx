import type { TestCase } from "@automationstack/db/schema/test-cases";
import { Badge } from "@automationstack/ui/components/badge";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@automationstack/ui/components/table";
import { cn } from "@automationstack/ui/lib/utils";

import { CaseCollaboratorsCell } from "@/components/cases/case-collaborators-cell";
import {
	CASE_TYPE_LABELS,
	formatDateTime,
	PRIORITY_BADGE_VARIANTS,
} from "@/components/cases/case-meta";
import { CaseNameCell } from "@/components/cases/case-name-cell";
import { CaseStatusBadge } from "@/components/cases/case-status-badge";
import { CaseTableEmpty } from "@/components/cases/case-table-empty";
import {
	type CaseCollaborators,
	useCollaboratorsByCaseId,
} from "@/realtime/use-editing";

const COLUMNS = [
	{ label: "名称", width: "" },
	{ label: "优先级", width: "w-16" },
	{ label: "类型", width: "w-16" },
	{ label: "状态", width: "w-20" },
	{ label: "标签", width: "" },
	{ label: "维护人", width: "" },
	{ label: "更新时间", width: "w-28" },
	{ label: "协作", width: "w-24" },
] as const;

function CaseTags({ tags }: { tags: string[] }) {
	if (tags.length === 0) {
		return <span className="text-muted-foreground">—</span>;
	}
	return (
		<div className="flex flex-wrap gap-1">
			{tags.map((tag) => (
				<Badge key={tag} variant="outline">
					{tag}
				</Badge>
			))}
		</div>
	);
}

interface CaseRowProps {
	collaborators: CaseCollaborators | undefined;
	selected: boolean;
	testCase: TestCase;
}

const ROW_MARKER = "border-l-2";

function CaseRow({ collaborators, selected, testCase }: CaseRowProps) {
	return (
		<TableRow
			aria-selected={selected}
			className={cn(
				ROW_MARKER,
				selected
					? "border-l-primary bg-accent/60 hover:bg-accent"
					: "border-l-transparent"
			)}
		>
			<CaseNameCell testCase={testCase} />
			<TableCell>
				<Badge variant={PRIORITY_BADGE_VARIANTS[testCase.priority]}>
					{testCase.priority}
				</Badge>
			</TableCell>
			<TableCell>{CASE_TYPE_LABELS[testCase.caseType]}</TableCell>
			<TableCell>
				<CaseStatusBadge status={testCase.status} />
			</TableCell>
			<TableCell>
				<CaseTags tags={testCase.tags} />
			</TableCell>
			<TableCell>
				{testCase.maintainer ?? (
					<span className="text-muted-foreground">—</span>
				)}
			</TableCell>
			<TableCell className="whitespace-nowrap text-muted-foreground tabular-nums">
				{formatDateTime(testCase.updatedAt)}
			</TableCell>
			<TableCell>
				<CaseCollaboratorsCell collaborators={collaborators} />
			</TableCell>
		</TableRow>
	);
}

interface CaseTableProps {
	cases: TestCase[];
	filtered: boolean;
	onClearFilters: () => void;
	selectedCaseId: string | undefined;
	stale: boolean;
}

const STALE_CLASS = "transition-crossfade";

export function CaseTable({
	cases,
	filtered,
	onClearFilters,
	selectedCaseId,
	stale,
}: CaseTableProps) {
	const collaboratorsByCaseId = useCollaboratorsByCaseId();

	if (cases.length === 0) {
		return (
			<CaseTableEmpty
				className={cn(STALE_CLASS, stale && "opacity-60")}
				filtered={filtered}
				onClearFilters={onClearFilters}
			/>
		);
	}

	return (
		<Table className={cn(STALE_CLASS, stale && "opacity-60")}>
			<TableHeader>
				<TableRow>
					{COLUMNS.map((column) => (
						<TableHead className={column.width} key={column.label}>
							{column.label}
						</TableHead>
					))}
				</TableRow>
			</TableHeader>
			<TableBody>
				{cases.map((testCase) => (
					<CaseRow
						collaborators={collaboratorsByCaseId.get(testCase.id)}
						key={testCase.id}
						selected={testCase.id === selectedCaseId}
						testCase={testCase}
					/>
				))}
			</TableBody>
		</Table>
	);
}
