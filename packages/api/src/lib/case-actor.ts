import type { CaseActor } from "@automationstack/db/repositories/case-activity-writes";

import type { Context } from "../context";

/** 写用例时记录的操作人：用户 id 和客户端显示名。 */
export function caseActor(context: Pick<Context, "actor" | "user">): CaseActor {
	return {
		actorId: context.user?.id ?? null,
		actorName: context.actor?.name ?? null,
	};
}
