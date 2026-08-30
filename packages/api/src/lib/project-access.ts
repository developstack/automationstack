/**
 * 项目级授权的**全部**判定规则，写成纯函数放在一处。
 *
 * 为什么不直接写在中间件与 handler 里：这是本仓库第一份授权逻辑，而授权
 * 逻辑出错的方式是「多放行了一个人」——那既不会抛异常也不会让类型检查变红，
 * 只有测试能抓。这个文件不 import 任何 db 运行时、不 import orpc，
 * 于是 `project-access.test.ts` 能把三条规则逐一钉死，不连库也不起服务。
 * 同类先例：`packages/db/src/repositories/*-core.ts`。
 *
 * 三条规则，一句话版本：
 * 1. 平台 admin 在项目级授权上一律放行；
 * 2. 项目内 `owner` 能改项目、删项目、管成员；`member` 只能进来干活；
 * 3. 不是成员就进不去（平台 admin 除外）。
 */

import type { ProjectRole } from "@automationstack/db/schema/project-members";
import type { UserRole } from "@automationstack/db/schema/users";

export interface ProjectAccess {
	/** 调用者的**平台**角色（`users.role`），与项目无关。 */
	platformRole: UserRole;
	/** 调用者在这个项目里的角色；`null` = 不是成员。 */
	projectRole: ProjectRole | null;
}

/**
 * 平台 admin 一律放行。
 *
 * 不是「顺手给的特权」：admin 本来就能创建 / 停用 / 重置任何人的账号
 * （`routers/users.ts`），也就能把自己加进任何项目再看。再拦他一道只是把
 * 同一件事绕远路，却让「最后一个 owner 被移除后项目锁死」变成无人能救。
 */
function isPlatformAdmin(access: ProjectAccess): boolean {
	return access.platformRole === "admin";
}

/** 能不能看见 / 进入这个项目。项目作用域的过程一律先过这一关。 */
export function canEnterProject(access: ProjectAccess): boolean {
	return isPlatformAdmin(access) || access.projectRole !== null;
}

/**
 * 能不能改项目名、删项目、增删改成员。
 *
 * 这三件事捆在一个谓词里是有意的：它们的共同点是「后果落在别人头上」——
 * 删项目会连同所有人的用例与测试报告一起消失，改成员名单决定别人还进不进得
 * 来。项目内的日常读写（用例、模块、任务）不在此列，那是 `member` 的本职。
 */
export function canAdministerProject(access: ProjectAccess): boolean {
	return isPlatformAdmin(access) || access.projectRole === "owner";
}

/**
 * 项目列表要不要不加过滤地全给。
 *
 * 只看平台角色：这条判定发生在还不知道是哪个项目的时候（`projects.list`
 * 没有 projectId），所以它不吃 `ProjectAccess`。
 */
export function seesAllProjects(platformRole: UserRole): boolean {
	return platformRole === "admin";
}
