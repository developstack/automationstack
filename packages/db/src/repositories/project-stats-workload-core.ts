// 项目概览的「成员工作量」：每个成员在近 7 天和近 30 天中执行的用例数和新建的用例数。

/** 一个时间段中的工作量。 */
export interface WorkloadCounts {
	/** 新建的用例数，包括导入的用例。 */
	created: number;
	/** 手动判定过的测试任务用例数。同一条测试任务用例判定多次只算一次。 */
	executed: number;
}

export interface MemberWorkload {
	last7Days: WorkloadCounts;
	last30Days: WorkloadCounts;
	userId: string;
	username: string;
}

export interface WorkloadStats {
	members: MemberWorkload[];
}

/** 一个用户在两个时间段中的一种计数。 */
export interface ActorCountRow {
	actorId: string;
	last7Days: number;
	last30Days: number;
	username: string;
}

export interface WorkloadMemberRow {
	disabled: boolean;
	userId: string;
	username: string;
}

export interface BuildWorkloadInput {
	created: readonly ActorCountRow[];
	executed: readonly ActorCountRow[];
	members: readonly WorkloadMemberRow[];
}

const NO_WORK: WorkloadCounts = { created: 0, executed: 0 };

function hasWork(member: MemberWorkload): boolean {
	return member.last30Days.created > 0 || member.last30Days.executed > 0;
}

/**
 * 列出项目中所有没有停用的成员，没有工作量的成员显示 0。
 * 已经停用或已经离开项目、但在近 30 天有工作量的用户也列出。按用户名排序，不按工作量排序。
 */
export function buildWorkload(input: BuildWorkloadInput): WorkloadStats {
	const byUser = new Map<string, MemberWorkload>();
	const entry = (userId: string, username: string): MemberWorkload => {
		const existing = byUser.get(userId);
		if (existing) {
			return existing;
		}
		const created = {
			last7Days: { ...NO_WORK },
			last30Days: { ...NO_WORK },
			userId,
			username,
		};
		byUser.set(userId, created);
		return created;
	};
	for (const row of input.executed) {
		const member = entry(row.actorId, row.username);
		member.last7Days.executed = row.last7Days;
		member.last30Days.executed = row.last30Days;
	}
	for (const row of input.created) {
		const member = entry(row.actorId, row.username);
		member.last7Days.created = row.last7Days;
		member.last30Days.created = row.last30Days;
	}
	const listed = input.members.filter((member) => !member.disabled);
	for (const member of listed) {
		entry(member.userId, member.username);
	}
	const members = [...byUser.values()].filter(
		(member) =>
			hasWork(member) || listed.some((m) => m.userId === member.userId)
	);
	members.sort((a, b) => a.username.localeCompare(b.username, "zh-Hans-CN"));
	return { members };
}
