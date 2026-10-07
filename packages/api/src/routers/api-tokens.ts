import {
	createApiToken,
	listApiTokensByUser,
	revokeApiToken,
} from "@automationstack/db/repositories/api-tokens-repository";
import { z } from "zod";

import { protectedProcedure } from "../index";

const MAX_TOKEN_NAME_LENGTH = 50;

const tokenNameSchema = z.string().trim().min(1).max(MAX_TOKEN_NAME_LENGTH);

const tokenIdSchema = z.object({ id: z.uuid() });

const routerErrors = {
	NOT_FOUND: {},
} as const;

export const apiTokensRouter = {
	create: protectedProcedure
		.input(z.object({ name: tokenNameSchema }))
		.handler(({ context, input }) =>
			createApiToken({ name: input.name, userId: context.user.id })
		),
	list: protectedProcedure.handler(({ context }) =>
		listApiTokensByUser(context.user.id)
	),
	revoke: protectedProcedure
		.errors(routerErrors)
		.input(tokenIdSchema)
		.handler(async ({ context, errors, input }) => {
			const result = await revokeApiToken({
				id: input.id,
				userId: context.user.id,
			});
			if (result.kind === "not-found") {
				throw errors.NOT_FOUND({ message: "token 不存在或已吊销" });
			}
			return { token: result.token };
		}),
};
