// Casdoor 管理 API 返回的对象。只保留本系统使用的字段（plan 021 §11.6）。

export interface CasdoorUserRecord {
	/** Casdoor 用户 id（UUID），等于 ID token 的 sub。 */
	id: string;
	isDeleted: boolean;
	isForbidden: boolean;
	name: string;
	owner: string;
}

export interface CasdoorRoleRecord {
	isEnabled: boolean;
	name: string;
	owner: string;
	/** 角色成员，格式是「组织/用户名」。 */
	users: string[];
}

export interface CasdoorOrganizationRecord {
	name: string;
	owner: string;
}

function asRecord(value: unknown): Record<string, unknown> | null {
	return typeof value === "object" && value !== null
		? (value as Record<string, unknown>)
		: null;
}

function text(value: unknown): string {
	return typeof value === "string" ? value : "";
}

export function toUserRecord(value: unknown): CasdoorUserRecord | null {
	const record = asRecord(value);
	if (record === null) {
		return null;
	}
	return {
		id: text(record.id),
		isDeleted: record.isDeleted === true,
		isForbidden: record.isForbidden === true,
		name: text(record.name),
		owner: text(record.owner),
	};
}

export function toRoleRecord(value: unknown): CasdoorRoleRecord | null {
	const record = asRecord(value);
	if (record === null) {
		return null;
	}
	const users = Array.isArray(record.users)
		? record.users.filter((user): user is string => typeof user === "string")
		: [];
	return {
		isEnabled: record.isEnabled === true,
		name: text(record.name),
		owner: text(record.owner),
		users,
	};
}

export function toOrganizationRecord(
	value: unknown
): CasdoorOrganizationRecord | null {
	const record = asRecord(value);
	if (record === null) {
		return null;
	}
	return { name: text(record.name), owner: text(record.owner) };
}
