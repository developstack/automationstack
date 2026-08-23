/**
 * 活跃 markdown 字段下方的格式工具条。
 *
 * 放在编辑区「下面」而不是上面：一个用例可能有 20 个步骤 × 2 个字段，
 * 工具条随聚焦挂载。挂在上面会把刚点中的输入框整体下推约 32px，
 * 光标离开指针落点；挂在下面则该字段的上边缘与光标原地不动，
 * 只把它后面的内容往下顶。
 *
 * 键盘：按 ARIA toolbar 模式做 roving tabindex —— 整条只占一个 Tab 停靠点，
 * 左右方向键在按钮间移动。否则 20 个步骤 × 5 个按钮会往 Tab 序里塞 100 个停靠点。
 */

import { Button } from "@automationstack/ui/components/button";
import type { EditorView } from "@codemirror/view";
import {
	BoldIcon,
	CodeIcon,
	ItalicIcon,
	ListIcon,
	ListOrderedIcon,
} from "lucide-react";
import {
	type KeyboardEvent,
	type MouseEvent,
	useCallback,
	useRef,
	useState,
} from "react";

/** 在选区两端插入同一个标记（加粗 / 斜体 / 行内代码）。 */
function wrapSelection(view: EditorView, marker: string) {
	const range = view.state.selection.main;
	view.dispatch({
		changes: [
			{ from: range.from, insert: marker },
			{ from: range.to, insert: marker },
		],
		selection: {
			anchor: range.from + marker.length,
			head: range.to + marker.length,
		},
	});
	view.focus();
}

/** 给选区覆盖到的每一行加上列表前缀。 */
function prefixLines(view: EditorView, prefix: string) {
	const { doc, selection } = view.state;
	const first = doc.lineAt(selection.main.from).number;
	const last = doc.lineAt(selection.main.to).number;
	const changes: { from: number; insert: string }[] = [];
	for (let number = first; number <= last; number += 1) {
		changes.push({ from: doc.line(number).from, insert: prefix });
	}
	view.dispatch({ changes });
	view.focus();
}

interface ToolbarCommand {
	Icon: typeof BoldIcon;
	label: string;
	run: (view: EditorView) => void;
}

const COMMANDS: readonly ToolbarCommand[] = [
	{ Icon: BoldIcon, label: "加粗", run: (view) => wrapSelection(view, "**") },
	{ Icon: ItalicIcon, label: "斜体", run: (view) => wrapSelection(view, "*") },
	{
		Icon: CodeIcon,
		label: "行内代码",
		run: (view) => wrapSelection(view, "`"),
	},
	{ Icon: ListIcon, label: "无序列表", run: (view) => prefixLines(view, "- ") },
	{
		Icon: ListOrderedIcon,
		label: "有序列表",
		run: (view) => prefixLines(view, "1. "),
	},
];

/** ARIA toolbar 的 roving tabindex：只有 activeIndex 那颗按钮进 Tab 序。 */
function useRovingIndex(count: number) {
	const [activeIndex, setActiveIndex] = useState(0);
	const activeRef = useRef(0);
	const buttonsRef = useRef<(HTMLButtonElement | null)[]>([]);

	const move = useCallback(
		(delta: number) => {
			const next = (activeRef.current + delta + count) % count;
			activeRef.current = next;
			setActiveIndex(next);
			buttonsRef.current[next]?.focus();
		},
		[count]
	);

	const handleKeyDown = useCallback(
		(event: KeyboardEvent<HTMLButtonElement>) => {
			if (event.key === "ArrowRight") {
				event.preventDefault();
				move(1);
				return;
			}
			if (event.key === "ArrowLeft") {
				event.preventDefault();
				move(-1);
			}
		},
		[move]
	);

	return { activeIndex, buttonsRef, handleKeyDown };
}

interface ToolbarButtonProps {
	command: ToolbarCommand;
	index: number;
	isActive: boolean;
	onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void;
	onRegister: (index: number, node: HTMLButtonElement | null) => void;
	view: EditorView | null;
}

function ToolbarButton({
	command,
	index,
	isActive,
	onKeyDown,
	onRegister,
	view,
}: ToolbarButtonProps) {
	const { Icon } = command;
	// 按钮取焦点会让编辑器失焦、整个字段退回未聚焦态，所以按下时就阻止默认的移焦。
	const handleMouseDown = useCallback(
		(event: MouseEvent<HTMLButtonElement>) => event.preventDefault(),
		[]
	);
	const handleClick = useCallback(() => {
		if (view) {
			command.run(view);
		}
	}, [command, view]);
	const handleRef = useCallback(
		(node: HTMLButtonElement | null) => onRegister(index, node),
		[index, onRegister]
	);

	return (
		<Button
			aria-label={command.label}
			disabled={view === null}
			onClick={handleClick}
			onKeyDown={onKeyDown}
			onMouseDown={handleMouseDown}
			ref={handleRef}
			size="icon-xs"
			tabIndex={isActive ? 0 : -1}
			type="button"
			variant="ghost"
		>
			<Icon />
		</Button>
	);
}

/** 格式工具条；`view` 为 null 表示编辑器尚未挂好，按钮先禁用。 */
export function MarkdownToolbar({ view }: { view: EditorView | null }) {
	const { activeIndex, buttonsRef, handleKeyDown } = useRovingIndex(
		COMMANDS.length
	);
	const handleRegister = useCallback(
		(index: number, node: HTMLButtonElement | null) => {
			buttonsRef.current[index] = node;
		},
		[buttonsRef]
	);

	return (
		<div
			aria-label="markdown 格式"
			className="flex flex-wrap items-center gap-0.5 border-input border-t bg-muted/40 px-1 py-0.5"
			role="toolbar"
		>
			{COMMANDS.map((command, index) => (
				<ToolbarButton
					command={command}
					index={index}
					isActive={index === activeIndex}
					key={command.label}
					onKeyDown={handleKeyDown}
					onRegister={handleRegister}
					view={view}
				/>
			))}
		</div>
	);
}
