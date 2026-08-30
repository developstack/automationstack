/**
 * MCP 通道的**运行身份**。
 *
 * ## 之前是什么样，为什么必须换掉
 *
 * 这里从前是一个写死的合成用户（uuid `…0001`、role `member`），存在的理由是
 * 「`createRouterClient` 是进程内调用，没有 HTTP 请求也就没有会话 cookie，
 * 得喂饱 `protectedProcedure` 的登录闸门」。项目成员模型落地之后，那个 id
 * 在 `users` 表里没有对应行、在 `project_members` 里更不会有，于是
 * `getProjectRole` 恒为 null，所有挂了 `requireProjectMember` 的过程一律
 * FORBIDDEN——MCP 整条通道是坏的。
 *
 * 两条看着更省事的路都不能走：
 * - 把合成用户提权成平台 admin：`canEnterProject` 对 admin 一律放行，等于
 *   **任何能连上 `/mcp` 的人都拿到了全平台所有项目的读写权**，刚建起来的
 *   授权模型在这条路上整个作废；
 * - 给 MCP 开一条跳过中间件的后门：同样的后果，只是把它藏得更深，而且从此
 *   「授权规则只有一处」这句话不再成立。
 *
 * ## 现在的样子
 *
 * `/mcp` 是 **Streamable HTTP** 端点（`.mcp.json` 里 `"type": "http"`，
 * `apps/server/src/index.ts` 里 `app.all("/mcp", …)`），所以它拿得到请求头——
 * 那正是 ingest 那条通道已经在用的凭据形式。于是规则与 §4.4 完全统一：
 *
 * > **MCP 请求必须携带 `Authorization: Bearer as_xxx`，
 * > 身份与权限 = 该 token 所属用户的身份与权限。**
 *
 * 没带、或 token 不认，`handleMcpRequest` 直接 401，**绝不静默降级**成任何
 * 一种「默认身份」——一个静默的默认身份就是一个谁都不会去看的无限权后门。
 * 也因此这条通道**不需要任何新的 env 配置**：凭据随请求走，服务端没有
 * 「MCP 以谁的身份运行」这个全局状态可配、可配错、或忘了配。
 *
 * ## 这个文件为什么单独存在
 *
 * `server.ts` 那一半要 import `@hono/mcp` 与 oRPC 的 `createRouterClient`，
 * 链路上通向 db 与 env，测试加载不了。这里只做「已认出的 User → oRPC Context」
 * 这一步纯映射，两个 import 都是 `import type`（编译期擦除），所以可单测。
 */

import type { Context } from "@automationstack/api/context";
import type { User } from "@automationstack/db/schema/users";

/**
 * MCP 这条通道的标签页标识。
 *
 * `Actor.clientId` 标识的是**标签页**而不是身份（见 `context.ts`），实时协作
 * 靠它判断「这条失效事件是不是我自己触发的」。固定成一个不可能与真实客户端
 * （每 Tab 一个 uuid）相同的值，于是没有任何在线页面会把 MCP 的写入当成
 * 自己触发的而跳过刷新——与 ingest 的 `automation-ingest` 是同一套做法。
 */
export const MCP_CLIENT_ID = "mcp";

/**
 * 把认出来的 token 主人折成一个 oRPC `Context`。
 *
 * `actor.name` 是**真人的用户名**，不再是从前那个固定的「MCP 迁移」：它会落进
 * 导入用例的 `lastModifiedBy` / `savedBy`，而那一列要回答的是「这批用例是谁
 * 导进来的」。写死一个渠道名等于把所有人的导入记录混成同一个署名，
 * 事后谁都对不上号。渠道信息没有丢——它在 `clientId` 里。
 *
 * `cookies` 恒为空数组：MCP 不会走 `auth.login` / `auth.logout`（那两条不在
 * 任何 MCP 工具的调用面上），没有 `Set-Cookie` 要下发。`secure` 按请求的
 * scheme 给，与 `createContext` 同一句判据。
 */
export function mcpContext(user: User, secure: boolean): Context {
	return {
		actor: { clientId: MCP_CLIENT_ID, name: user.username },
		cookies: [],
		secure,
		user,
	};
}
