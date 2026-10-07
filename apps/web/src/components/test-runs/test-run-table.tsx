import type { TestRunListItem } from "@automationstack/db/repositories/test-runs-repository";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@automationstack/ui/components/table";
import { cn } from "@automationstack/ui/lib/utils";
import { Link } from "@tanstack/react-router";

import { formatDateTime } from "@/components/cases/case-meta";
import {
	formatPassRate,
	testRunProgress,
} from "@/components/test-runs/test-run-rates";
import { TestRunRowActions } from "@/components/test-runs/test-run-row-actions";
import { TestRunStatusBadge } from "@/components/test-runs/test-run-status-badge";

const COLUMNS = [
	{ label: "测试任务", width: "" },
	{ label: "状态", width: "w-24" },
	{ label: "进度", width: "w-24" },
	{ label: "通过率", width: "w-20" },
	{ label: "创建人", width: "" },
	{ label: "创建时间", width: "w-28" },
	{ label: "操作", width: "w-12" },
] as const;

const NUM_CLASS = "whitespace-nowrap tabular-nums";

const CREATOR_UNKNOWN = "—";

function ProgressCell({ item }: { item: TestRunListItem }) {
	const progress = testRunProgress(item.counts);
	const finished = progress.total > 0 && progress.done === progress.total;

	return (
		<TableCell className={NUM_CLASS}>
			<span className={cn(finished ? "font-medium" : undefined)}>
				{progress.done}/{progress.total}
			</span>
		</TableCell>
	);
}

interface TestRunRowProps {
	item: TestRunListItem;
	onEdit: (runId: string) => void;
}

function TestRunRow({ item, onEdit }: TestRunRowProps) {
	const { run } = item;

	return (
		<TableRow>
			<TableCell>
				<Link
					className="text-left font-medium hover:underline"
					params={{ projectId: run.projectId, runId: run.id }}
					to="/projects/$projectId/test-runs/$runId"
				>
					{run.name}
				</Link>
			</TableCell>
			<TableCell>
				<TestRunStatusBadge status={run.status} />
			</TableCell>
			<ProgressCell item={item} />
			<TableCell className={NUM_CLASS}>{formatPassRate(item.counts)}</TableCell>
			<TableCell className="text-muted-foreground">
				{item.createdByName ?? CREATOR_UNKNOWN}
			</TableCell>
			<TableCell className={cn(NUM_CLASS, "text-muted-foreground")}>
				{formatDateTime(run.createdAt)}
			</TableCell>
			<TableCell>
				<TestRunRowActions item={item} onEdit={onEdit} />
			</TableCell>
		</TableRow>
	);
}

interface TestRunTableProps {
	items: TestRunListItem[];
	onEdit: (runId: string) => void;
}

export function TestRunTable({ items, onEdit }: TestRunTableProps) {
	return (
		<Table>
			<TableHeader>
				<TableRow>
					{COLUMNS.map((column) => (
						<TableHead className={column.width} key={column.label}>
							{column.label === "操作" ? (
								<span className="sr-only">操作</span>
							) : (
								column.label
							)}
						</TableHead>
					))}
				</TableRow>
			</TableHeader>
			<TableBody>
				{items.map((item) => (
					<TestRunRow item={item} key={item.run.id} onEdit={onEdit} />
				))}
			</TableBody>
		</Table>
	);
}
