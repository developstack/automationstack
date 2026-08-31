/**
 * 模块行右键菜单的键盘入口。
 *
 * 行尾的「⋯」按钮撤掉之后，重命名 / 新建子模块 / 删除三个动作只剩右键一条路，
 * 而右键是纯指针动作 —— 不补一条键盘路径，这三个动作对键盘用户就等于消失了。
 *
 * Windows / Linux 上浏览器会在当前聚焦元素上自己派发 `contextmenu`（Menu 键、
 * Shift+F10），但 macOS 的键盘根本没有 Menu 键，Safari / Chrome 也不把
 * Shift+F10 翻译成 `contextmenu`。所以这里自己认这两个按键，再手动派发一个
 * 带坐标的 `contextmenu`，走 Base UI ContextMenuTrigger 自己的 onContextMenu
 * 分支（锚点就是在那里由事件坐标 setAnchor 的，绕过去菜单会锚错位置）。
 *
 * 这个模块只留可单测的纯函数，派发本身在 module-node-row.tsx 里做。
 */

/** Windows / Linux 键盘上的应用程序键；macOS 键盘没有这个键。 */
const CONTEXT_MENU_KEY = "ContextMenu";
const F10_KEY = "F10";

/** 与模块行的 px-2 同档：菜单从行内容的起始处展开，而不是贴着行的外沿。 */
const ROW_GUTTER_PX = 8;

interface ContextMenuKeyEvent {
	key: string;
	shiftKey: boolean;
}

interface RowRect {
	bottom: number;
	left: number;
}

export interface ContextMenuPoint {
	x: number;
	y: number;
}

/** 这次按键是否是「请求上下文菜单」。 */
export function isContextMenuKey(event: ContextMenuKeyEvent): boolean {
	return (
		event.key === CONTEXT_MENU_KEY || (event.key === F10_KEY && event.shiftKey)
	);
}

/**
 * 键盘触发时的锚点坐标。
 *
 * 取行的**下沿**而不是行内某处：ContextMenuContent 默认 side="right"
 * align="start"，锚在行内会让菜单盖住这一行本身。鼠标用户有指针标记着行，
 * 盖住无所谓；键盘用户只能靠这一行的高亮判断菜单属于谁，盖掉就没线索了。
 */
export function contextMenuPointFromRect(rect: RowRect): ContextMenuPoint {
	return { x: rect.left + ROW_GUTTER_PX, y: rect.bottom };
}
