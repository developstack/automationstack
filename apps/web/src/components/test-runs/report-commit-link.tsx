import { ExternalLinkIcon } from "lucide-react";

import { formatCommitShort } from "@/components/test-runs/report-automation-meta";
import { isSafeHttpUrl } from "@/components/test-runs/report-meta";

/** 没有 commit（本机跑、SDK 没报）时的占位。 */
const NO_COMMIT = "—";

interface ReportCommitLinkProps {
	/** CI 里跑才有；本机跑就是 null，那时只显示短 hash，不出链接。 */
	ciUrl: string | null;
	commitSha: string | null;
}

/**
 * 「跑在哪个 commit 上」这一格，失败清单（§6.2）与执行记录块（§6.3）共用一份。
 *
 * 两处都要「短 hash + 有 ciUrl 就链过去」，各写一份的下场是某天有人只改了其中
 * 一处的协议判定——而这正是**必须**判协议的地方：`ciUrl` 由上报方（脚本、CI
 * 配置）填，是一段外部可控字符串，`javascript:` 是一个合法 URL，只有白名单挡得住
 * （判定与实测见 report-meta.ts 的 isSafeHttpUrl）。
 *
 * 判定不通过时**只降级成纯文本，不丢弃**：那一版 commit 仍然是要交代的事实，
 * 读报告的人有权看到脚本报上来的是什么。全长 hash 挂在 title 上，要复制的人拿得到。
 */
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
