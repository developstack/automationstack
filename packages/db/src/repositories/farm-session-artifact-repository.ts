import { asc, eq } from "drizzle-orm";

import { db } from "../index";
import {
	type FarmSessionArtifact,
	farmSessionArtifacts,
	type NewFarmSessionArtifact,
} from "../schema/farm-session-artifacts";

/**
 * 会话产物的元数据读写（phase4 §4 / D12）。
 *
 * 只管数据库这一半：**R2 上的对象由 api 侧那套上传通道负责**
 * （`packages/api/src/lib/ingest/attachment-uploads.ts`），这里连 object key 长什么样
 * 都不知道。与 `case-attachments-repository.ts` 同一条分工。
 *
 * **刻意没有 remove**：产物行随会话 cascade 消失就够了，单独删一条只会让详情页
 * 出现「HAR 里引用了第 7 张截图但那张不在了」这种半份记录。真要清理就整条会话删。
 */

/**
 * 落一条产物行。**收尾流程里这一步是异步的、可失败的**（§5.2：先释放容器再上传），
 * 所以调用方必须能接住这里抛出的异常并把它记进 `statusReason`
 * （约定 `artifacts_upload_failed`），而不是让它冒泡把整个收尾打断——
 * 容器已经放掉了，收尾没有可回滚的东西。
 */
export async function insertArtifact(
	row: NewFarmSessionArtifact
): Promise<FarmSessionArtifact> {
	const [created] = await db
		.insert(farmSessionArtifacts)
		.values(row)
		.returning();
	if (!created) {
		throw new Error(
			`写入 farm 会话产物失败：插入没有返回行 session=${row.sessionId} kind=${row.kind}`
		);
	}
	return created;
}

/**
 * 某条会话的全部产物，写入顺序（即录制时序）排列。
 *
 * 按 `createdAt` 升序而不是按 `kind` 分组：截图的顺序**就是**它的语义（穷人版
 * filmstrip，§5.5），一分组就散了。前端要分组自己在内存里分。
 */
export function listArtifactsBySession(
	sessionId: string
): Promise<FarmSessionArtifact[]> {
	return db
		.select()
		.from(farmSessionArtifacts)
		.where(eq(farmSessionArtifacts.sessionId, sessionId))
		.orderBy(asc(farmSessionArtifacts.createdAt));
}
