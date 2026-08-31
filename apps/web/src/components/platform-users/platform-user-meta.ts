import type { UserRole } from "@automationstack/db/schema/users";

/*
 * 这几条规则是 packages/api/src/routers/users.ts 里 zod schema 的镜像。
 * 服务端校验失败只回一句笼统的 "Input validation failed"，密码差两位也看不出来，
 * 所以同一套规则在输入时就要说清楚，而不是等提交完再猜。
 */
const MIN_USERNAME_LENGTH = 2;
const MAX_USERNAME_LENGTH = 32;
const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 128;
/** 与服务端同款：用户名要出现在署名里，两侧空格看不出来。 */
const USERNAME_PATTERN = /^\S+$/;

export const USERNAME_HINT = `${MIN_USERNAME_LENGTH}–${MAX_USERNAME_LENGTH} 个字符，不能包含空格`;

export const PASSWORD_HINT = `${MIN_PASSWORD_LENGTH}–${MAX_PASSWORD_LENGTH} 个字符`;

/** 平台角色的中文名。项目角色（owner / member）是另一套，在 project-member-meta.ts。 */
export const PLATFORM_ROLE_LABEL: Record<UserRole, string> = {
	admin: "管理员",
	member: "成员",
};

interface RoleOption {
	label: string;
	value: UserRole;
}

/** member 排在前面：新建用户默认就是 member，第一项即默认值。 */
export const PLATFORM_ROLE_OPTIONS: readonly RoleOption[] = [
	{ label: PLATFORM_ROLE_LABEL.member, value: "member" },
	{ label: PLATFORM_ROLE_LABEL.admin, value: "admin" },
];

/** 返回错误文案；通过校验时返回 null。 */
export function validateUsername(value: string): string | null {
	// 服务端 schema 先 trim 再量长度，这里必须同序，否则两边的边界不一致
	const trimmed = value.trim();
	if (trimmed.length < MIN_USERNAME_LENGTH) {
		return `用户名至少 ${MIN_USERNAME_LENGTH} 个字符`;
	}
	if (trimmed.length > MAX_USERNAME_LENGTH) {
		return `用户名最多 ${MAX_USERNAME_LENGTH} 个字符`;
	}
	if (!USERNAME_PATTERN.test(trimmed)) {
		return "用户名不能包含空格";
	}
	return null;
}

/** 返回错误文案；通过校验时返回 null。 */
export function validatePassword(value: string): string | null {
	// 密码不 trim：前后空格是有效字符，服务端也原样收
	if (value.length < MIN_PASSWORD_LENGTH) {
		return `密码至少 ${MIN_PASSWORD_LENGTH} 个字符`;
	}
	if (value.length > MAX_PASSWORD_LENGTH) {
		return `密码最多 ${MAX_PASSWORD_LENGTH} 个字符`;
	}
	return null;
}

export function isUserRole(value: string | null): value is UserRole {
	return value === "admin" || value === "member";
}

/**
 * 行内菜单里需要二次确认的四个动作。
 * 恢复 / 改角色本身不算破坏性，但它们和停用一样可能被服务端挡下
 * （不能降级最后一个管理员、不能停用自己），确认框同时也是这些错误的落点。
 *
 * 「管理项目归属」不在其列：那不是一个一次点完的动作，而是一整张可以来回增删的
 * 表，它有自己的对话框（manage-user-projects-dialog.tsx）。
 */
export type PlatformUserConfirmKind =
	| "demote"
	| "disable"
	| "promote"
	| "restore";
