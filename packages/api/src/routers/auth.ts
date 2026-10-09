import { localPasswordHashOf } from "@automationstack/db/local-login";
import {
	hashPassword,
	MAX_PASSWORD_LENGTH,
	MIN_PASSWORD_LENGTH,
	verifyPassword,
} from "@automationstack/db/password";
import { updateUserPasswordHash } from "@automationstack/db/repositories/users-repository";
import { toPublicUser } from "@automationstack/db/schema/users";
import { env } from "@automationstack/env/server";
import { z } from "zod";

import { loginWithLocalPassword } from "../auth/providers/local-password-login";
import {
	type AuthConfig,
	authConfigOf,
	authProviderFor,
} from "../auth/providers/resolve";
import { createSessionToken, sessionCookieHeader } from "../auth/session";
import { getEffectiveAuthSettings } from "../auth/settings-store";
import { protectedProcedure, publicProcedure } from "../index";
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

const changePasswordSchema = z.object({
	currentPassword: z.string().min(1).max(MAX_PASSWORD_LENGTH),
	newPassword: z.string().min(MIN_PASSWORD_LENGTH).max(MAX_PASSWORD_LENGTH),
});

const LOCAL_LOGIN_DISABLED_MESSAGE = "本地密码登录已关闭，请使用 Casdoor 登录";

export const authRouter = {
	// 当前密码错误时返回 BAD_REQUEST，不返回 UNAUTHORIZED：前端把 UNAUTHORIZED 当作会话过期。
	changePassword: protectedProcedure
		.errors({ BAD_REQUEST: {}, TOO_MANY_REQUESTS: {} })
		.input(changePasswordSchema)
		.handler(async ({ context, errors, input }) => {
			const storedHash = localPasswordHashOf(context.user);
			if (storedHash === null) {
				throw errors.BAD_REQUEST({
					message: "该账号没有本地密码，不能在这里修改密码",
				});
			}
			if (input.newPassword === input.currentPassword) {
				throw errors.BAD_REQUEST({ message: "新密码不能与当前密码相同" });
			}
			const attempt = {
				clientIp: getClientIp(),
				username: context.user.username,
			};
			if (checkLoginGate(attempt).kind === "rejected") {
				throw errors.TOO_MANY_REQUESTS({
					message: TOO_MANY_LOGIN_ATTEMPTS_MESSAGE,
				});
			}
			const verification = await runInVerificationSlot(() =>
				verifyPassword(input.currentPassword, storedHash)
			);
			if (verification.kind === "saturated") {
				throw errors.TOO_MANY_REQUESTS({
					message: TOO_MANY_LOGIN_ATTEMPTS_MESSAGE,
				});
			}
			if (!verification.value) {
				recordLoginFailure(attempt);
				throw errors.BAD_REQUEST({ message: "当前密码错误" });
			}
			recordLoginSuccess(attempt);
			await updateUserPasswordHash(
				context.user.id,
				await hashPassword(input.newPassword),
				false
			);
			return { ok: true };
		}),
	// 认证方式和本地登录的开放范围来自 settings-store：页面保存后立即生效。
	config: publicProcedure.handler(
		async (): Promise<AuthConfig> =>
			authConfigOf(await getEffectiveAuthSettings())
	),
	login: publicProcedure
		.errors({ FORBIDDEN: {}, TOO_MANY_REQUESTS: {}, UNAUTHORIZED: {} })
		.input(loginSchema)
		.handler(async ({ context, errors, input }) => {
			const settings = await getEffectiveAuthSettings();
			const outcome = await loginWithLocalPassword(
				{
					clientIp: getClientIp(),
					password: input.password,
					username: input.username.trim(),
				},
				authProviderFor(settings).localLoginPolicy(settings)
			);
			if (outcome.kind === "disabled") {
				throw errors.FORBIDDEN({ message: LOCAL_LOGIN_DISABLED_MESSAGE });
			}
			if (outcome.kind === "rate-limited") {
				throw errors.TOO_MANY_REQUESTS({
					message: TOO_MANY_LOGIN_ATTEMPTS_MESSAGE,
				});
			}
			if (outcome.kind === "rejected") {
				throw errors.UNAUTHORIZED({ message: "用户名或密码错误" });
			}
			const token = await createSessionToken(
				outcome.user.id,
				env.SESSION_SECRET
			);
			context.cookies.push(sessionCookieHeader(token, context.secure));
			return toPublicUser(outcome.user);
		}),
	logout: publicProcedure.handler(({ context }) => {
		context.cookies.push(sessionCookieHeader(null, context.secure));
		return { ok: true };
	}),
	me: publicProcedure.handler(({ context }) =>
		context.user === null ? null : toPublicUser(context.user)
	),
};
