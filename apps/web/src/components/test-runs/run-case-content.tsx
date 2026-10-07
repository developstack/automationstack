import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@automationstack/ui/components/card";

import type { MarkdownImageUrls } from "@/components/cases/markdown-inline-render";
import { MarkdownRender } from "@/components/cases/markdown-render";
import type { RunCaseDetail } from "@/components/test-runs/run-execution-meta";

type RunTestCase = RunCaseDetail["testCase"];

export function RunCaseContent({
	imageUrls,
	testCase,
}: {
	imageUrls: MarkdownImageUrls;
	testCase: RunTestCase;
}) {
	return (
		<section className="border-t pt-4">
			<Card size="sm">
				<CardHeader>
					<CardTitle className="flex items-center justify-between gap-2">
						<span className="text-muted-foreground">前置条件</span>
					</CardTitle>
				</CardHeader>
				<CardContent>
					<div className="text-foreground">
						{testCase.preconditions ? (
							<MarkdownRender
								imageUrls={imageUrls}
								text={testCase.preconditions}
							/>
						) : (
							<p>—</p>
						)}
					</div>
				</CardContent>
			</Card>
		</section>
	);
}
