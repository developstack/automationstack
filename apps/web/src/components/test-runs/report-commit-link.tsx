import { buttonVariants } from "@automationstack/ui/components/button";
import { cn } from "@automationstack/ui/lib/utils";
import { ExternalLinkIcon } from "lucide-react";
import { HintTooltip } from "@/components/interaction/hint-tooltip";
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
			<HintTooltip label={commitSha}>
				<span className="font-mono">{short}</span>
			</HintTooltip>
		);
	}
	return (
		<HintTooltip label={commitSha}>
			<a
				className={cn(
					buttonVariants({ size: "inline", variant: "link" }),
					"inline-flex items-center gap-1 font-mono text-inherit underline underline-offset-2"
				)}
				href={ciUrl ?? ""}
				rel="noopener"
				target="_blank"
			>
				{short}
				<ExternalLinkIcon aria-hidden="true" className="size-3.5" />
			</a>
		</HintTooltip>
	);
}
