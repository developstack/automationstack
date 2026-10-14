import type { CaseStep } from "@automationstack/db/schema/test-cases";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@automationstack/ui/components/table";
import { cn } from "@automationstack/ui/lib/utils";

import { CASE_TABLE_HEAD_CLASS } from "@/components/cases/case-table-layout";
import type { MarkdownImageUrls } from "@/components/cases/markdown-inline-render";
import { MarkdownRender } from "@/components/cases/markdown-render";

const DEFAULT_EMPTY_TEXT = "还没有步骤。点击「编辑」添加操作步骤和预期结果。";

interface CaseStepsTableProps {
	/** 没有步骤时显示的文字。默认指引用户点击「编辑」添加 */
	emptyText?: string;
	imageUrls: MarkdownImageUrls;
	steps: readonly CaseStep[];
}

/** 只读的步骤表格。用在用例详情和版本历史的快照查看中。 */
export function CaseStepsTable({
	emptyText = DEFAULT_EMPTY_TEXT,
	imageUrls,
	steps,
}: CaseStepsTableProps) {
	if (steps.length === 0) {
		return (
			<p className="rounded-lg border border-dashed px-3 py-4 text-muted-foreground text-sm">
				{emptyText}
			</p>
		);
	}
	return (
		<div className="overflow-hidden rounded-lg border">
			<Table>
				<TableHeader>
					<TableRow className="hover:bg-transparent">
						<TableHead className={cn(CASE_TABLE_HEAD_CLASS, "w-10 pl-3")}>
							#
						</TableHead>
						<TableHead className={CASE_TABLE_HEAD_CLASS}>操作步骤</TableHead>
						<TableHead className={CASE_TABLE_HEAD_CLASS}>预期结果</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{steps.map((step, index) => (
						<TableRow className="last:border-b-0" key={step.id}>
							<TableCell className="numeric pl-3 align-top text-muted-foreground text-xs">
								{index + 1}
							</TableCell>
							<TableCell className="whitespace-normal align-top">
								<MarkdownRender imageUrls={imageUrls} text={step.step} />
							</TableCell>
							<TableCell className="whitespace-normal align-top">
								<MarkdownRender imageUrls={imageUrls} text={step.expected} />
							</TableCell>
						</TableRow>
					))}
				</TableBody>
			</Table>
		</div>
	);
}
