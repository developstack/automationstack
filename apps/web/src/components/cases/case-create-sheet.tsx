import { Sheet, SheetContent } from "@automationstack/ui/components/sheet";
import { useCallback, useState } from "react";

import { CaseCreateBody } from "@/components/cases/case-create-body";
import {
	UnsavedChangesDialog,
	useUnsavedCloseGuard,
	WIDE_SHEET_CONTENT_CLASS,
} from "@/components/wide-sheet-shell";

/**
 * 关掉新建抽屉时的二次确认文案。
 *
 * 默认文案是「关掉就找不回来了」——那句话在这条路径上**现在是假的**：
 * 关闭刻意不清本地草稿（用户的原话：「关掉的时候，也不要清掉草稿吧」），
 * 内容会留在这台电脑上。把一句吓唬人的假话留在这儿，代价是用户为了「保住内容」
 * 而不敢关抽屉，恰恰是这次改动想消除的焦虑。
 *
 * ⚠️ 但也**不能再说「下次打开这个模块的新建用例时自动恢复」**——自动恢复那条路
 * 已经拆掉了（点新建永远是空表单，理由见 use-case-create-draft.ts 文件头）。
 * 现在草稿的入口是侧栏那份清单，以及抽屉顶部那条提示；文案必须指到那儿去，
 * 否则用户会守着一张空表单等一个永远不会来的恢复。
 *
 * 那为什么还要问一句：草稿只在**这台电脑的这个浏览器**里，换台机器就没有；
 * 而且真正的「创建」还没发生，列表里不会出现这条用例。这一句问的是
 * 「你确定现在不建了吗」，不是「你确定要丢内容吗」。
 */
const CLOSE_CONFIRM_TITLE = "先不创建这条用例？";
const CLOSE_CONFIRM_DESCRIPTION =
	"已经写的内容会作为草稿留在这台电脑上，之后可以从侧栏的「未完成草稿」接着写。用例本身还没有创建。";
const CLOSE_CONFIRM_LABEL = "关闭并保留草稿";

interface CaseCreateSheetProps {
	/** URL 上 `?draft=` 指名要恢复的那份草稿；不带就是一张空表单。 */
	draftId: string | undefined;
	/** undefined when no module is selected — creation needs a target module. */
	moduleId: string | undefined;
	onClose: () => void;
	onCreated: (caseId: string) => void;
	open: boolean;
	projectId: string;
}

/**
 * 新建用例。与详情抽屉、以及测试任务那几个抽屉共用 WIDE_SHEET_CONTENT_CLASS：
 * 同一个宽度、同一套字号、同一个 <CaseForm>，替掉了原来那个 384px 的 Dialog。
 *
 * 这一层只剩外壳：表单值、预生成的 caseId、本地草稿与待登记的贴图全部在
 * `case-create-body.tsx` 里，它随抽屉的开合挂载/卸载。外壳只需要知道
 * 「里面脏没脏」（主体自己报上来）好决定关闭前问不问那一句。
 */
export function CaseCreateSheet(props: CaseCreateSheetProps) {
	const [dirty, setDirty] = useState(false);
	const open = props.open && props.moduleId !== undefined;
	const guard = useUnsavedCloseGuard(dirty, props.onClose);
	/**
	 * 标题栏的「取消」= 关抽屉，与 Esc / 点外面 / 右上角 × 同一个后果，
	 * 所以它也必须走守卫。useCallback 稳住引用，避免主体每次 render 都拿到新函数。
	 */
	const requestClose = useCallback(
		() => guard.handleOpenChange(false),
		[guard.handleOpenChange]
	);

	return (
		<>
			<Sheet onOpenChange={guard.handleOpenChange} open={open}>
				<SheetContent className={WIDE_SHEET_CONTENT_CLASS} side="right">
					{open && props.moduleId ? (
						/*
						 * key 绑 moduleId + draftId：这两个各自决定「这是哪一次草稿会话」。
						 * 换模块是另一个创建目标；换 draftId（点了某份草稿的「继续编辑」，
						 * 或反过来回到全新表单）则是另一份草稿、另一个预生成 caseId。
						 * 不重新挂载的话，恢复只发生在挂载 effect 里，点了「继续编辑」
						 * 却什么都不会变。
						 */
						<CaseCreateBody
							draftId={props.draftId}
							key={`${props.moduleId}:${props.draftId ?? "new"}`}
							moduleId={props.moduleId}
							onCancel={requestClose}
							onClose={props.onClose}
							onCreated={props.onCreated}
							onDirtyChange={setDirty}
							projectId={props.projectId}
						/>
					) : null}
				</SheetContent>
			</Sheet>
			<UnsavedChangesDialog
				confirmLabel={CLOSE_CONFIRM_LABEL}
				description={CLOSE_CONFIRM_DESCRIPTION}
				onCancel={guard.cancelClose}
				onConfirm={guard.confirmClose}
				open={guard.confirming}
				title={CLOSE_CONFIRM_TITLE}
			/>
		</>
	);
}
