/**
 * 个人 API Token 的管理接口（plan §4.1 / §4.2）。
 *
 * 三个 handler 全用 `protectedProcedure` 而不是 `adminProcedure`：token 是
 * **个人**凭据，每个人管自己的那几枚，管理员并不比谁更该插手别人的凭据。
 *
 * `userId` 一律取自 `context.user.id`，绝不从输入里收——收了就等于把
 * 「我能吊销别人的 token」做成了一个参数。
 *
 * 也不发 `publishInvalidate`：token 不跨用户共享，没有第二个人的界面需要
 * 因为这次写入而失效，跟 projects 那种项目级资源不是一回事。
 */

import {
	createApiToken,
	listApiTokensByUser,
	revokeApiToken,
} from "@automationstack/db/repositories/api-tokens-repository";
import { z } from "zod";

import { protectedProcedure } from "../index";

/** 备注名只是给人认的（「我的 MacBook」），不参与任何寻址，50 字绰绰有余。 */
const MAX_TOKEN_NAME_LENGTH = 50;

const tokenNameSchema = z.string().trim().min(1).max(MAX_TOKEN_NAME_LENGTH);

const tokenIdSchema = z.object({ id: z.uuid() });

const routerErrors = {
	NOT_FOUND: {},
} as const;

export const apiTokensRouter = {
	/**
	 * 创建的返回值里的 `plaintext` 是**这辈子唯一一次**明文离开服务端。
	 *
	 * 库里只有 SHA-256，所以刻意没有任何「重新查看 token」的接口——不是漏做，
	 * 是做不到，也不想做到：能重新查看就意味着平台留着一份可还原的凭据，
	 * 那正是 §4.2 拒绝走 `secret-box.ts` 那条路的理由。用户弄丢了就吊销重发。
	 */
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
				// 消息刻意不区分「不是你的」和「不存在」：区分了就等于回答
				// 「这个 id 存在，只是不归你」，那本身就是一次信息泄露。
				throw errors.NOT_FOUND({ message: "token 不存在或已吊销" });
			}
			return { token: result.token };
		}),
};
