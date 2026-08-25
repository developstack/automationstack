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
 * 代价是多一次焦点交接，交接期间的 focusout 竞态见 markdown-field-focus.ts。
 *
 * 布局与焦点是**两条独立的线**：聚焦只换输入控件（textarea ⇄ 编辑器），
 * 绝不改变容器的宽度或位置；预览开不开由 `preview` prop 说了算，见那条注释。
 */
import { Label } from "@automationstack/ui/components/label";
import { Textarea } from "@automationstack/ui/components/textarea";
import { ClientOnly } from "@tanstack/react-router";
import { type ChangeEvent, lazy, Suspense, useCallback, useState } from "react";
import { useFocusOut } from "@/components/cases/markdown-field-focus";
import { MarkdownPreviewPane } from "@/components/cases/markdown-preview-pane";
import {
	type FieldActivation,
	useFieldActivation,
} from "@/components/cases/use-markdown-field-activation";
import {
	type MarkdownFieldPaste,
	useMarkdownFieldPaste,
} from "@/components/cases/use-markdown-field-paste";

const LazyMarkdownCodeEditor = lazy(async () => {
	const editorModule = await import("@/components/cases/markdown-code-editor");
	return { default: editorModule.MarkdownCodeEditor };
});

/** 编辑器就位前的占位：与编辑器同样的外框，避免高度塌陷。 */
const EDITOR_FALLBACK = (
	<div className="min-h-16 w-full rounded-md border border-input" />
);

const TEXTAREA_CLASS = "text-sm leading-relaxed";

/** 不显示预览时的形态：输入框独占容器，与未聚焦态同宽同位。 */
const PLAIN_CLASS = "flex w-full min-w-0 flex-col";

/**
 * 左右分栏：左边编辑区、右边实时预览。只给独占整行（~1200px）的字段用。
 * 窄屏（<640px）回落成单列——那时整个内容区只有 288px，切两栏每边 138px，
 * markdown 一行放不下几个字。
 */
const SPLIT_CLASS = "grid grid-cols-1 items-start gap-3 sm:grid-cols-2";

/**
 * 上下堆叠：预览在编辑区下方，占满整个格子宽度。
 * 步骤格再宽也只有 ~590px，左右分栏每边不到 300px 根本读不了。
 */
const STACK_CLASS = "flex w-full min-w-0 flex-col gap-3";

/**
 * 预览可见时用哪种形态。分栏与堆叠的差别由 `preview` 是否受控一并决定，
 * 因为这两件事本来就是同一个决策的两面：受控的是步骤格（窄，堆叠），
 * 不受控的是前置条件（独占整行，分栏）。
 */
function layoutClass(preview: boolean | undefined, visible: boolean): string {
	if (!visible) {
		return PLAIN_CLASS;
	}
	return preview === undefined ? SPLIT_CLASS : STACK_CLASS;
}

interface MarkdownFieldControlProps {
	/** 编辑区的可访问名；有可见 <Label> 时必须与其文案一致。 */
	ariaLabel: string;
	/** 未聚焦态 textarea 的 id，供可见 <Label htmlFor> 关联。 */
	id?: string;
	onChange: (value: string) => void;
	placeholder: string;
	/**
	 * 预览是否显示。省略 = 跟随聚焦（前置条件：独占整行，聚焦即左右分栏预览）。
	 *
	 * 步骤格必须显式传：它旁边并排站着另一个字段，预览一旦跟着聚焦冒出来，
	 * 布局就由焦点驱动了——点「预期结果」会让「步骤」失焦、整行重排，两格当场
	 * 互换位置，用户看到的是「点了没反应」。所以步骤格传行上「展开」按钮的状态，
	 * 用户不点就永远是两个并排输入框，聚焦/失焦一个像素都不动。
	 */
	preview?: boolean;
	value: string;
}

interface MarkdownFieldProps extends MarkdownFieldControlProps {
	/** 传了就在字段上方渲染可见标签；文案必须与 ariaLabel 一致。 */
	label?: string;
}

interface MarkdownFieldInputProps {
	activation: FieldActivation;
	ariaLabel: string;
	id?: string;
	/** 交给编辑器的写回口；textarea 那一路走 onTextareaChange。 */
	onChange: (value: string) => void;
	onTextareaChange: (event: ChangeEvent<HTMLTextAreaElement>) => void;
	paste: MarkdownFieldPaste;
	placeholder: string;
	value: string;
}

/**
 * 输入控件本体：编辑器 ⇄ textarea 的那次切换。
 *
 * ⚠️ 必须定义在**模块顶层**。写成 <MarkdownFieldControl> 里的内嵌组件，
 * 每次重渲都是一个新的函数引用，React 会把它当成另一种元素整棵拆掉重建——
 * 打字触发的每一次重渲都会销毁 CodeMirror 再新建一个，焦点和光标当场就没了。
 *
 * 它自己是一个**类型固定**的元素，容器那层因此可以随预览开关自由改 className、
 * 加减后面那个兄弟节点，都不会碰到这棵子树（理由见 <MarkdownFieldControl>
 * 返回值上方那段注释）。
 */
function MarkdownFieldInput({
	activation,
	ariaLabel,
	id,
	onChange,
	onTextareaChange,
	paste,
	placeholder,
	value,
}: MarkdownFieldInputProps) {
	if (activation.editing) {
		return (
			<ClientOnly fallback={EDITOR_FALLBACK}>
				<Suspense fallback={EDITOR_FALLBACK}>
					<LazyMarkdownCodeEditor
						ariaLabel={ariaLabel}
						initialCaret={activation.caretRef.current}
						onChange={onChange}
						onEscape={activation.handleEscape}
						onPasteFiles={paste.handlePasteFiles}
						onView={paste.setView}
						placeholder={placeholder}
						value={value}
					/>
				</Suspense>
			</ClientOnly>
		);
	}
	return (
		<Textarea
			aria-label={id === undefined ? ariaLabel : undefined}
			className={TEXTAREA_CLASS}
			id={id}
			onChange={onTextareaChange}
			onClick={activation.handleClick}
			onFocus={activation.handleFocus}
			onPaste={paste.handleTextareaPaste}
			placeholder={placeholder}
			ref={activation.textareaRef}
			value={value}
		/>
	);
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
	preview,
	value,
}: MarkdownFieldControlProps) {
	const [container, setContainer] = useState<HTMLDivElement | null>(null);
	const activation = useFieldActivation();
	useFocusOut(container, activation.handleFocusOut);
	const paste = useMarkdownFieldPaste({
		onChange,
		textareaRef: activation.textareaRef,
		value,
	});

	const handleTextareaChange = useCallback(
		(event: ChangeEvent<HTMLTextAreaElement>) => onChange(event.target.value),
		[onChange]
	);

	const previewVisible = preview ?? activation.editing;

	return (
		/*
		 * 容器本身既是 useFocusOut 的观察范围，也是「编辑区 + 预览」的排版容器：
		 * 预览必须是这个容器的**子节点**而不是兄弟，否则点一下预览（选中一段文字）
		 * 就会被判成焦点离开，整个字段退回未聚焦态。
		 *
		 * 预览的开关只改这个 div 的 className、并在编辑区**后面**加/减一个兄弟节点，
		 * 编辑区自己在 children 里的位置和元素类型都不变——React 因此不会重建那棵
		 * 子树，CodeMirror 实例、焦点和光标位置全都留在原地。
		 */
		<div className={layoutClass(preview, previewVisible)} ref={setContainer}>
			<MarkdownFieldInput
				activation={activation}
				ariaLabel={ariaLabel}
				id={id}
				onChange={onChange}
				onTextareaChange={handleTextareaChange}
				paste={paste}
				placeholder={placeholder}
				value={value}
			/>
			{previewVisible ? <MarkdownPreviewPane text={value} /> : null}
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
