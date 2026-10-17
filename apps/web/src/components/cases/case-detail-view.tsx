import type { TestCase } from "@automationstack/db/schema/test-cases";
import { Badge } from "@automationstack/ui/components/badge";
import type { ReactNode } from "react";

import { useCaseAttachmentUrls } from "@/components/cases/case-attachment-context";
import { CASE_TYPE_LABELS } from "@/components/cases/case-meta";
import { CaseStepsList } from "@/components/cases/case-steps-list";
import { MarkdownRender } from "@/components/cases/markdown-render";

const EMPTY_VALUE = <span className="text-muted-foreground">—</span>;

function DetailRow({
	children,
	label,
}: {
	children: ReactNode;
	label: string;
}) {
	return (
		<div className="flex min-w-0 flex-col gap-1">
			<dt className="eyebrow">{label}</dt>
			<dd className="text-sm">{children}</dd>
		</div>
	);
}

function DetailSection({
	children,
	title,
}: {
	children: ReactNode;
	title: string;
}) {
	return (
		<section className="flex flex-col gap-2">
			<h3 className="eyebrow">{title}</h3>
			{children}
		</section>
	);
}

function CaseTags({ tags }: { tags: string[] }) {
	if (tags.length === 0) {
		return EMPTY_VALUE;
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

interface CaseDetailViewProps {
	testCase: TestCase;
}

/** 用例详情的只读内容。用例编号、用例状态、优先级、版本和更新时间显示在面板头部。 */
export function CaseDetailView({ testCase }: CaseDetailViewProps) {
	const imageUrls = useCaseAttachmentUrls(testCase.id);

	return (
		<div className="flex flex-col gap-6">
			<dl className="grid grid-cols-1 gap-x-4 gap-y-4 sm:grid-cols-3">
				<DetailRow label="用例类型">
					{CASE_TYPE_LABELS[testCase.caseType]}
				</DetailRow>
				<DetailRow label="维护人">
					{testCase.maintainer ?? EMPTY_VALUE}
				</DetailRow>
				<DetailRow label="标签">
					<CaseTags tags={testCase.tags} />
				</DetailRow>
			</dl>
			<DetailSection title="前置条件">
				{testCase.preconditions ? (
					<MarkdownRender imageUrls={imageUrls} text={testCase.preconditions} />
				) : (
					<p className="text-muted-foreground text-sm">没有前置条件。</p>
				)}
			</DetailSection>
			<DetailSection title="操作步骤">
				<CaseStepsList imageUrls={imageUrls} steps={testCase.steps} />
			</DetailSection>
		</div>
	);
}
