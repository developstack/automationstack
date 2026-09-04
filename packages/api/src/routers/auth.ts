import { verifyPassword } from "@automationstack/db/password";
import { getUserByUsername } from "@automationstack/db/repositories/users-repository";
import { toPublicUser } from "@automationstack/db/schema/users";
import { env } from "@automationstack/env/server";
import { z } from "zod";

import { createSessionToken, sessionCookieHeader } from "../auth/session";
import { publicProcedure } from "../index";
import {
	checkLoginGate,
	recordLoginFailure,
	recordLoginSuccess,
	runInVerificationSlot,
	TOO_MANY_LOGIN_ATTEMPTS_MESSAGE,
} from "../lib/login-rate-limit";
import { getClientIp } from "../lib/request-client-ip";

const loginSchema = z.object({
	password: z.string().min(1),
	username: z.string().min(1),
});

/**
 * 用户名不存在时也照样跑一次 PBKDF2，用的是这枚谁也对不上的诱饵散列。
 * 否则「立刻失败」与「算了 75ms 才失败」的耗时差会把哪些用户名真实存在
 * 泄露出去——账号由管理员创建，用户名就是可枚举的攻击面。
 *
 * 它的副作用（把「跑一次 KDF」的触发条件放大到任意字符串）由
 * `lib/login-rate-limit.ts` 的三道闸接住，而不是靠去掉这枚诱饵散列。
 */
const DECOY_HASH =
	"pbkdf2_sha256$600000$LKdUtr/BOB3WfkBHwScmTA==$IxU7PLMzoWj+YBo4tw7g2ZgkA7NoMq0m4SsNeRE5k2Y=";

export const authRouter = {
	/**
	 * 限流的三道闸全部排在**读库与 PBKDF2 之前**，这个顺序是整条修复的关键：
	 * 闸门若放在校验之后，爆破那条路是堵上了，但「每个请求白跑一次 600k 次
	 * 迭代」的 DoS 一分不少。阈值与取舍见 `lib/login-rate-limit.ts`。
	 */
	login: publicProcedure
		.errors({ TOO_MANY_REQUESTS: {}, UNAUTHORIZED: {} })
		.input(loginSchema)
		.handler(async ({ context, errors, input }) => {
			const username = input.username.trim();
			// 地址取的是 socket 层对端地址，不是 X-Forwarded-For：见 index.ts 的注释。
			const attempt = { clientIp: getClientIp(), username };
			if (checkLoginGate(attempt).kind === "rejected") {
				throw errors.TOO_MANY_REQUESTS({
					message: TOO_MANY_LOGIN_ATTEMPTS_MESSAGE,
				});
			}
			const user = await getUserByUsername(username);
			const verification = await runInVerificationSlot(() =>
				verifyPassword(input.password, user?.passwordHash ?? DECOY_HASH)
			);
			if (verification.kind === "saturated") {
				throw errors.TOO_MANY_REQUESTS({
					message: TOO_MANY_LOGIN_ATTEMPTS_MESSAGE,
				});
			}
			// 用户名错、口令错、账号已停用，对外都是同一句话：不给枚举留线索
			if (!(user && verification.value) || user.disabledAt !== null) {
				recordLoginFailure(attempt);
				throw errors.UNAUTHORIZED({ message: "用户名或密码错误" });
			}
			recordLoginSuccess(attempt);
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
