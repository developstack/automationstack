/**
 * 采纳提案的准入判定（纯函数，不碰数据库，见同目录 `*-core.ts` 的惯例）。
 *
 * 这里同时把住两道关：提案必须仍待评审，且必须与目标模块**同项目**。
 * 后者不是理论风险：提案只由 id 定位，而 id 是请求里可以随便填的，
 * 不比对项目就等于「拿到任意提案 id 即可把它采纳进自己有权限的模块」——
 * A 项目的生成结果会被搬进 B 项目。
 */
import type { AiProposalStatus, ProposedCase } from "../schema/ai";

/** 采纳事务读到的一行：提案本体 + 其所属会话的 projectId（由 join 带出）。 */
export interface AcceptanceProposalRow {
	id: string;
	proposal: ProposedCase;
	/** `ai_generation_sessions.project_id`，schema 上 notNull，无需处理空值。 */
	sessionProjectId: string;
	status: AiProposalStatus;
}

/**
 * 按入参 id 顺序返回可采纳的提案；任一 id 不满足条件则整批返回 null。
 *
 * 三类拒绝（id 不存在 / 已被处理 / 跨项目）**刻意合并成同一个返回值**，
 * 调用方统一转成 `invalid-proposals`：分开报会让接口变成一个预言机——
 * 攻击者拿「这条属于别的项目」和「这条不存在」的差异，就能逐个 id 探出
 * 哪些提案真实存在、以及自己没权限看的项目里有什么。不区分则一无所获。
 */
export function selectAcceptableProposals(
	rows: AcceptanceProposalRow[],
	ids: string[],
	moduleProjectId: string
): AcceptanceProposalRow[] | null {
	const byId = new Map(rows.map((row) => [row.id, row]));
	const ordered: AcceptanceProposalRow[] = [];
	for (const id of ids) {
		const row = byId.get(id);
		if (
			row?.status !== "proposed" ||
			row.sessionProjectId !== moduleProjectId
		) {
			return null;
		}
		ordered.push(row);
	}
	return ordered;
}
