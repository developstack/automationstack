/**
 * 一个 markdown 字段：未聚焦时是普通 <textarea>，聚焦后原地换成 CodeMirror。
 *
 * 为什么不是「一直挂着编辑器」：一个用例可以有 20 个步骤，每步 `step` 与
 * `expected` 两个字段 = 同屏 40 个编辑器实例。按聚焦挂载后同屏永远只有一个活实例，
 * 其余 39 个是浏览器原生 textarea。
 *
 * 顺带解决三件事：
 * - SSR：服务端渲染出来的就是 textarea，CodeMirror 只走动态 import + ClientOnly，
 *   不会在 import 期碰 `window`（这条路由是会 SSR 的，不像脑图那条 ssr:false）。
 * - 存量数据：未聚焦态用 textarea 逐字符显示，`- 点击登录`、`user_id`、`3 * 4`
 *   这些既有纯文本一个字符都不会被 markdown 解析吃掉。
 * - 降级：编辑器 chunk 加载失败时 textarea 仍然是可用的输入框。
 *
 * 代价是多一次焦点交接，交接期间的 focusout 竞态见下方 useFocusOut 的注释。
 */
import { Label } from "@automationstack/ui/components/label";
import { Textarea } from "@automationstack/ui/components/textarea";
import { ClientOnly } from "@tanstack/react-router";
import {
	type ChangeEvent,
	lazy,
	type FocusEvent as ReactFocusEvent,
	type MouseEvent as ReactMouseEvent,
	Suspense,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";

const LazyMarkdownCodeEditor = lazy(async () => {
	const editorModule = await import("@/components/cases/markdown-code-editor");
	return { default: editorModule.MarkdownCodeEditor };
});

let chunkRequested = false;

/**
 * 字段一挂载就把编辑器 chunk 预取下来。等到用户点进输入框才开始下载的话，
 * 中间那一帧会看到 Suspense 兜底、焦点也会掉；预取后聚焦切换是同步的。
 */
function preloadEditorChunk() {
	if (chunkRequested) {
		return;
	}
	chunkRequested = true;
	import("@/components/cases/markdown-code-editor").catch(() => {
		// 预取失败无所谓：真正聚焦时 lazy() 会自己再试一次。
		chunkRequested = false;
	});
}

/** 编辑器就位前的占位：与编辑器同样的外框，避免高度塌陷。 */
const EDITOR_FALLBACK = (
	<div className="min-h-16 w-full rounded-md border border-input" />
);

const TEXTAREA_CLASS = "text-sm leading-relaxed";

interface MarkdownFieldControlProps {
	/** 编辑区的可访问名；有可见 <Label> 时必须与其文案一致。 */
	ariaLabel: string;
	/** 未聚焦态 textarea 的 id，供可见 <Label htmlFor> 关联。 */
	id?: string;
	onChange: (value: string) => void;
	placeholder: string;
	value: string;
}

interface MarkdownFieldProps extends MarkdownFieldControlProps {
	/** 传了就在字段上方渲染可见标签；文案必须与 ariaLabel 一致。 */
	label?: string;
}

/**
 * 焦点离开整个字段（含工具条）时退回未聚焦态。
 *
 * 交接竞态：mode 置为 "editing" 后 React 会把**正持有焦点的** textarea 从 DOM 摘掉，
 * 焦点要等编辑器挂好、`editor.focus()` 跑完才补回来。这中间浏览器会为被摘掉的
 * textarea 派发一次 focusout，且 `relatedTarget` 为 null（Chrome 实测如此，
 * 各家行为并不一致）。照字面处理就会立刻退回 textarea，编辑器永远进不去。
 * 所以 relatedTarget 为 null 时不当场下结论，等交接跑完再看焦点落在哪：
 * 只要焦点回到了本字段容器里，就当没离开过。
 */
function useFocusOut(container: HTMLDivElement | null, onFocusOut: () => void) {
	useEffect(() => {
		const stillInside = () =>
			container?.contains(document.activeElement) ?? false;
		const handleFocusOut = (event: FocusEvent) => {
			const next = event.relatedTarget;
			// 工具条按钮也在这个容器里，点它们不算离开本字段。
			if (next instanceof Node && container?.contains(next)) {
				return;
			}
			if (next !== null) {
				onFocusOut();
				return;
			}
			requestAnimationFrame(() => {
				if (stillInside()) {
					return;
				}
				// 再等一帧：编辑器 chunk 已预取，但 Suspense 解挂 + effect 落焦
				// 未必赶得上第一帧。
				requestAnimationFrame(() => {
					if (!stillInside()) {
						onFocusOut();
					}
				});
			});
		};
		container?.addEventListener("focusout", handleFocusOut);
		return () => container?.removeEventListener("focusout", handleFocusOut);
	}, [container, onFocusOut]);
}

/**
 * 字段的三态。用状态机而不是「一个 editing 布尔 + 一个抑制标志的 ref」：
 * Esc 退出后要把焦点还给 textarea，而那次 focus() 不能又把编辑器拉起来，
 * 所以「刚按过 Esc」本身就是一个态。
 */
type FieldMode = "editing" | "escaped" | "idle";

/** textarea ⇄ 编辑器的切换状态机。 */
function useFieldActivation() {
	const [mode, setMode] = useState<FieldMode>("idle");
	const caretRef = useRef(0);
	const textareaRef = useRef<HTMLTextAreaElement | null>(null);

	useEffect(() => preloadEditorChunk(), []);

	useEffect(() => {
		if (mode === "escaped") {
			textareaRef.current?.focus();
		}
	}, [mode]);

	const handleFocus = useCallback(
		(event: ReactFocusEvent<HTMLTextAreaElement>) => {
			if (mode === "escaped") {
				return;
			}
			caretRef.current =
				event.target.selectionStart ?? event.target.value.length;
			setMode("editing");
		},
		[mode]
	);

	/**
	 * 按过 Esc 之后焦点还在 textarea 上，再点它不会触发 focus 事件，
	 * 光靠 handleFocus 就再也回不到编辑器了。所以点击也能重新拉起编辑器。
	 */
	const handleClick = useCallback(
		(event: ReactMouseEvent<HTMLTextAreaElement>) => {
			if (mode !== "escaped") {
				return;
			}
			const target = event.currentTarget;
			caretRef.current = target.selectionStart ?? target.value.length;
			setMode("editing");
		},
		[mode]
	);

	const handleFocusOut = useCallback(() => setMode("idle"), []);
	const handleEscape = useCallback(() => setMode("escaped"), []);

	return {
		caretRef,
		editing: mode === "editing",
		handleClick,
		handleEscape,
		handleFocus,
		handleFocusOut,
		textareaRef,
	};
}

/**
 * Esc 的语义分两级：编辑器里按一次退出编辑器、焦点回到本字段（抽屉不动），
 * 焦点已在 textarea 上再按才轮到抽屉自己的关闭逻辑。
 */
function MarkdownFieldControl({
	ariaLabel,
	id,
	onChange,
	placeholder,
	value,
}: MarkdownFieldControlProps) {
	const [container, setContainer] = useState<HTMLDivElement | null>(null);
	const activation = useFieldActivation();
	useFocusOut(container, activation.handleFocusOut);

	const handleTextareaChange = useCallback(
		(event: ChangeEvent<HTMLTextAreaElement>) => onChange(event.target.value),
		[onChange]
	);

	return (
		<div className="flex w-full flex-col" ref={setContainer}>
			{activation.editing ? (
				<ClientOnly fallback={EDITOR_FALLBACK}>
					<Suspense fallback={EDITOR_FALLBACK}>
						<LazyMarkdownCodeEditor
							ariaLabel={ariaLabel}
							initialCaret={activation.caretRef.current}
							onChange={onChange}
							onEscape={activation.handleEscape}
							placeholder={placeholder}
							value={value}
						/>
					</Suspense>
				</ClientOnly>
			) : (
				<Textarea
					aria-label={id === undefined ? ariaLabel : undefined}
					className={TEXTAREA_CLASS}
					id={id}
					onChange={handleTextareaChange}
					onClick={activation.handleClick}
					onFocus={activation.handleFocus}
					placeholder={placeholder}
					ref={activation.textareaRef}
					value={value}
				/>
			)}
		</div>
	);
}

/** 可选的可见标签；字号同 case-form.tsx 的 LABEL_TEXT，编辑区统一 14px。 */
export function MarkdownField({ label, ...control }: MarkdownFieldProps) {
	if (label === undefined) {
		return <MarkdownFieldControl {...control} />;
	}
	return (
		<div className="flex w-full flex-col gap-2">
			<Label className="text-sm" htmlFor={control.id}>
				{label}
			</Label>
			<MarkdownFieldControl {...control} />
		</div>
	);
}
