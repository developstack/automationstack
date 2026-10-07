import type { z } from "zod";

const MAX_REPORTED_ISSUES = 20;

type IngestZodIssue = z.ZodError["issues"][number];

function describeIssue(issue: IngestZodIssue): string {
	const path = issue.path.join(".");
	return path.length > 0 ? `${path}: ${issue.message}` : issue.message;
}

export function formatIngestIssues(error: z.ZodError): string {
	const shown = error.issues.slice(0, MAX_REPORTED_ISSUES);
	const lines = shown.map(describeIssue);
	const omitted = error.issues.length - shown.length;
	if (omitted > 0) {
		lines.push(
			`……还有 ${omitted} 条问题未列出（共 ${error.issues.length} 条，只列前 ${MAX_REPORTED_ISSUES} 条）`
		);
	}
	return lines.join("；");
}
