/**
 * 「用户 × 项目」平铺结果的归并（平台 `/users` 页的「所属项目」列）。
 *
 * SQL 那一侧是 users leftJoin project_members leftJoin projects，出来是笛卡尔
 * 展开：属于 3 个项目的人占 3 行，一个项目都没有的人占 1 行且项目列全是 null。
 * 界面要的是「一人一行」，所以要归并；归并逻辑单独成文件是为了能测——它是这条
 * 链路上唯一会**静默**出错的地方（把两个人并成一个、或者把没项目的人整个吃掉，
 * 既不抛异常也不让 tsc 变红）。同类先例：`test-run-metrics-core.ts`。
 *
 * 本文件不 import `../index`（那才是真正连库的地方），只 import type，
 * 因此配套的测试不需要 `DATABASE_URL`。
 */

import type { ProjectRole } from "../schema/project-members";
import type { PublicUser } from "../schema/users";

/** 「所属项目」列里的一项：项目本身 + 这个人在里面的角色。 */
export interface UserProjectMembership {
	id: string;
	name: string;
	role: ProjectRole;
}

/**
 * 归并后的一行。用户字段整体复用 `PublicUser` 而不是就地摊平：
 * 「哪些列可以下发」只在 `schema/users.ts` 有一处定义，将来给 users 加一列
 * 敏感字段时，这里不会跟着把它漏出去。
 */
export interface UserWithProjects {
	projects: UserProjectMembership[];
	user: PublicUser;
}

/**
 * 归并前的一行。项目那三列同生同死（leftJoin 落空时一起为 null），
 * 但类型上它们是三个独立的可空字段，所以下面逐个判空而不是只看其中一个。
 */
export interface UserProjectRow {
	projectId: string | null;
	projectName: string | null;
	projectRole: ProjectRole | null;
	user: PublicUser;
}

/** 项目列全 null = 这个人一个项目都没有，是 leftJoin 专为他保下的那一行。 */
function toMembership(row: UserProjectRow): UserProjectMembership | null {
	if (
		row.projectId === null ||
		row.projectName === null ||
		row.projectRole === null
	) {
		return null;
	}
	return { id: row.projectId, name: row.projectName, role: row.projectRole };
}

/**
 * 按 userId 归并成「一人一行」。
 *
 * 两个顺序都**原样保留输入顺序**，不在这里重排：用户顺序与项目顺序都由查询的
 * `order by` 决定（用户 createdAt asc，与 `listUsers()` 一致；项目按名字），
 * 在这里再排一次只会多出一个能和 SQL 打架的地方。用户的出场位置取他第一行出现
 * 的位置，所以即使同一个人的多行不连续（createdAt 撞车时理论上可能），
 * 结果仍然是一人一行。
 */
export function groupUsersWithProjects(
	rows: UserProjectRow[]
): UserWithProjects[] {
	const grouped = new Map<string, UserWithProjects>();
	for (const row of rows) {
		let entry = grouped.get(row.user.id);
		if (entry === undefined) {
			entry = { projects: [], user: row.user };
			grouped.set(row.user.id, entry);
		}
		const membership = toMembership(row);
		if (membership !== null) {
			entry.projects.push(membership);
		}
	}
	return [...grouped.values()];
}
