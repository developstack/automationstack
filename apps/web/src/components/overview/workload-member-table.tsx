import type {
	MemberWorkload,
	WorkloadCounts,
} from "@automationstack/db/repositories/project-stats-workload-core";

import { BarcodeProgress } from "@/components/barcode/barcode-progress";
import { UserAvatar } from "@/components/layout/user-avatar";
import { formatCount } from "@/components/overview/overview-metrics";
import {
	WORKLOAD_METRICS,
	type WorkloadBarScale,
	type WorkloadPeriod,
	workloadBarScale,
} from "@/components/overview/workload-meta";

// 工作量不是需要注意的信号，所以竖线用浅灰色
const BAR_FILL = "bg-muted-foreground/50";

interface WorkloadCellProps {
	metric: keyof WorkloadCounts;
	scale: WorkloadBarScale;
	value: number;
}

/** 一个数：条码和数字。0 显示一小段虚线，表示这段时间没有这项工作。 */
function WorkloadCell({ metric, scale, value }: WorkloadCellProps) {
	return (
		<td className="py-1.5 pl-4">
			<div className="flex items-center gap-2">
				<div className="min-w-0 flex-1">
					{value > 0 ? (
						<div style={{ width: `${scale.widthPercentFor(value)}%` }}>
							<BarcodeProgress
								maxMarks={scale.marksFor(value)}
								segments={[{ fillClassName: BAR_FILL, key: metric, value }]}
								size="sm"
							/>
						</div>
					) : (
						<BarcodeProgress className="w-6" segments={[]} size="sm" />
					)}
				</div>
				<span className="numeric w-10 shrink-0 text-right text-sm">
					{formatCount(value)}
				</span>
			</div>
		</td>
	);
}

interface WorkloadRowProps {
	member: MemberWorkload;
	period: WorkloadPeriod;
	scales: Record<keyof WorkloadCounts, WorkloadBarScale>;
}

function WorkloadRow({ member, period, scales }: WorkloadRowProps) {
	return (
		<tr>
			<th className="py-1.5 text-left font-normal" scope="row">
				<span className="flex min-w-0 items-center gap-2">
					<UserAvatar username={member.username} />
					<span className="truncate">{member.username}</span>
				</span>
			</th>
			{WORKLOAD_METRICS.map((metric) => (
				<WorkloadCell
					key={metric.key}
					metric={metric.key}
					scale={scales[metric.key]}
					value={member[period][metric.key]}
				/>
			))}
		</tr>
	);
}

interface WorkloadMemberTableProps {
	members: readonly MemberWorkload[];
	period: WorkloadPeriod;
}

/** 每个成员一行：头像和用户名，然后是执行和新建用例。同一列的条码使用同一个刻度。 */
export function WorkloadMemberTable({
	members,
	period,
}: WorkloadMemberTableProps) {
	const values = (key: keyof WorkloadCounts) =>
		members.map((member) => member[period][key]);
	const scales: Record<keyof WorkloadCounts, WorkloadBarScale> = {
		created: workloadBarScale(values("created")),
		executed: workloadBarScale(values("executed")),
	};
	return (
		<div className="max-h-80 overflow-y-auto">
			<table className="w-full table-fixed text-sm">
				<thead className="sticky top-0 bg-card">
					<tr className="text-left text-muted-foreground text-xs">
						<th className="w-36 pb-1.5 font-normal" scope="col">
							成员
						</th>
						{WORKLOAD_METRICS.map((metric) => (
							<th
								className="pb-1.5 pl-4 font-normal"
								key={metric.key}
								scope="col"
							>
								{metric.label}
							</th>
						))}
					</tr>
				</thead>
				<tbody>
					{members.map((member) => (
						<WorkloadRow
							key={member.userId}
							member={member}
							period={period}
							scales={scales}
						/>
					))}
				</tbody>
			</table>
		</div>
	);
}
