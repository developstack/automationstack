import { desc, eq } from "drizzle-orm";

import { db } from "../index";
import {
	type TestRunCaseEvent,
	testRunCaseEvents,
} from "../schema/test-run-case-events";
import { users } from "../schema/users";

export interface TestRunCaseEventItem {
	actorName: string | null;
	event: TestRunCaseEvent;
}

export function listTestRunCaseEvents(
	runCaseId: string
): Promise<TestRunCaseEventItem[]> {
	return db
		.select({
			actorName: users.username,
			event: testRunCaseEvents,
		})
		.from(testRunCaseEvents)
		.leftJoin(users, eq(users.id, testRunCaseEvents.actorId))
		.where(eq(testRunCaseEvents.runCaseId, runCaseId))
		.orderBy(desc(testRunCaseEvents.createdAt));
}
