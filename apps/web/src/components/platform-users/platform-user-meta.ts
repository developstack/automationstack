import type { UserRole } from "@automationstack/db/schema/users";

const MIN_USERNAME_LENGTH = 2;
const MAX_USERNAME_LENGTH = 32;
const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 128;
const USERNAME_PATTERN = /^\S+$/;

export const USERNAME_HINT = `${MIN_USERNAME_LENGTH}–${MAX_USERNAME_LENGTH} 个字符，不能包含空格`;

export const PASSWORD_HINT = `${MIN_PASSWORD_LENGTH}–${MAX_PASSWORD_LENGTH} 个字符`;

export const PLATFORM_ROLE_LABEL: Record<UserRole, string> = {
	admin: "管理员",
	member: "成员",
};

interface RoleOption {
	label: string;
	value: UserRole;
}

export const PLATFORM_ROLE_OPTIONS: readonly RoleOption[] = [
	{ label: PLATFORM_ROLE_LABEL.member, value: "member" },
	{ label: PLATFORM_ROLE_LABEL.admin, value: "admin" },
];

export function validateUsername(value: string): string | null {
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

export function validatePassword(value: string): string | null {
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

export type PlatformUserConfirmKind =
	| "demote"
	| "disable"
	| "promote"
	| "restore";
