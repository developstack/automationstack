import type { User } from "@automationstack/db/schema/users";

const CREATED_AT = new Date("2026-01-01T00:00:00Z");

/** 测试用的本地平台管理员 admin。只写与默认值不同的字段。 */
export function testUser(overrides: Partial<User> = {}): User {
	return {
		authSource: "local",
		createdAt: CREATED_AT,
		disabledAt: null,
		externalId: null,
		id: "11111111-1111-4111-8111-111111111111",
		mustChangePassword: false,
		passwordHash: "hash",
		role: "admin",
		updatedAt: CREATED_AT,
		username: "admin",
		...overrides,
	};
}

/** UUID 最后一组的位数。 */
const UUID_LAST_GROUP_LENGTH = 12;

/** 测试用的第 index 条用例的 id（合法的 UUID）。 */
export function testCaseId(index: number): string {
	return `00000000-0000-4000-8000-${String(index).padStart(UUID_LAST_GROUP_LENGTH, "0")}`;
}

/** oRPC 过程的调用上下文。user 为 null 表示没有登录。 */
export function callContext(user: User | null) {
	return {
		actor: user === null ? null : { clientId: "t", name: user.username },
		cookies: [] as string[],
		secure: false,
		user,
	};
}
