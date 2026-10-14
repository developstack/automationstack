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

/** oRPC 过程的调用上下文。user 为 null 表示没有登录。 */
export function callContext(user: User | null) {
	return {
		actor: user === null ? null : { clientId: "t", name: user.username },
		cookies: [] as string[],
		secure: false,
		user,
	};
}
