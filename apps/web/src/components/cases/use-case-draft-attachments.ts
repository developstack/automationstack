/**
 * 「新建用例」这条路的贴图状态：用例**还不在数据库里**。
 *
 * 与 `useCaseEditAttachments` 是并列的两条链路，差别只有两处：
 *
 * | | 编辑已有用例 | 新建用例（本文件） |
 * | --- | --- | --- |
 * | 签名 | `presignUpload`（服务端反查 projectId） | `presignDraftUpload`（projectId 由前端传） |
 * | 落库 | 传完立刻 `register` | **不登记**，攒在 `pending` 里，等点保存时随 `cases.create` 一起 |
 *
 * 攒着不登记，是为了让「建到一半跑掉」在数据库里**一行痕迹都不留**：没有草稿行，
 * 版本历史干净地从 v1 开始，也不需要清理定时任务。代价是 R2 上会留孤儿对象，
 * 这是仓库已明确接受的代价（见 `db/schema/case-attachments.ts` 文件头）。
 *
 * 占位、本地 blob 预览、失败回滚全部复用 `useCasePasteUpload`，这里一行都不重写。
 */

import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import type { CaseAttachmentContextValue } from "@/components/cases/case-attachment-context";
import { precheckCaseImage } from "@/components/cases/case-attachment-policy";
import type { CaseDraftAttachment } from "@/components/cases/case-draft-parse";
import {
	CASE_FALLBACK_FILE_NAME,
	type CaseImageUpload,
	isStorageUnavailableError,
} from "@/components/cases/use-case-attachment-upload";
import { useCasePasteUpload } from "@/components/cases/use-case-paste-upload";
import { client, orpc } from "@/utils/orpc";

/**
 * caseId 还没生成时（挂载后的第一帧）用来凑 query key 的占位值。
 * 那一帧查询是 disabled 的，这个值不会被发出去。
 */
const PLACEHOLDER_CASE_ID = "00000000-0000-0000-0000-000000000000";

/** 模块级常量：空清单要保持同一个引用，否则每次渲染都算「变了」。 */
const NO_ATTACHMENTS: readonly CaseDraftAttachment[] = [];

type DraftUploadOutcome =
	| { attachment: CaseDraftAttachment; kind: "ok" }
	| { kind: "rejected" }
	| { kind: "storage-unavailable" };

interface DraftScope {
	caseId: string;
	projectId: string;
}

async function uploadDraftOne(
	scope: DraftScope,
	file: File
): Promise<DraftUploadOutcome> {
	const displayName = file.name || CASE_FALLBACK_FILE_NAME;
	const precheck = precheckCaseImage(file);
	if (!precheck.ok) {
		toast.error(`${displayName}：${precheck.reason}`);
		return { kind: "rejected" };
	}
	// ⚠️ 只读一次 `file.type`：PUT 的 Content-Type 必须与 presign 里声明的那个
	// 字符串**完全一致**（它被签进了 SigV4 的 signed headers），两处各自取值
	// 就给了它们漂移的机会，漂了 R2 就回 403 SignatureDoesNotMatch。
	const contentType = file.type;
	try {
		const { attachmentId, storageKey, uploadUrl } =
			await client.caseAttachments.presignDraftUpload({
				caseId: scope.caseId,
				contentType,
				fileName: displayName,
				projectId: scope.projectId,
				sizeBytes: file.size,
			});
		const response = await fetch(uploadUrl, {
			body: file,
			headers: { "Content-Type": contentType },
			method: "PUT",
		});
		if (!response.ok) {
			throw new Error(`上传到存储失败（HTTP ${response.status}）`);
		}
		// 到此为止。**不调 `register`**：那条用例还不存在，登记要等 `cases.create`。
		return {
			attachment: { fileName: displayName, id: attachmentId, storageKey },
			kind: "ok",
		};
	} catch (error) {
		if (isStorageUnavailableError(error)) {
			return { kind: "storage-unavailable" };
		}
		toast.error(
			`${displayName}：${error instanceof Error ? error.message : "上传失败"}`
		);
		return { kind: "rejected" };
	}
}

/**
 * 草稿态的上传器，形状与 `useCaseImageUpload` 完全一致，好让编排层不必区分两条路。
 *
 * 传成功的那条记录同时报给 `onUploaded`——`pending` 就是保存时要提交的清单，
 * 少一条就是「正文里有图、库里没登记」的死引用。
 */
function useDraftUploader(
	scope: DraftScope | null,
	onUploaded: (attachment: CaseDraftAttachment) => void
): CaseImageUpload {
	const status = useQuery(orpc.caseAttachments.storageStatus.queryOptions({}));
	const [storageFailed, setStorageFailed] = useState(false);
	const [uploading, setUploading] = useState(false);

	const upload = useCallback(
		async (files: readonly File[]): Promise<string[]> => {
			if (scope === null) {
				return [];
			}
			const ids: string[] = [];
			setUploading(true);
			try {
				for (const file of files) {
					// biome-ignore lint/performance/noAwaitInLoops: 串行是刻意的，理由与 use-case-attachment-upload.ts 里那条相同——预签名只有 5 分钟有效期，并发抢上行带宽会把每一个都拖到过期
					const outcome = await uploadDraftOne(scope, file);
					if (outcome.kind === "storage-unavailable") {
						setStorageFailed(true);
						toast.error("附件存储（R2）未配置，无法粘贴图片");
						// 后面几张必然撞同一堵墙，继续只会刷出一串重复 toast。
						break;
					}
					if (outcome.kind === "ok") {
						onUploaded(outcome.attachment);
						ids.push(outcome.attachment.id);
					}
				}
			} finally {
				setUploading(false);
			}
			// 刻意不 invalidate `caseAttachments`：这批图一行都没进库，
			// `caseAttachments.list` 查它们只会得到空数组。
			return ids;
		},
		[onUploaded, scope]
	);

	return {
		storageUnavailable: status.data?.configured === false || storageFailed,
		upload,
		uploading,
	};
}

/**
 * 崩溃恢复：为草稿里那批 key 重新签 GET URL。
 *
 * 本次会话刚粘的图不走这里——它们的本地 blob URL 还挂在编排层手里，直接就能显示。
 * 需要重签的只有**上一次会话留下的**那些：正文里有 `![](attachment:<id>)`，
 * 但数据库里一行都没有，`caseAttachments.list` 帮不上忙，只能靠 key 前缀鉴权。
 *
 * 一次请求签完整批。返回 undefined（查询还在飞）时 map 里**不放这个 id**，
 * 让渲染器落到「图片加载中」而不是「附件存储未配置」——后者是 `url: null` 的
 * 专属含义，把加载中说成配置缺失会让用户去找一个不存在的问题。
 */
function useRestoredImageUrls(
	scope: DraftScope | null,
	restored: readonly CaseDraftAttachment[]
): ReadonlyMap<string, string | null> {
	const storageKeys = useMemo(
		() => restored.map((item) => item.storageKey),
		[restored]
	);
	const query = useQuery(
		orpc.caseAttachments.presignDraftDownload.queryOptions({
			enabled: scope !== null && storageKeys.length > 0,
			input: {
				caseId: scope?.caseId ?? PLACEHOLDER_CASE_ID,
				projectId: scope?.projectId ?? PLACEHOLDER_CASE_ID,
				storageKeys,
			},
		})
	);
	const signed = query.data;

	return useMemo(() => {
		const urls = new Map<string, string | null>();
		if (signed === undefined) {
			return urls;
		}
		const byKey = new Map(signed.map((item) => [item.storageKey, item.url]));
		for (const item of restored) {
			urls.set(item.id, byKey.get(item.storageKey) ?? null);
		}
		return urls;
	}, [restored, signed]);
}

export interface CaseDraftAttachments extends CaseAttachmentContextValue {
	/**
	 * 保存时要随 `cases.create` 一起登记的清单（恢复出来的 + 本次会话新传的）。
	 * **还没按正文引用过滤**——过滤在 `case-submit-checks.ts`，那里才看得到最新正文。
	 */
	pending: readonly CaseDraftAttachment[];
}

export interface CaseDraftAttachmentsOptions {
	/** 预生成的用例 id；挂载后的第一帧还没有，此时为 null。 */
	caseId: string | null;
	projectId: string;
	/** 从 localStorage 恢复出来的对照表。引用变化即视为「换了一份草稿」。 */
	restored: readonly CaseDraftAttachment[];
}

export function useCaseDraftAttachments(
	options: CaseDraftAttachmentsOptions
): CaseDraftAttachments {
	const { caseId, projectId, restored } = options;
	const scope = useMemo(
		() => (caseId === null ? null : { caseId, projectId }),
		[caseId, projectId]
	);
	const [pending, setPending] =
		useState<readonly CaseDraftAttachment[]>(NO_ATTACHMENTS);

	/**
	 * 换一份草稿（首次读缓存、或用户点了「放弃草稿」）就把清单整个换掉。
	 * 用 effect 而不是 useState 的初值：`restored` 是挂载之后才从 localStorage
	 * 读出来的（这一页会 SSR，首帧不能碰存储）。
	 */
	useEffect(() => {
		setPending(restored);
	}, [restored]);

	const handleUploaded = useCallback((attachment: CaseDraftAttachment) => {
		setPending((prev) => [...prev, attachment]);
	}, []);

	const uploader = useDraftUploader(scope, handleUploaded);
	const serverUrls = useRestoredImageUrls(scope, restored);
	const { imageUrls, uploading, uploadPasted } = useCasePasteUpload(
		uploader,
		serverUrls
	);

	return useMemo(
		() => ({ imageUrls, pending, uploading, uploadPasted }),
		[imageUrls, pending, uploading, uploadPasted]
	);
}
