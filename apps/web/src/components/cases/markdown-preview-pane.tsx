/**
 * 活跃 markdown 字段旁边的实时预览。
 *
 * ## 为什么它必须住在字段容器**里面**
 *
 * `markdown-field.tsx` 的 `useFocusOut` 判定「焦点是否还在 `ref={setContainer}`
 * 那个容器内」。预览若渲染成容器外的兄弟节点，焦点在预览里的任何可聚焦元素上
 * 落定时都会被判成离开，整个字段退回未聚焦态、编辑器被销毁。
 *
 * ⚠️ 已知未修：本面板整体不可聚焦，所以点它一下浏览器会把焦点交给 `<body>`
 * （`relatedTarget` 为 null），`useFocusOut` 等两帧后看到焦点不在容器内，
 * 照样会退回未聚焦态。也就是「在预览里选一段文字」目前仍会关掉编辑器。
 * 住在容器里只解决了「预览内有可聚焦元素」那一半，另一半要给本容器一个
 * 焦点落脚点（或在 mousedown 时把焦点按住）才能解决。
 *
 * ## 什么时候挂
 *
 * 由 `MarkdownField` 的 `preview` prop 决定，分两种：
 * - 前置条件独占整行，够宽，聚焦即在编辑器右边分栏显示；
 * - 步骤格两格并排，谁都不能因为聚焦而改变布局，所以预览默认不挂，
 *   只有用户点了行尾那枚「展开预览」按钮才在格子内部往下堆出来。
 *
 * 两种情况都是按需挂：一个用例可以有 20 个步骤 × 2 个字段，常驻预览 =
 * 同屏 40 个 markdown 解析器跟着每次按键重跑，与「同屏只有一个活编辑器实例」
 * 那条设计是同一个理由。
 *
 * ⚠️ 本文件与整条预览链路一样**不许 import 任何 `@codemirror/*`**：
 * `/projects/$projectId` 会 SSR，而 `@codemirror/view` 在 import 期就读 `navigator`。
 */
import { useCaseAttachments } from "@/components/cases/case-attachment-context";
import { MarkdownRender } from "@/components/cases/markdown-render";

/**
 * `min-w-0`：作为 grid 子项它默认是 `min-width: auto`，一段长 URL 或一张宽图
 * 会把整条轨道顶宽，最后把抽屉撑出横向滚动条。归零之后超出的部分由本容器
 * 自己的 `overflow-auto` 消化。
 *
 * `max-h-80`：编辑区可以随内容无限长，预览不行——它只是个参照物，
 * 撑满一屏之后再长就该自己滚，而不是把下面的步骤全推走。
 */
const PANE_CLASS =
	"flex max-h-80 min-w-0 flex-col gap-1 overflow-auto rounded-md border border-input border-dashed bg-muted/30 p-2";

export function MarkdownPreviewPane({ text }: { text: string }) {
	const { imageUrls } = useCaseAttachments();
	const empty = text.trim() === "";

	return (
		<div className={PANE_CLASS}>
			<span className="select-none text-muted-foreground text-xs">预览</span>
			{empty ? (
				<span className="text-muted-foreground text-sm">
					左侧输入的内容会实时显示在这里，粘贴图片也会直接出现。
				</span>
			) : (
				<MarkdownRender imageUrls={imageUrls} text={text} />
			)}
		</div>
	);
}
