import { localLoginAdminBlocker } from "@automationstack/db/local-login";
import {
	hashPassword,
	MAX_PASSWORD_LENGTH,
	MIN_PASSWORD_LENGTH,
} from "@automationstack/db/password";
import {
	countLocalLoginAdmins,
	createUser,
	getUserById,
	listUsers,
	listUsersWithProjects,
	setUserDisabled,
	updateUserPasswordHash,
	updateUserRole,
} from "@automationstack/db/repositories/users-repository";
import {
	toPublicUser,
	type User,
	userRoleEnum,
} from "@automationstack/db/schema/users";
import { z } from "zod";

import {
	CASDOOR_MANAGED_USER_MESSAGE,
	CASDOOR_NO_LOCAL_PASSWORD_MESSAGE,
	CASDOOR_USER_CREATE_MESSAGE,
	isManagedByCasdoor,
	isUserCreateClosed,
} from "../auth/casdoor/managed-users";
import { getEffectiveAuthSettings } from "../auth/settings-store";
import { adminProcedure } from "../index";

const MIN_USERNAME_LENGTH = 2;
const MAX_USERNAME_LENGTH = 32;
const USERNAME_PATTERN = /^\S+$/;

/** 三个平台角色：平台管理员、项目管理员、普通用户。 */
const roleSchema = z.enum(userRoleEnum.enumValues);

const usernameSchema = z
	.string()
	.trim()
	.min(MIN_USERNAME_LENGTH)
	.max(MAX_USERNAME_LENGTH)
	.regex(USERNAME_PATTERN, "用户名不能包含空格");

const passwordSchema = z
	.string()
	.min(MIN_PASSWORD_LENGTH)
	.max(MAX_PASSWORD_LENGTH);

const userIdSchema = z.object({ id: z.uuid() });

const routerErrors = {
	BAD_REQUEST: {},
	CONFLICT: {},
	FORBIDDEN: {},
	NOT_FOUND: {},
} as const;

/**
 * 「不能降级或停用最后一个平台管理员」只计算可以本地登录的平台管理员（plan 021 T12）。
 * Casdoor 平台管理员不能用本地密码登录，Casdoor 不可用时不能用来恢复。
 * 改成项目管理员或普通用户都算降级。
 */
async function isLastLocalAdmin(target: User): Promise<boolean> {
	if (localLoginAdminBlocker(target) !== null) {
		return false;
	}
	return (await countLocalLoginAdmins()) <= 1;
}

export const usersRouter = {
	create: adminProcedure
		.errors(routerErrors)
		.input(
			z.object({
				password: passwordSchema,
				role: roleSchema.default("member"),
				username: usernameSchema,
			})
		)
		.handler(async ({ errors, input }) => {
			if (isUserCreateClosed(await getEffectiveAuthSettings())) {
				throw errors.FORBIDDEN({ message: CASDOOR_USER_CREATE_MESSAGE });
			}
			const user = await createUser({
				passwordHash: await hashPassword(input.password),
				role: input.role,
				username: input.username,
			});
			if (user === null) {
				throw errors.CONFLICT({ message: "用户名已被占用" });
			}
			return toPublicUser(user);
		}),
	list: adminProcedure.handler(async () =>
		(await listUsers()).map(toPublicUser)
	),
	listWithProjects: adminProcedure.handler(() => listUsersWithProjects()),
	resetPassword: adminProcedure
		.errors(routerErrors)
		.input(userIdSchema.extend({ password: passwordSchema }))
		.handler(async ({ errors, input }) => {
			const user = await getUserById(input.id);
			if (user === null) {
				throw errors.NOT_FOUND({ message: "账号不存在" });
			}
			// 任何模式下都拒绝（plan 021 §2 第 12 项）：Casdoor 账号不能用本地密码登录。
			if (isManagedByCasdoor(user)) {
				throw errors.FORBIDDEN({ message: CASDOOR_NO_LOCAL_PASSWORD_MESSAGE });
			}
			// 管理员知道这个密码，所以用户下次登录后必须自己修改。
			await updateUserPasswordHash(
				user.id,
				await hashPassword(input.password),
				true
			);
			return { id: user.id };
		}),
	setDisabled: adminProcedure
		.errors(routerErrors)
		.input(userIdSchema.extend({ disabled: z.boolean() }))
		.handler(async ({ context, errors, input }) => {
			const user = await getUserById(input.id);
			if (user === null) {
				throw errors.NOT_FOUND({ message: "账号不存在" });
			}
			if (isManagedByCasdoor(user)) {
				throw errors.FORBIDDEN({ message: CASDOOR_MANAGED_USER_MESSAGE });
			}
			if (input.disabled && user.id === context.user.id) {
				throw errors.BAD_REQUEST({ message: "不能停用自己的账号" });
			}
			if (input.disabled && (await isLastLocalAdmin(user))) {
				throw errors.CONFLICT({ message: "不能停用最后一个平台管理员" });
			}
			const updated = await setUserDisabled(user.id, input.disabled);
			if (updated === null) {
				throw errors.NOT_FOUND({ message: "账号不存在" });
			}
			return toPublicUser(updated);
		}),
	setRole: adminProcedure
		.errors(routerErrors)
		.input(userIdSchema.extend({ role: roleSchema }))
		.handler(async ({ context, errors, input }) => {
			const user = await getUserById(input.id);
			if (user === null) {
				throw errors.NOT_FOUND({ message: "账号不存在" });
			}
			if (isManagedByCasdoor(user)) {
				throw errors.FORBIDDEN({ message: CASDOOR_MANAGED_USER_MESSAGE });
			}
			if (input.role !== "admin" && user.id === context.user.id) {
				throw errors.BAD_REQUEST({ message: "不能取消自己的平台管理员身份" });
			}
			if (input.role !== "admin" && (await isLastLocalAdmin(user))) {
				throw errors.CONFLICT({ message: "不能降级最后一个平台管理员" });
			}
			const updated = await updateUserRole(user.id, input.role);
			if (updated === null) {
				throw errors.NOT_FOUND({ message: "账号不存在" });
			}
			return toPublicUser(updated);
		}),
};
