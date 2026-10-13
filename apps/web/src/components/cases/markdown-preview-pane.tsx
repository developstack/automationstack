import { useCaseAttachments } from "@/components/cases/case-attachment-context";
import { MarkdownRender } from "@/components/cases/markdown-render";

/** 预览区：虚线边框和浅灰底色，与可以输入的编辑区区分开。颜色都使用令牌，暗色模式下可读。 */
const PANE_CLASS =
	"flex max-h-80 min-w-0 flex-col gap-1.5 overflow-auto rounded-md border border-dashed bg-muted/30 px-2.5 py-2 dark:bg-muted/20";

export function MarkdownPreviewPane({ text }: { text: string }) {
	const { imageUrls } = useCaseAttachments();
	const empty = text.trim() === "";

	return (
		<div className={PANE_CLASS}>
			<span className="eyebrow select-none">预览</span>
			{empty ? (
				<span className="text-muted-foreground text-sm">
					输入的内容会实时显示在这里，粘贴的图片也会出现。
				</span>
			) : (
				<MarkdownRender imageUrls={imageUrls} text={text} />
			)}
		</div>
	);
}
