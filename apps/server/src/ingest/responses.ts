import type { Context } from "hono";

/**
 * ingest 搬运层共用的**应答零件**：状态码、几种固定形状的错误体、请求体解析。
 *
 * 四条端点对同一种失败必须说同一句话——分叉的表现是「同一种发错，几条端点
 * 说几句不一样的话」，而上报方是照着这些字符串写 SDK 的。所以这些东西只有一处。
 * 这里同样**不做任何业务判断**，它只负责把已经定好的结论翻成 HTTP。
 */

export const HTTP_BAD_REQUEST = 400;
export const HTTP_UNAUTHORIZED = 401;
export const HTTP_FORBIDDEN = 403;
export const HTTP_NOT_FOUND = 404;
export const HTTP_PAYLOAD_TOO_LARGE = 413;

/**
 * 401 必须带 `WWW-Authenticate`：这是 401 的语义要求，也是 SDK 的 HTTP 客户端
 * 区分「token 没通过」与「随便一个 4xx」的依据。
 *
 * 只写 `Bearer`、不带 `realm` 或 `error=`：那些参数会把「token 无效」和
 * 「token 过期 / 权限不足」区分开，而 `resolveUserFromBearer` 对外只有
 * 「过了」与「没过」两种结果——多写的参数就是在编造一个服务端并不知道的区别。
 */
const UNAUTHORIZED_HEADERS = { "WWW-Authenticate": "Bearer" } as const;

export function unauthorized(c: Context): Response {
	return c.json(
		{
			error: "unauthorized",
			message: "缺少或无效的 Authorization: Bearer <token>",
		},
		HTTP_UNAUTHORIZED,
		UNAUTHORIZED_HEADERS
	);
}

/**
 * 403，不是 401：token 本身是好的、主人也确实存在，缺的是**这个项目**的成员
 * 资格（§4.4「一枚 token 的权限等于它主人的权限」）。回 401 会让 SDK 的重试
 * 逻辑以为该换一枚 token，而换一百枚也没用——要做的是把主人加进项目。
 * 同理不回 404：那会把「你进不去」说成「项目不存在」，人只会去反复核对
 * `AS_PROJECT` 里那个抄对了的 uuid。取舍与 oRPC 侧的 `requireProjectMember`
 * 逐字一致（`packages/api/src/index.ts`）。
 */
export function forbidden(c: Context): Response {
	return c.json(
		{
			error: "forbidden",
			message: "这枚 token 的主人不是该项目的成员",
		},
		HTTP_FORBIDDEN
	);
}

export function projectNotFound(c: Context): Response {
	return c.json(
		{ error: "project-not-found", message: "projectId 指向的项目不存在" },
		HTTP_NOT_FOUND
	);
}

/** `message` 原样回给上报方：它是字段名级别的说明，正是 SDK 作者要看的东西。 */
export function invalidPayload(c: Context, message: string): Response {
	return c.json({ error: "invalid-payload", message }, HTTP_BAD_REQUEST);
}

/**
 * 请求体解析的类型化结果。三条 POST 路由从前各有一份逐字相同的
 * `text()` + `JSON.parse` + catch → 400，连中文文案都一样；抽在这里是为了让
 * 那句话只有一处，分叉的表现是「同一种发错，三条端点说三句不一样的话」。
 */
type ParsedJsonBody = { body: unknown; kind: "ok" } | { kind: "invalid-json" };

/**
 * 不用 `c.req.json()`：它在体不是合法 JSON 时抛 SyntaxError，会被 Hono 的默认
 * 错误处理翻成 500——上报方明明是自己发错了一段 body，看到的却是「服务器错误」，
 * 只会跑去问平台哪儿挂了。
 *
 * 这里**只接住 `JSON.parse` 这一处**，且只把它折算成一种结果：别的异常
 * （读体失败、handler 里连不上库）照旧抛给 Hono 翻 500，那才是它们的诚实说法。
 */
export function parseJsonBody(rawBody: string): ParsedJsonBody {
	try {
		return { body: JSON.parse(rawBody), kind: "ok" };
	} catch {
		return { kind: "invalid-json" };
	}
}

/**
 * 「你发的东西不是 JSON」。
 *
 * 这一条 400 排在鉴权**之前**，是搬运层绕不开的顺序：不先 parse 就没有 `body`
 * 可交给 handler。它不违反 handler 里「鉴权先于校验」那条理由——那条防的是
 * 「未鉴权的调用方从 400 的字段名里读出请求体长什么样」，而这句话一个字段名
 * 都没透露。
 */
export const INVALID_JSON_MESSAGE =
	"请求体不是合法 JSON（Content-Type 应为 application/json）";

/**
 * 每个 switch 的兜底分支。参数是 `never`，所以只要 handler 那边**新增一种
 * outcome 而这里忘了映射**，就会在编译期报错。
 *
 * 不把它写成「兜底返回 401/400」：搬运层最危险的失误正是把一种新语义悄悄映射成
 * 一个旧状态码——上报方会拿到一句自信但错误的解释。这里抛出去，由 Hono 翻成
 * 500，那才是「服务端漏了一种情况」的诚实说法。运行时不可达。
 */
export function unhandledOutcome(outcome: never): never {
	throw new Error(`未映射的 ingest 结果：${JSON.stringify(outcome)}`);
}
