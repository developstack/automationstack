import { desc, eq } from "drizzle-orm";

import { db } from "../index";
import {
	type TestRunCaseEvent,
	testRunCaseEvents,
} from "../schema/test-run-case-events";
import { users } from "../schema/users";

/**
 * 用例结论流水的**读**侧。写侧在 `test-run-verdicts-repository.ts`——
 * 流水只能与结论在同一个事务里落库，拆到这里会立刻变成两次独立写。
 */

export interface TestRunCaseEventItem {
	/**
	 * 事件发生时的操作人用户名，**纯展示**。
	 * null 只有一种成因：账号被删（外键 `set null`），署名丢了但事实还在。
	 */
	actorName: string | null;
	event: TestRunCaseEvent;
}

/**
 * 某条用例在某个测试任务里的结论时间线，最近的在前。
 *
 * 外形（`{ actorName, event }`）与 `listTestRunEvents` 完全一致是**刻意的**：
 * 两处在界面上是同一种「变更历史」列表，同一份渲染逻辑照抄即可，
 * 不必为多出来的一层嵌套再写一套 map。
 */
export function listTestRunCaseEvents(
	runCaseId: string
): Promise<TestRunCaseEventItem[]> {
	return (
		db
			.select({
				actorName: users.username,
				event: testRunCaseEvents,
			})
			.from(testRunCaseEvents)
			// LEFT JOIN：`actorId` 可空（账号已删），INNER 会让整条流水查不到。
			.leftJoin(users, eq(users.id, testRunCaseEvents.actorId))
			.where(eq(testRunCaseEvents.runCaseId, runCaseId))
			.orderBy(desc(testRunCaseEvents.createdAt))
	);
}
