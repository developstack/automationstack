/** 脑图页面的内容区：提示在上，画布面板占满剩余高度。骨架屏使用同一个布局。 */
export const MINDMAP_BODY_CLASS = "flex h-full min-h-0 flex-col gap-3";

/** 画布所在的面板。底色比内容区深一级，主节点的卡片因此可以看清。 */
export const MINDMAP_PANEL_CLASS =
	"relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border bg-background";

/** 页面的外框：与用例列表相同的内边距和间距，画布不滚动页面。 */
export const MINDMAP_PAGE_CLASS = "flex h-full min-h-0 flex-col gap-4 p-4";
