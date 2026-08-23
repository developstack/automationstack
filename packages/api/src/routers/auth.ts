import { verifyPassword } from "@automationstack/db/password";
import { getUserByUsername } from "@automationstack/db/repositories/users-repository";
import { toPublicUser } from "@automationstack/db/schema/users";
import { env } from "@automationstack/env/server";
import { z } from "zod";

import { createSessionToken, sessionCookieHeader } from "../auth/session";
import { publicProcedure } from "../index";

const loginSchema = z.object({
	password: z.string().min(1),
	username: z.string().min(1),
});

/**
 * 用户名不存在时也照样跑一次 PBKDF2，用的是这枚谁也对不上的诱饵散列。
 * 否则「立刻失败」与「算了 75ms 才失败」的耗时差会把哪些用户名真实存在
 * 泄露出去——账号由管理员创建，用户名就是可枚举的攻击面。
 */
const DECOY_HASH =
	"pbkdf2_sha256$600000$LKdUtr/BOB3WfkBHwScmTA==$IxU7PLMzoWj+YBo4tw7g2ZgkA7NoMq0m4SsNeRE5k2Y=";

export const authRouter = {
	login: publicProcedure
		.errors({ UNAUTHORIZED: {} })
		.input(loginSchema)
		.handler(async ({ context, errors, input }) => {
			const username = input.username.trim();
			const user = await getUserByUsername(username);
			const matched = await verifyPassword(
				input.password,
				user?.passwordHash ?? DECOY_HASH
			);
			// 用户名错、口令错、账号已停用，对外都是同一句话：不给枚举留线索
			if (!(user && matched) || user.disabledAt !== null) {
				throw errors.UNAUTHORIZED({ message: "用户名或密码错误" });
			}
			const token = await createSessionToken(user.id, env.SESSION_SECRET);
			context.cookies.push(sessionCookieHeader(token, context.secure));
			return toPublicUser(user);
		}),
	logout: publicProcedure.handler(({ context }) => {
		context.cookies.push(sessionCookieHeader(null, context.secure));
		return { ok: true };
	}),
	/** 未登录返回 null 而不是报错：前端用它决定渲染登录页还是主界面。 */
	me: publicProcedure.handler(({ context }) =>
		context.user === null ? null : toPublicUser(context.user)
	),
};
