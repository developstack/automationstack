import { ExternalLinkIcon } from "lucide-react";

import { formatCommitShort } from "@/components/test-runs/report-automation-meta";
import { isSafeHttpUrl } from "@/components/test-runs/report-meta";

const NO_COMMIT = "—";

interface ReportCommitLinkProps {
	ciUrl: string | null;
	commitSha: string | null;
}

export function ReportCommitLink({ ciUrl, commitSha }: ReportCommitLinkProps) {
	const short = formatCommitShort(commitSha);
	if (short === null) {
		return <span className="text-muted-foreground">{NO_COMMIT}</span>;
	}
	if (!isSafeHttpUrl(ciUrl)) {
		return (
			<span className="font-mono" title={commitSha ?? undefined}>
				{short}
			</span>
		);
	}
	return (
		<a
			className="inline-flex items-center gap-1 font-mono underline underline-offset-2"
			href={ciUrl ?? ""}
			rel="noopener"
			target="_blank"
			title={commitSha ?? undefined}
		>
			{short}
			<ExternalLinkIcon aria-hidden="true" className="size-3.5" />
		</a>
	);
}
