/**
 * 个人 API Token 的鉴权入口（plan §4.3 / §4.4）。
 *
 * `resolveUserFromBearer` 是 `context.ts:resolveUserFromCookies` 的镜像：
 * 同样是「一枚凭据 → 一个用户或 null」，同样每次请求都重新读一遍 users 行，
 * 同样把「账号已停用」折算成 `null`。两者共用最后那一句判据不是巧合——
 * 停用一个账号必须连带其全部 token 立即失效，如果这里另写一套判据，
 * 两套迟早分叉，而分叉的表现是停用的账号还能用 token 上报，没有任何地方报错。
 *
 * ## 权限边界（§4.4）
 *
 * token 的权限**严格等于其主人**，不放大也不缩小。本期不做 scope
 * （只读 / 只写 / 限某项目）：没有真实需求，加了就是三家 SDK 都要多传一个
 * 谁也不理解的参数。
 *
 * 那么「token 拿不到删项目的能力」靠什么保证？靠的是**那些能力压根不在这条
 * 路由上**——ingest 端点只暴露上报所需的那几个操作（§5.1）。
 *
 * 所以这个函数**刻意不接进 `createContext`**。`createContext` 是所有 oRPC
 * 路由共用的那一条，把 Bearer 折进去，一枚 token 就拿到了整个 `/rpc` 面
 * （删项目、改成员、跑 AI），§4.4 的边界当场失效——而且失效得毫无声响。
 * 它是个独立函数，由 ingest 那个裸 HTTP 端点自己调。
 *
 * 纯解析那一半在 `./bearer-token`，那边写了为什么必须分开两个文件。
 * 这里刻意不把它再 re-export 一遍：仓库里没有任何一处这么做过，
 * 而一个名字有两条 import 路径，日后就会有两半代码各走各的。
 */

import { hashApiToken } from "@automationstack/db/api-token";
import {
	findActiveApiTokenByHash,
	touchApiTokenLastUsed,
} from "@automationstack/db/repositories/api-tokens-repository";
import { getUserById } from "@automationstack/db/repositories/users-repository";
import type { User } from "@automationstack/db/schema/users";

import { parseBearerToken } from "./bearer-token";

/**
 * 按 `Authorization: Bearer as_xxx` 解析出当前用户；任何一步不成立都返回 null。
 *
 * 校验顺序即 §4.3：形状 → SHA-256 → 查未吊销的 token → 读 users → 判停用。
 * `findActiveApiTokenByHash` 自带 `revoked_at IS NULL`，这里不再判一次：
 * 吊销的过滤只留那一个入口，多写一处就多一处哪天被漏掉的机会。
 */
export async function resolveUserFromBearer(
	header: string | null | undefined
): Promise<User | null> {
	const plaintext = parseBearerToken(header);
	if (plaintext === null) {
		return null;
	}
	const token = await findActiveApiTokenByHash(await hashApiToken(plaintext));
	if (token === null) {
		return null;
	}
	const user = await getUserById(token.userId);
	// 与 resolveUserFromCookies 的最后一句逐字同构，见文件头。
	if (user === null || user.disabledAt !== null) {
		return null;
	}
	// 认证已经成立，剩下这一笔是审计信息：写丢一次不影响任何判断，
	// 但一次数据库抖动把上报打成 401 就是事故。所以吞掉失败，只留一行日志。
	// 节流已经做在 repository 的 SQL 谓词里，这里不再加任何进程内缓存
	// （多实例部署下进程内缓存各算各的，窗口形同虚设，还无界增长）。
	touchApiTokenLastUsed(token.id).catch((error: unknown) => {
		console.error("更新 API Token 的 lastUsedAt 失败", error);
	});
	return user;
}
