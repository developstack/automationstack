import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@automationstack/ui/components/card";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";

import { formatDateTime } from "@/components/cases/case-meta";
import { orpc } from "@/utils/orpc";

interface RecentChangeRowProps {
	caseId: string;
	caseName: string;
	changeNote: string | null;
	createdAt: Date;
	projectId: string;
	savedBy: string | null;
	version: number;
}

function RecentChangeRow(props: RecentChangeRowProps) {
	return (
		<li className="flex flex-col gap-0.5 text-sm">
			<div className="flex items-center gap-2">
				<Link
					className="min-w-0 flex-1 truncate hover:underline"
					params={{ projectId: props.projectId }}
					search={{ caseId: props.caseId }}
					to="/projects/$projectId"
				>
					{props.caseName}
				</Link>
				<span className="shrink-0 text-muted-foreground text-xs tabular-nums">
					{`v${props.version}`}
				</span>
			</div>
			<div className="flex items-center gap-2 text-muted-foreground text-xs">
				<span className="shrink-0">{props.savedBy ?? "—"}</span>
				<span className="shrink-0 tabular-nums">
					{formatDateTime(props.createdAt)}
				</span>
				<span className="min-w-0 flex-1 truncate">
					{props.changeNote ?? "—"}
				</span>
			</div>
		</li>
	);
}

interface OverviewChangesCardProps {
	projectId: string;
}

export function OverviewChangesCard({ projectId }: OverviewChangesCardProps) {
	const { data } = useSuspenseQuery(
		orpc.projectStats.recentChanges.queryOptions({ input: { projectId } })
	);

	return (
		<Card>
			<CardHeader>
				<CardTitle>最近改动</CardTitle>
				<CardDescription>每保存一次用例就留下一条版本记录</CardDescription>
			</CardHeader>
			<CardContent>
				{data.length === 0 ? (
					<p className="text-muted-foreground text-sm">
						查过了：还没有任何版本记录。保存一次用例，这里就会出现第一条。
					</p>
				) : (
					<ul className="flex flex-col gap-2">
						{data.map((change) => (
							<RecentChangeRow
								caseId={change.caseId}
								caseName={change.caseName}
								changeNote={change.changeNote}
								createdAt={change.createdAt}
								key={change.versionId}
								projectId={projectId}
								savedBy={change.savedBy}
								version={change.version}
							/>
						))}
					</ul>
				)}
			</CardContent>
		</Card>
	);
}
