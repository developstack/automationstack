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

const DECOY_HASH =
	"pbkdf2_sha256$600000$LKdUtr/BOB3WfkBHwScmTA==$IxU7PLMzoWj+YBo4tw7g2ZgkA7NoMq0m4SsNeRE5k2Y=";

export const authRouter = {
	login: publicProcedure
		.errors({ TOO_MANY_REQUESTS: {}, UNAUTHORIZED: {} })
		.input(loginSchema)
		.handler(async ({ context, errors, input }) => {
			const username = input.username.trim();
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
	me: publicProcedure.handler(({ context }) =>
		context.user === null ? null : toPublicUser(context.user)
	),
};
