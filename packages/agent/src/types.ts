/**
 * agent 的领域类型。
 *
 * **类型归属：这里是定义处，`packages/db` 是符合方。** 以前 `ProposedCase`
 * 定义在 `packages/db/src/schema/ai.ts`，agent 反过来 import 数据库包才能描述
 * 自己的产出物——那条依赖是本包不可独立发布的根因之一。现在方向反过来：
 * 本包零 db / 零 env 依赖地定义这些形状，db 侧再导入并用编译期断言钉住一致
 * （见 `packages/db/src/schema/ai.ts` 末尾）。
 *
 * `CasePriority` / `CaseType` / `GenerationSessionStatus` 在 db 侧是 pgEnum，
 * 那三张枚举**仍然属于 db**（迁移、约束都由它管）。这里写的是同一组取值的
 * 字符串联合：本包不认识 drizzle，也不该为了拿几个字符串把 pgEnum 拖进来。
 */

/** 用例优先级；对应 db 的 `case_priority` pgEnum。 */
export type CasePriority = "P0" | "P1" | "P2" | "P3";

/** 用例类型；对应 db 的 `case_type` pgEnum。 */
export type CaseType =
	| "functional"
	| "interface"
	| "performance"
	| "security"
	| "compatibility"
	| "other";

/** 生成会话状态；对应 db 的 `ai_session_status` pgEnum。 */
export type GenerationSessionStatus =
	| "pending"
	| "running"
	| "completed"
	| "failed"
	| "cancelled";

/** 用例的单个操作步骤。 */
export interface CaseStep {
	expected: string;
	id: string;
	step: string;
}

/**
 * agent 提出的一条测试用例提案。宿主把它落进 `ai_case_proposals.proposal`，
 * 人工评审通过后才会变成真正的用例——**采纳动作不属于本包**。
 */
export interface ProposedCase {
	caseType: CaseType;
	name: string;
	preconditions: string | null;
	priority: CasePriority;
	steps: CaseStep[];
	tags: string[];
}
