import { z } from "zod";

/** 空字符串和 null 都表示「不设置」，保存为 null。 */
export const optionalText = (max: number) =>
	z
		.string()
		.trim()
		.max(max)
		.nullable()
		.transform((value) => (value === "" ? null : value));

/** 密钥字段的三种更新：保留原值、设置新值、清空。前端不会收到密钥的值。 */
export const secretUpdateSchema = (value: z.ZodString) =>
	z.discriminatedUnion("kind", [
		z.object({ kind: z.literal("keep") }),
		z.object({ kind: z.literal("clear") }),
		z.object({ kind: z.literal("set"), value }),
	]);

export type SecretUpdate = z.infer<ReturnType<typeof secretUpdateSchema>>;
