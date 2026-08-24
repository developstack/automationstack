/**
 * 附件的读 / 传 / 删（plan §6）。
 *
 * 上传是三步，文件字节**不经过我们的服务端**：
 *   1. `presignUpload` 拿一个 5 分钟有效的 PUT URL；
 *   2. 浏览器把 File 直接 PUT 到 R2；
 *   3. `register` 登记元数据（服务端再 HeadObject 读回真实大小/类型）。
 */
import { ORPCError } from "@orpc/client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { toast } from "sonner";

import { precheckAttachment } from "@/components/test-runs/attachment-policy";
import { client, orpc } from "@/utils/orpc";

/** 粘贴进来的图片常常没有文件名，兜一个而不是让 `register` 的 min(1) 报错。 */
const FALLBACK_FILE_NAME = "粘贴的图片";

/** 单次可选/可拖的文件数上限，防止误拖一整个文件夹把页面卡死。 */
const MAX_FILES_PER_BATCH = 10;

/**
 * R2 配没配置，一次性查。
 *
 * 没有这条查询时，用户只能靠**真的失败一次上传**（撞 `PRECONDITION_FAILED`）
 * 才知道传不了图——截了图、拖进去、等一会儿、收到一句报错，然后才发现
 * 这个部署压根没接存储。这是把配置状态藏在失败里。
 *
 * 它问的是整个部署的配置，与用例、与测试任务都无关，所以由执行台在页面这一层查
 * 一次，切用例不会重查（同一个 query key 命中缓存）。
 *
 * 「撞错后置标志」那条兜底**保留**：配置可能在页面开着的时候被管理员改掉，
 * 那时这条查询的结果已经是旧的了。它只是不再是唯一的发现途径。
 */
export function useAttachmentStorageStatus() {
	return useQuery(orpc.testRunAttachments.storageStatus.queryOptions({}));
}

export function useAttachmentList(runCaseId: string | undefined) {
	return useQuery({
		...orpc.testRunAttachments.list.queryOptions({
			input: { runCaseId: runCaseId ?? "" },
		}),
		enabled: runCaseId !== undefined,
	});
}

/**
 * 只刷附件这一个缓存根。
 *
 * 上传/删除会让服务端广播 `entity: "testRun"` 的失效事件，但**发起者自己收不到**
 * （服务端按 `x-client-id` 跳过触发方，见 realtime 协议），所以本地必须自己刷一次；
 * 其他人的页面由那条事件经 `map-invalidate.ts` 的 `testRun → testRunAttachments`
 * 映射刷新。
 */
function useInvalidateAttachments(): () => void {
	const queryClient = useQueryClient();
	return useCallback(() => {
		queryClient.invalidateQueries({ queryKey: orpc.testRunAttachments.key() });
	}, [queryClient]);
}

/**
 * R2 没配置时 `presignUpload` / `register` / `remove` 一律抛 PRECONDITION_FAILED。
 * 认这个 code 而不是拿 try/catch 把所有失败都当成「存储不可用」——
 * 网络抖动、单已提交（CONFLICT）都会走进 catch，混为一谈会把上传入口错误地永久禁掉。
 */
function isStorageUnavailableError(error: unknown): boolean {
	return error instanceof ORPCError && error.code === "PRECONDITION_FAILED";
}

async function uploadOne(file: File, runCaseId: string): Promise<void> {
	const precheck = precheckAttachment(file);
	if (!precheck.ok) {
		// 前端预检失败不算错误流程：告诉用户这一个文件不行，别的照传。
		toast.error(`${file.name || FALLBACK_FILE_NAME}：${precheck.message}`);
		return;
	}
	const { contentType, kind } = precheck;
	const { storageKey, uploadUrl } =
		await client.testRunAttachments.presignUpload({
			contentType,
			kind,
			runCaseId,
			sizeBytes: file.size,
		});
	const response = await fetch(uploadUrl, {
		body: file,
		// ⚠️ 这个头必须与 presignUpload 里声明的 contentType **完全一致**：
		// contentType 被签进了 SigV4 的 signed headers，差一个字符 R2 就返
		// 403 SignatureDoesNotMatch。所以这里用 precheck 算出来的那个值，
		// 不要改成 file.type ——语义上相同，但那样两处取值就可能各自漂移。
		headers: { "Content-Type": contentType },
		method: "PUT",
	});
	if (!response.ok) {
		throw new Error(`上传到存储失败（HTTP ${response.status}）`);
	}
	await client.testRunAttachments.register({
		// fileName 只作为展示文本落库，服务端的 object key 里没有它的任何一段。
		fileName: file.name || FALLBACK_FILE_NAME,
		kind,
		runCaseId,
		storageKey,
	});
}

export interface UploadOptions {
	/** 首次拿到 PRECONDITION_FAILED 时上报，由页面把上传入口整体禁用。 */
	onStorageUnavailable: () => void;
	runCaseId: string;
}

/**
 * 逐个串行上传。
 *
 * 不并发：一次粘贴通常就一张图，而串行能让「第 3 张超限」这类提示按顺序出现，
 * 也避免十个 20MB 的 PUT 同时抢上行带宽把每一个都拖到签名过期。
 */
export function useUploadAttachments({
	onStorageUnavailable,
	runCaseId,
}: UploadOptions) {
	const invalidate = useInvalidateAttachments();
	return useMutation({
		mutationFn: async (files: readonly File[]) => {
			for (const file of files.slice(0, MAX_FILES_PER_BATCH)) {
				// biome-ignore lint/performance/noAwaitInLoops: 串行是刻意的，理由见上方注释（预签名有效期 + 上行带宽）
				await uploadOne(file, runCaseId);
			}
			return files.length;
		},
		onError: (error) => {
			if (isStorageUnavailableError(error)) {
				onStorageUnavailable();
			}
		},
		onSuccess: () => {
			invalidate();
		},
	});
}

export function useRemoveAttachment(onStorageUnavailable: () => void) {
	const invalidate = useInvalidateAttachments();
	return useMutation(
		orpc.testRunAttachments.remove.mutationOptions({
			onError: (error) => {
				if (isStorageUnavailableError(error)) {
					onStorageUnavailable();
				}
			},
			onSuccess: () => {
				invalidate();
				toast.success("附件已删除");
			},
		})
	);
}

/** 一次操作里能塞进来的文件数上限，供 UI 写进提示文案。 */
export const ATTACHMENT_BATCH_LIMIT = MAX_FILES_PER_BATCH;
