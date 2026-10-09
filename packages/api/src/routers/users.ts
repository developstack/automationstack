import {
	hashPassword,
	MAX_PASSWORD_LENGTH,
	MIN_PASSWORD_LENGTH,
} from "@automationstack/db/password";
import {
	countActiveAdmins,
	createUser,
	getUserById,
	listUsers,
	listUsersWithProjects,
	setUserDisabled,
	updateUserPasswordHash,
	updateUserRole,
} from "@automationstack/db/repositories/users-repository";
import { toPublicUser, type User } from "@automationstack/db/schema/users";
import { z } from "zod";

import { adminProcedure } from "../index";

const MIN_USERNAME_LENGTH = 2;
const MAX_USERNAME_LENGTH = 32;
const USERNAME_PATTERN = /^\S+$/;

const roleSchema = z.enum(["admin", "member"]);

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
	NOT_FOUND: {},
} as const;

async function isLastActiveAdmin(target: User): Promise<boolean> {
	if (target.role !== "admin" || target.disabledAt !== null) {
		return false;
	}
	return (await countActiveAdmins()) <= 1;
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
			if (input.disabled && user.id === context.user.id) {
				throw errors.BAD_REQUEST({ message: "不能停用自己的账号" });
			}
			if (input.disabled && (await isLastActiveAdmin(user))) {
				throw errors.CONFLICT({ message: "不能停用最后一个管理员" });
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
			if (input.role !== "admin" && user.id === context.user.id) {
				throw errors.BAD_REQUEST({ message: "不能取消自己的管理员身份" });
			}
			if (input.role !== "admin" && (await isLastActiveAdmin(user))) {
				throw errors.CONFLICT({ message: "不能降级最后一个管理员" });
			}
			const updated = await updateUserRole(user.id, input.role);
			if (updated === null) {
				throw errors.NOT_FOUND({ message: "账号不存在" });
			}
			return toPublicUser(updated);
		}),
};
