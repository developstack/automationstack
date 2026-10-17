import type {
	CaseStatus,
	TestCase,
} from "@automationstack/db/schema/test-cases";
import { Badge } from "@automationstack/ui/components/badge";
import {
	Table,
	TableBody,
	TableCell,
	TableRow,
} from "@automationstack/ui/components/table";
import { cn } from "@automationstack/ui/lib/utils";
import { useCallback, useMemo } from "react";

import { CaseCheckCell } from "@/components/cases/case-check-cell";
import { CaseCollaboratorsCell } from "@/components/cases/case-collaborators-cell";
import { CASE_TYPE_LABELS, formatDateTime } from "@/components/cases/case-meta";
import { CaseNameCell } from "@/components/cases/case-name-cell";
import { useEnteringRowIds } from "@/components/cases/case-row-enter";
import { CaseStatusPicker } from "@/components/cases/case-status-picker";
import { CaseTableHeader } from "@/components/cases/case-table-header";
import { CASE_TABLE_ROW_HEIGHT } from "@/components/cases/case-table-layout";
import type { CaseSelection } from "@/components/cases/use-case-selection";
import {
	type CaseStatusChangeRequest,
	useCaseStatusChange,
} from "@/components/cases/use-case-status-change";
import { pageSelectionState } from "@/components/interaction/page-selection";
import { StatusBadge } from "@/components/status/status-badge";
import {
	type CaseCollaborators,
	useCollaboratorsByCaseId,
} from "@/realtime/use-editing";

const PLACEHOLDER = <span className="text-muted-foreground">—</span>;

function CaseTags({ tags }: { tags: string[] }) {
	if (tags.length === 0) {
		return PLACEHOLDER;
	}
	return (
		<div className="flex flex-wrap gap-1">
			{tags.map((tag) => (
				<Badge className="font-normal" key={tag} variant="outline">
					{tag}
				</Badge>
			))}
		</div>
	);
}

interface CaseStatusCellProps {
	onChangeStatus: (request: CaseStatusChangeRequest) => void;
	testCase: TestCase;
}

function CaseStatusCell({ onChangeStatus, testCase }: CaseStatusCellProps) {
	const changeStatus = useCallback(
		(to: CaseStatus) =>
			onChangeStatus({ caseId: testCase.id, from: testCase.status, to }),
		[onChangeStatus, testCase.id, testCase.status]
	);
	return (
		<TableCell>
			<CaseStatusPicker
				caseName={testCase.name}
				onChange={changeStatus}
				status={testCase.status}
			/>
		</TableCell>
	);
}

interface CaseRowProps {
	checked: boolean;
	collaborators: CaseCollaborators | undefined;
	entering: boolean;
	onChangeStatus: (request: CaseStatusChangeRequest) => void;
	onToggleCheck: (caseId: string) => void;
	selected: boolean;
	testCase: TestCase;
}

// 打开详情的行：左侧指示条加淡底（plans/009）。勾选的行只加淡底
const ROW_MARKER = "border-l-2";

// 改筛选条件和翻页后新出现的行淡入。留下的行 key 不变，不会重播
const ROW_ENTER = "animate-in fade-in-0 duration-200";

function CaseRow({
	checked,
	collaborators,
	entering,
	onChangeStatus,
	onToggleCheck,
	selected,
	testCase,
}: CaseRowProps) {
	return (
		<TableRow
			aria-selected={selected}
			className={cn(
				ROW_MARKER,
				CASE_TABLE_ROW_HEIGHT,
				"last:border-b-0",
				selected
					? "border-l-primary bg-accent/60 hover:bg-accent"
					: "border-l-transparent",
				entering && ROW_ENTER
			)}
			data-entering={entering ? "true" : undefined}
			data-state={checked ? "selected" : undefined}
		>
			<CaseCheckCell
				checked={checked}
				onToggle={onToggleCheck}
				testCase={testCase}
			/>
			<CaseNameCell testCase={testCase} />
			<TableCell>
				<StatusBadge kind="priority" value={testCase.priority} />
			</TableCell>
			<TableCell>{CASE_TYPE_LABELS[testCase.caseType]}</TableCell>
			<CaseStatusCell onChangeStatus={onChangeStatus} testCase={testCase} />
			<TableCell>
				<CaseTags tags={testCase.tags} />
			</TableCell>
			<TableCell>{testCase.maintainer ?? PLACEHOLDER}</TableCell>
			<TableCell className="numeric text-muted-foreground text-xs">
				{formatDateTime(testCase.updatedAt)}
			</TableCell>
			<TableCell className="pr-4">
				<CaseCollaboratorsCell collaborators={collaborators} />
			</TableCell>
		</TableRow>
	);
}

interface CaseTableProps {
	/** 表格在空状态、出错或骨架屏之后才出现时为 true：第一次显示的行也淡入。 */
	animateFirst: boolean;
	cases: TestCase[];
	selectedCaseId: string | undefined;
	/** 勾选的用例，跨页保留。 */
	selection: CaseSelection;
	/** 正在加载新的筛选结果或新的一页。表格留在原位，只标记为忙碌。 */
	stale: boolean;
}

export function CaseTable({
	animateFirst,
	cases,
	selectedCaseId,
	selection,
	stale,
}: CaseTableProps) {
	const collaboratorsByCaseId = useCollaboratorsByCaseId();
	const changeStatus = useCaseStatusChange();
	const pageIds = useMemo(() => cases.map((testCase) => testCase.id), [cases]);
	const enteringIds = useEnteringRowIds(pageIds, { animateFirst });
	const { ids: checkedIds, toggle, togglePage } = selection;
	const toggleThisPage = useCallback(
		() => togglePage(pageIds),
		[pageIds, togglePage]
	);

	return (
		<Table aria-busy={stale} aria-label="用例列表">
			<CaseTableHeader
				onTogglePage={toggleThisPage}
				pageState={pageSelectionState(checkedIds, pageIds)}
			/>
			<TableBody>
				{cases.map((testCase) => (
					<CaseRow
						checked={checkedIds.has(testCase.id)}
						collaborators={collaboratorsByCaseId.get(testCase.id)}
						entering={enteringIds.has(testCase.id)}
						key={testCase.id}
						onChangeStatus={changeStatus}
						onToggleCheck={toggle}
						selected={testCase.id === selectedCaseId}
						testCase={testCase}
					/>
				))}
			</TableBody>
		</Table>
	);
}
