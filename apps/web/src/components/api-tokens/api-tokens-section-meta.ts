/**
 * 「API Token」这一格的标题块文案与标题 id。原写在 api-tokens-page.tsx 顶部，
 * 就绪态与加载态拆成两个文件之后放到这里，两边引同一份。
 */

/*
 * 与就绪态共用同一个 headingId：两态是路由的 pendingComponent 与 component，
 * 永远不会同时在树上，id 不会撞；而它们若各给一个 id，切换那一帧 h2 的身份会
 * 换掉，读屏会把同一段标题重念一遍。
 */
export const HEADING_ID = "settings-api-tokens-heading";
export const SECTION_TITLE = "API Token";
export const SECTION_DESCRIPTION =
	"给自动化脚本用的个人凭据：脚本拿它以你的身份回传测试结果。明文只在创建时显示一次。";
