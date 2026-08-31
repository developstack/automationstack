import { hashPassword } from "@automationstack/db/password";
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

const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 128;
const MIN_USERNAME_LENGTH = 2;
const MAX_USERNAME_LENGTH = 32;
/** 用户名不留空白：它要出现在侧边栏和用例的署名里，两侧空格会看不出来。 */
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

/**
 * 拦「把最后一个在用的管理员降级或停用」。真发生了就没人能再进成员管理，
 * 只能连数据库手改，所以宁可在这里报错。
 */
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
	/**
	 * 平台用户管理页那张平铺表：一人一行，「所属项目」是数组。
	 *
	 * 与 `list` 并存而不是取代它：`list` 是「账号名单」，几乎所有地方要的都是
	 * 那一份，这条要多跑一次跨表 join，只有那一个页面用得上。
	 *
	 * 增删项目成员关系不在这里，走 `projectMembers` 的 add / remove / updateRole
	 * 逐项目调用（平台 admin 天然过 `canAdministerProject`）。不另开跨项目的批量
	 * 端点，是为了不绕过那边「不能移除最后一个 owner」的护栏。
	 */
	listWithProjects: adminProcedure.handler(() => listUsersWithProjects()),
	resetPassword: adminProcedure
		.errors(routerErrors)
		.input(userIdSchema.extend({ password: passwordSchema }))
		.handler(async ({ errors, input }) => {
			const user = await getUserById(input.id);
			if (user === null) {
				throw errors.NOT_FOUND({ message: "账号不存在" });
			}
			// 无状态会话没法逐个吊销：改密码不会把该用户已登录的标签页踢下线
			await updateUserPasswordHash(user.id, await hashPassword(input.password));
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
