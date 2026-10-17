import { canAdministerProject, type ProjectAccess } from "./project-access";

export interface RunViewer extends ProjectAccess {
	userId: string;
}

/**
 * 测试任务的创建者、项目 owner 和平台管理员可以作废测试任务。服务端和 web 共用这条规则。
 * 创建者的账号被删除后（createdBy 为 null），只有项目 owner 和平台管理员可以作废。
 */
export function canVoidTestRun(
	viewer: RunViewer,
	createdBy: string | null
): boolean {
	return createdBy === viewer.userId || canAdministerProject(viewer);
}
