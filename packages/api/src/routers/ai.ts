import { readAiConfigStatus } from "@automationstack/ai/provider-config-store";
import { acceptProposals } from "@automationstack/db/repositories/ai-acceptance-repository";
import {
	listCaseProposalsBySession,
	rejectCaseProposals,
} from "@automationstack/db/repositories/ai-proposals-repository";
import {
	createGenerationSession,
	getGenerationSessionById,
	listGenerationSessions,
} from "@automationstack/db/repositories/ai-sessions-repository";
import { z } from "zod";

import type { Context } from "../context";
import { protectedProcedure } from "../index";
import { streamGeneration } from "../lib/ai-generation-stream";
import { publishInvalidate } from "../lib/realtime-publish";

const REQUIREMENT_MAX_LENGTH = 4000;
const UNKNOWN_MODEL = "unknown";

const generateSchema = z.object({
	moduleId: z.uuid().optional(),
	projectId: z.uuid(),
	requirement: z.string().min(1).max(REQUIREMENT_MAX_LENGTH),
});

const proposalIdsSchema = z.object({
	proposalIds: z.array(z.uuid()).min(1),
});

const acceptProposalsSchema = proposalIdsSchema.extend({
	moduleId: z.uuid(),
});

function actorName(context: Context): string | null {
	return context.actor?.name ?? null;
}

export const aiRouter = {
	acceptProposals: protectedProcedure
		.errors({ BAD_REQUEST: {}, NOT_FOUND: {} })
		.input(acceptProposalsSchema)
		.handler(async ({ context, errors, input }) => {
			const result = await acceptProposals({
				actorName: actorName(context),
				moduleId: input.moduleId,
				proposalIds: input.proposalIds,
			});
			if (result.kind === "invalid-module") {
				throw errors.NOT_FOUND({ message: "目标模块不存在" });
			}
			if (result.kind === "invalid-proposals") {
				throw errors.BAD_REQUEST({
					message: "存在不可采纳的提案（不存在或已被处理）",
				});
			}
			// 采纳成功即产生新用例，通知同项目的其他在线客户端刷新列表/脑图。
			publishInvalidate({
				action: "create",
				context,
				entity: "case",
				ids: result.caseIds,
				moduleId: input.moduleId,
				projectId: result.projectId,
			});
			return { caseIds: result.caseIds };
		}),
	generate: protectedProcedure
		.errors({ SERVICE_UNAVAILABLE: {} })
		.input(generateSchema)
		.handler(async ({ errors, input, signal }) => {
			// 一次拿到「能不能跑」和「跑不了为什么」：生效口径只看环境变量
			//（登记表不是生效决策点，见 config-store.ts），没配齐就引导去补。
			const status = readAiConfigStatus();
			if (status.problem !== null) {
				throw errors.SERVICE_UNAVAILABLE({ message: status.problem });
			}
			const session = await createGenerationSession({
				model: status.modelId ?? UNKNOWN_MODEL,
				moduleId: input.moduleId ?? null,
				projectId: input.projectId,
				requirement: input.requirement,
				status: "running",
			});
			return streamGeneration({
				moduleId: input.moduleId,
				projectId: input.projectId,
				requirement: input.requirement,
				sessionId: session.id,
				signal,
			});
		}),
	getSession: protectedProcedure
		.errors({ NOT_FOUND: {} })
		.input(z.object({ sessionId: z.uuid() }))
		.handler(async ({ errors, input }) => {
			const session = await getGenerationSessionById(input.sessionId);
			if (!session) {
				throw errors.NOT_FOUND({ message: "生成会话不存在" });
			}
			const proposals = await listCaseProposalsBySession(session.id);
			return { proposals, session };
		}),
	listSessions: protectedProcedure
		.input(z.object({ projectId: z.uuid() }))
		.handler(({ input }) => listGenerationSessions(input.projectId)),
	rejectProposals: protectedProcedure
		.input(proposalIdsSchema)
		.handler(async ({ input }) => {
			const rejectedIds = await rejectCaseProposals(input.proposalIds);
			return { rejectedIds };
		}),
};
