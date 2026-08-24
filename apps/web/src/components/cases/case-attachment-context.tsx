/**
 * 用例贴图的上下文：正文里那些图各自的 URL，以及粘贴入口。
 *
 * ## 为什么是 context 而不是 props
 *
 * 贴图这件事在**每一个** markdown 字段上都要能发生（前置条件 + 每一步的两格），
 * 而 `MarkdownField` / `MarkdownCodeEditor` / `StepsEditor` / `CaseForm` 这条链上
 * 一个 caseId 都没有，全是「谁都不认识用例」的纯展示组件。为了贴图把 caseId 一路
 * 透传下去，等于给四个组件各加一个与它们职责无关的必填 prop，而其中三个已经贴着
 * 300 行的上限。
 *
 * ## 没有 Provider 时不能炸
 *
 * `MarkdownField` 将来完全可能被用在别处（比如模块说明）。`useCaseAttachments()`
 * 在 Provider 之外返回一个惰性默认值：空表 + `uploadPasted: null`，
 * 于是那边的粘贴照旧走浏览器默认行为，纯文本一点不受影响。
 */
import { useQuery } from "@tanstack/react-query";
import { createContext, type ReactNode, useContext, useMemo } from "react";

import { useCaseImageUpload } from "@/components/cases/use-case-attachment-upload";
import {
	type CasePasteTarget,
	useCasePasteUpload,
} from "@/components/cases/use-case-paste-upload";
import { orpc } from "@/utils/orpc";

export interface CaseAttachmentContextValue {
	/** attachment id → 可显示的 URL。已登记的走签名 URL，本次会话刚传的走本地 blob URL。 */
	imageUrls: ReadonlyMap<string, string | null>;
	/**
	 * 正文里还有 `![](uploading:<token>)` 没落定。
	 *
	 * 放进 context 而不是层层传 prop，是因为读它的人（抽屉标题栏里的保存按钮）
	 * 与产生它的人（某个 markdown 字段的粘贴）之间隔着整棵表单树，
	 * 与 `uploadPasted` 走 context 是同一个理由。
	 */
	uploading: boolean;
	/**
	 * 粘贴入口。为 null 表示这次粘贴不该被接管（比如没有 Provider、或存储不可用）。
	 *
	 * `target` 由字段自己给：只有它知道该 dispatch 给活着的编辑器，
	 * 还是对最新的字段值做字符串替换（见 `use-markdown-field-paste.ts`）。
	 */
	uploadPasted: ((files: File[], target: CasePasteTarget) => void) | null;
}

/** 模块级常量：没有 Provider 时每次读都返回同一个对象，不会让下游白重渲。 */
const NO_ATTACHMENTS: CaseAttachmentContextValue = {
	imageUrls: new Map(),
	uploading: false,
	uploadPasted: null,
};

const CaseAttachmentContext =
	createContext<CaseAttachmentContextValue>(NO_ATTACHMENTS);

export function useCaseAttachments(): CaseAttachmentContextValue {
	return useContext(CaseAttachmentContext);
}

/**
 * 这条用例全部贴图的签名 URL，**一次请求签完，按 id 在内存查表**。
 *
 * 只读侧（详情抽屉、执行台）直接用它，不必套 Provider——那边没有粘贴。
 * ⚠️ 绝不能改成「每张图一个请求」：一条用例十张图就是十次往返，
 * 每次都要重过一遍鉴权与数据库（见 `caseAttachments.list` 的契约注释）。
 */
export function useCaseAttachmentUrls(
	caseId: string
): ReadonlyMap<string, string | null> {
	const query = useQuery(
		orpc.caseAttachments.list.queryOptions({ input: { caseId } })
	);
	const items = query.data;
	return useMemo(
		() => new Map((items ?? []).map((item) => [item.attachment.id, item.url])),
		[items]
	);
}

/**
 * 「编辑已有用例」这条路的贴图状态：caseId 是真实的，上传能直接落库。
 *
 * 做成 hook 而不是自带 Provider 的组件，是因为**保存按钮不在表单里**——它在抽屉
 * 标题栏。按钮要读 `uploading` 才能在图没传完时禁用自己，于是 Provider 必须
 * 罩住标题栏，也就必须由抽屉那一层来挂（见 `case-detail-sheet.tsx`）。
 *
 * 新建用例那条路的对应物是 `use-case-draft-attachments.ts`：形状相同，
 * 但走 `presignDraftUpload` 且不调 `register`。
 */
export function useCaseEditAttachments(
	caseId: string
): CaseAttachmentContextValue {
	const serverUrls = useCaseAttachmentUrls(caseId);
	const uploader = useCaseImageUpload(caseId);
	const { imageUrls, uploading, uploadPasted } = useCasePasteUpload(
		uploader,
		serverUrls
	);
	return useMemo<CaseAttachmentContextValue>(
		() => ({ imageUrls, uploading, uploadPasted }),
		[imageUrls, uploading, uploadPasted]
	);
}

/**
 * 纯粹的发布口：值由调用方用上面那个 hook（或草稿态那个）算好再传进来。
 *
 * Provider 自己不持有状态，正是为了让持有状态的那一层可以放在**标题栏之上**，
 * 同时把值发给下面的表单。
 */
export function CaseAttachmentProvider({
	children,
	value,
}: {
	children: ReactNode;
	value: CaseAttachmentContextValue;
}) {
	return (
		<CaseAttachmentContext value={value}>{children}</CaseAttachmentContext>
	);
}
