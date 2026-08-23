import { desc, eq } from "drizzle-orm";

import { db } from "../index";
import type { AiGenerationSession, AiSessionStatus } from "../schema/ai";
import { aiGenerationSessions } from "../schema/ai";

export interface CreateGenerationSessionInput {
	/** 会话使用的模型 id（来自 AI provider 配置）。 */
	model: string;
	moduleId?: string | null;
	projectId: string;
	requirement: string;
	status?: AiSessionStatus;
}

export interface UpdateGenerationSessionStatusInput {
	error?: string | null;
	id: string;
	status: AiSessionStatus;
}

/** 新建一次生成会话；返回的行 id 用于串联提案与流式事件。 */
export async function createGenerationSession(
	input: CreateGenerationSessionInput
): Promise<AiGenerationSession> {
	const [row] = await db
		.insert(aiGenerationSessions)
		.values({
			model: input.model,
			moduleId: input.moduleId ?? null,
			projectId: input.projectId,
			requirement: input.requirement,
			status: input.status ?? "pending",
		})
		.returning();
	if (!row) {
		throw new Error("createGenerationSession: insert returned no row");
	}
	return row;
}

/** 更新会话终态（completed / failed / cancelled）及错误信息。 */
export async function updateGenerationSessionStatus(
	input: UpdateGenerationSessionStatusInput
): Promise<AiGenerationSession | null> {
	const [row] = await db
		.update(aiGenerationSessions)
		.set({ error: input.error ?? null, status: input.status })
		.where(eq(aiGenerationSessions.id, input.id))
		.returning();
	return row ?? null;
}

export async function getGenerationSessionById(
	id: string
): Promise<AiGenerationSession | null> {
	const [row] = await db
		.select()
		.from(aiGenerationSessions)
		.where(eq(aiGenerationSessions.id, id))
		.limit(1);
	return row ?? null;
}

/** 项目下的会话列表，最新的排在前面。 */
export function listGenerationSessions(
	projectId: string
): Promise<AiGenerationSession[]> {
	return db
		.select()
		.from(aiGenerationSessions)
		.where(eq(aiGenerationSessions.projectId, projectId))
		.orderBy(desc(aiGenerationSessions.createdAt));
}
