/**
 * 「当前是不是用例管理这一段」——项目内导航与二级面板共用的唯一判据。
 *
 * 为什么不能像其它一级菜单项那样按前缀算：用例管理的落点就是项目根路径
 * `/projects/<id>` 本身，而概览、测试任务全长在它下面。前缀匹配会让四个一级
 * 菜单项在任何项目内页面上同时高亮，等于没有高亮。
 *
 * 所以这一段只认两种路径：项目根路径本身（尾斜杠算同一处——路由器规范化前、
 * 手敲的地址、外部粘进来的链接都可能带着它），以及脑图页。脑图是同一批用例的
 * 另一种视图，不是第五个去处，跟着用例管理一起亮才对。
 * 脑图按后缀认，与 routes/projects/$projectId/route.tsx 里 `viewFor` 的取法
 * 保持一致——同一条路径在两处被判成两回事是最难查的那类 bug。
 *
 * 单独成一个不 import React 的文件：project-nav-group（菜单高亮）、
 * project-shell（挂不挂二级面板）、project-shell-skeleton（加载态）三处共用它。
 * 各写一份迟早会分叉，而加载态与就绪态一旦分叉就是肉眼可见的跳动。
 */

const MINDMAP_PATH_SUFFIX = "/mindmap";

export function isCaseSectionPathname(
	pathname: string,
	projectId: string
): boolean {
	if (pathname.endsWith(MINDMAP_PATH_SUFFIX)) {
		return true;
	}
	const projectRoot = `/projects/${projectId}`;
	return pathname === projectRoot || pathname === `${projectRoot}/`;
}
