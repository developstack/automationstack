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
import type { ReactNode } from "react";

import { useCaseAttachmentUrls } from "@/components/cases/case-attachment-context";
import {
	CASE_TYPE_LABELS,
	formatDateTime,
	PRIORITY_BADGE_VARIANTS,
} from "@/components/cases/case-meta";
import { CaseStatusBadge } from "@/components/cases/case-status-badge";
import type { MarkdownImageUrls } from "@/components/cases/markdown-inline-render";
import { MarkdownRender } from "@/components/cases/markdown-render";

function DetailRow({
	children,
	label,
}: {
	children: ReactNode;
	label: string;
}) {
	return (
		<div className="flex flex-col gap-1">
			<span className="text-muted-foreground text-xs">{label}</span>
			<div className="text-sm">{children}</div>
		</div>
	);
}

function CaseStepsTable({
	imageUrls,
	testCase,
}: {
	imageUrls: MarkdownImageUrls;
	testCase: TestCase;
}) {
	if (testCase.steps.length === 0) {
		return <p className="text-muted-foreground text-sm">暂无步骤。</p>;
	}
	return (
		<Table>
			<TableHeader>
				<TableRow>
					<TableHead>#</TableHead>
					<TableHead>操作步骤</TableHead>
					<TableHead>预期结果</TableHead>
				</TableRow>
			</TableHeader>
			<TableBody>
				{testCase.steps.map((step, index) => (
					<TableRow key={step.id}>
						<TableCell className="text-muted-foreground">{index + 1}</TableCell>
						<TableCell>
							<MarkdownRender imageUrls={imageUrls} text={step.step} />
						</TableCell>
						<TableCell>
							<MarkdownRender imageUrls={imageUrls} text={step.expected} />
						</TableCell>
					</TableRow>
				))}
			</TableBody>
		</Table>
	);
}

export function CaseDetailView({ testCase }: { testCase: TestCase }) {
	const imageUrls = useCaseAttachmentUrls(testCase.id);

	return (
		<div className="flex flex-col gap-4">
			<div className="flex flex-wrap items-center gap-2">
				<Badge variant={PRIORITY_BADGE_VARIANTS[testCase.priority]}>
					{testCase.priority}
				</Badge>
				<CaseStatusBadge status={testCase.status} />
				<Badge variant="outline">{CASE_TYPE_LABELS[testCase.caseType]}</Badge>
				{testCase.tags.map((tag) => (
					<Badge key={tag} variant="secondary">
						{tag}
					</Badge>
				))}
			</div>
			<div className="grid grid-cols-1 gap-x-3 gap-y-4 sm:grid-cols-3">
				<DetailRow label="维护人">{testCase.maintainer ?? "—"}</DetailRow>
				<DetailRow label="当前版本">{`v${testCase.currentVersion}`}</DetailRow>
				<DetailRow label="更新时间">
					{formatDateTime(testCase.updatedAt)}
				</DetailRow>
			</div>
			<DetailRow label="前置条件">
				{testCase.preconditions ? (
					<MarkdownRender imageUrls={imageUrls} text={testCase.preconditions} />
				) : (
					"—"
				)}
			</DetailRow>
			<CaseStepsTable imageUrls={imageUrls} testCase={testCase} />
		</div>
	);
}
