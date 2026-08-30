import {
	getCaseVersion,
	listCaseVersions,
	rollbackCaseToVersion,
} from "@automationstack/db/repositories/case-versions-repository";
import { z } from "zod";

import type { Context } from "../context";
import { protectedProcedure } from "../index";
import { requireCaseMember } from "../lib/project-scope";
import { publishInvalidate } from "../lib/realtime-publish";

const caseVersionRefSchema = z.object({
	caseId: z.uuid(),
	version: z.number().int().min(1),
});

function actorName(context: Context): string | null {
	return context.actor?.name ?? null;
}

/**
 * Version-history procedures, spread into the `cases` router so they are
 * exposed as cases.listVersions / cases.getVersion / cases.rollback.
 *
 * 三条都按 `caseId` 过 `requireCaseMember`：版本快照里就是用例正文本身，
 * 口子不能比 `cases.get` 更宽。回滚同样只要求项目成员——它改的是一条用例，
 * 是 member 的本职（见 `lib/project-access.ts` 的 canAdministerProject）。
 */
export const caseVersionProcedures = {
	getVersion: protectedProcedure
		.errors({ NOT_FOUND: {} })
		.input(caseVersionRefSchema)
		.use(requireCaseMember)
		.handler(async ({ errors, input }) => {
			const version = await getCaseVersion(input.caseId, input.version);
			if (!version) {
				throw errors.NOT_FOUND({ message: "版本不存在" });
			}
			return version;
		}),
	listVersions: protectedProcedure
		.input(z.object({ caseId: z.uuid() }))
		.use(requireCaseMember)
		.handler(({ input }) => listCaseVersions(input.caseId)),
	rollback: protectedProcedure
		.errors({ NOT_FOUND: {} })
		.input(caseVersionRefSchema)
		.use(requireCaseMember)
		.handler(async ({ context, errors, input }) => {
			const result = await rollbackCaseToVersion({
				actorName: actorName(context),
				caseId: input.caseId,
				version: input.version,
			});
			if (result.kind === "written") {
				publishInvalidate({
					action: "restore",
					context,
					entity: "case",
					ids: [result.testCase.id],
					moduleId: result.testCase.moduleId,
					projectId: result.testCase.projectId,
				});
				return { testCase: result.testCase, version: result.version };
			}
			// 回滚目标与当前内容一致：用例已经就是那个样子，不再多记一个版本。
			if (result.kind === "unchanged") {
				return { testCase: result.testCase, version: null };
			}
			if (result.kind === "not-found") {
				throw errors.NOT_FOUND({ message: "用例或目标版本不存在" });
			}
			throw new Error("rollback: unexpected optimistic-lock conflict");
		}),
};
