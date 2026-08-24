/**
 * 用例正文贴图的上传链路（粘贴 / 拖拽都走它）。
 *
 * 三步，文件字节**不经过我们的服务端**：
 *   1. `presignUpload` 拿一个 5 分钟有效的 PUT URL；
 *   2. 浏览器把 File 直接 PUT 到 R2；
 *   3. `register` 登记元数据（服务端再 HeadObject 读回真实大小/类型），
 *      返回的 `id` 就是要拼进正文 `![](attachment:<id>)` 的那个值。
 *
 * 形状照抄 `test-runs/use-attachment-upload.ts`，那边踩过的坑这里一条不落地重现。
 * 唯一的形态差别：这个 hook 返回**成功登记的 id 数组**——调用方（编辑器）
 * 拿它去拼引用插进光标处，所以「哪几张成功了、顺序是什么」是它的返回值本身，
 * 不能像附件面板那样只靠 invalidate 让列表自己长出来。
 */
import { ORPCError } from "@orpc/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { toast } from "sonner";

import { precheckCaseImage } from "@/components/cases/case-attachment-policy";
import { client, orpc } from "@/utils/orpc";

/**
 * 剪贴板里的图片通常没有文件名，兜一个而不是让 `register` 的 min(1) 报错。
 *
 * 导出给草稿态那条链路（`use-case-draft-attachments.ts`）复用：两条链路给同一张
 * 图起的展示名必须一致，各写各的字面量迟早会漂成两个名字。
 */
export const CASE_FALLBACK_FILE_NAME = "粘贴的图片";

/** 单次能塞进来的图片数上限，防止误拖一整个文件夹把页面卡死。 */
const MAX_FILES_PER_BATCH = 10;

/**
 * R2 没配置时 `presignUpload` / `register` 一律抛 PRECONDITION_FAILED。
 * 认这个 code 而不是拿 try/catch 把所有失败都当成「存储不可用」——
 * 网络抖动、用例被并发删除（NOT_FOUND）都会走进 catch，混为一谈会把粘贴入口
 * 错误地永久禁掉，而那条禁用在本次会话里是不可逆的。
 */
export function isStorageUnavailableError(error: unknown): boolean {
	return error instanceof ORPCError && error.code === "PRECONDITION_FAILED";
}

type UploadOutcome =
	| { attachmentId: string; kind: "ok" }
	| { kind: "rejected" }
	| { kind: "storage-unavailable" };

async function uploadOne(caseId: string, file: File): Promise<UploadOutcome> {
	const displayName = file.name || CASE_FALLBACK_FILE_NAME;
	const precheck = precheckCaseImage(file);
	if (!precheck.ok) {
		// 前端预检失败不算错误流程：告诉用户这一张不行，别的照传。
		toast.error(`${displayName}：${precheck.reason}`);
		return { kind: "rejected" };
	}
	// 只读一次 `file.type`，presign 与 PUT 共用同一个 const。
	// ⚠️ PUT 的 Content-Type 必须与 presignUpload 里声明的那个字符串**完全一致**：
	// 它被签进了 SigV4 的 signed headers，差一个字符 R2 就返 403
	// SignatureDoesNotMatch。所以这里不在 PUT 处第二次去取 `file.type`——
	// 语义上相同，但两处各自取值就给了它们漂移的机会。
	const contentType = file.type;
	try {
		const { storageKey, uploadUrl } =
			await client.caseAttachments.presignUpload({
				caseId,
				contentType,
				fileName: displayName,
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
		const attachment = await client.caseAttachments.register({
			caseId,
			// fileName 只作为展示文本落库，服务端的 object key 里没有它的任何一段。
			fileName: displayName,
			storageKey,
		});
		return { attachmentId: attachment.id, kind: "ok" };
	} catch (error) {
		if (isStorageUnavailableError(error)) {
			return { kind: "storage-unavailable" };
		}
		// 一张失败不该中断其它张，也不该把异常抛给调用方——粘贴是个轻动作，
		// 它的失败反馈就是一条 toast。
		toast.error(
			`${displayName}：${error instanceof Error ? error.message : "上传失败"}`
		);
		return { kind: "rejected" };
	}
}

export interface CaseImageUpload {
	/** R2 未配置：粘贴入口该整体禁用并给出原因，而不是让用户粘完看着它静默失败。 */
	storageUnavailable: boolean;
	/** 返回成功登记的附件 id，顺序与输入一致（失败的那几张直接缺席）。 */
	upload: (files: readonly File[]) => Promise<string[]>;
	uploading: boolean;
}

export function useCaseImageUpload(caseId: string): CaseImageUpload {
	const queryClient = useQueryClient();
	/**
	 * 配置状态一次性查，别让用户靠「真的失败一次」才知道这个部署没接存储。
	 * 它问的是整个部署，与用例无关，因此切用例不会重查（同一个 query key 命中缓存）。
	 */
	const status = useQuery(orpc.caseAttachments.storageStatus.queryOptions({}));
	/**
	 * 「撞错后置标志」这条兜底**保留**：配置可能在页面开着的时候被管理员改掉，
	 * 那时上面那条查询的结果已经是旧的了。它只是不再是唯一的发现途径。
	 */
	const [storageFailed, setStorageFailed] = useState(false);
	const [uploading, setUploading] = useState(false);

	const upload = useCallback(
		async (files: readonly File[]): Promise<string[]> => {
			const ids: string[] = [];
			setUploading(true);
			try {
				for (const file of files.slice(0, MAX_FILES_PER_BATCH)) {
					// biome-ignore lint/performance/noAwaitInLoops: 串行是刻意的——预签名只有 5 分钟有效期，十个 PUT 同时抢上行带宽会把每一个都拖到过期；而且串行才能让「第 3 张超限」这类提示按顺序出现
					const outcome = await uploadOne(caseId, file);
					if (outcome.kind === "storage-unavailable") {
						setStorageFailed(true);
						toast.error("附件存储（R2）未配置，无法粘贴图片");
						// 后面几张必然撞同一堵墙，继续只会刷出一串重复 toast。
						break;
					}
					if (outcome.kind === "ok") {
						ids.push(outcome.attachmentId);
					}
				}
			} finally {
				setUploading(false);
			}
			if (ids.length > 0) {
				/**
				 * 服务端广播的失效事件按 `x-client-id` **跳过发起者自己**（见 realtime 协议），
				 * 所以本地必须自己刷一次，否则刚粘的图在自己这边查不到签名 URL，
				 * 渲染出来是一块占位。
				 */
				queryClient.invalidateQueries({
					queryKey: orpc.caseAttachments.key(),
				});
			}
			return ids;
		},
		[caseId, queryClient]
	);

	return {
		storageUnavailable: status.data?.configured === false || storageFailed,
		upload,
		uploading,
	};
}

/** 一次粘贴能带进来的图片数上限，供 UI 写进提示文案。 */
export const CASE_IMAGE_BATCH_LIMIT = MAX_FILES_PER_BATCH;
