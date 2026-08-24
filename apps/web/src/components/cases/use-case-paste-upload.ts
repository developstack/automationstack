/**
 * 贴图的编排层：占位 → 本地 blob 预览 → 上传 → 换成真实引用（或删掉占位）。
 *
 * 上传本身在 `use-case-attachment-upload.ts`，这里只负责**正文与预览在这几百
 * 毫秒里始终是自洽的**：
 *
 *   粘贴那一刻（同步）  正文插入 `![](uploading:<token>)`，blob URL 按 token 登记
 *   上传成功            blob 改挂到真实 attachment id，正文里的占位换成 `attachment:<id>`
 *   上传失败            占位从正文里删掉，blob 回收（失败原因由上传层 toast）
 *   签名 URL 到位       blob 回收，改用服务端签的那一个
 *
 * 「怎么把文本写进那个字段」不在这里——那要看编辑器还活不活着（见
 * `use-markdown-field-paste.ts`），所以由调用方传一个 `CasePasteTarget` 进来。
 * 这一层只知道「插一段文本」和「把这段换成那段」。
 */
import { buildCaseAttachmentRef } from "@automationstack/api/lib/case-attachment-ref";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { precheckCaseImage } from "@/components/cases/case-attachment-policy";
import { buildCaseUploadingRef } from "@/components/cases/case-upload-placeholder";
import {
	CASE_IMAGE_BATCH_LIMIT,
	type CaseImageUpload,
} from "@/components/cases/use-case-attachment-upload";

/**
 * 一次粘贴要往字段里写的两件事。由字段自己实现——只有它知道此刻该 dispatch 给
 * 活着的编辑器，还是对最新的字段值做字符串替换再 `onChange` 推给父级。
 */
export interface CasePasteTarget {
	/** 在光标处插入一段文本（有选区就替换掉选区）。 */
	insert: (text: string) => void;
	/** 把正文里第一处 `from` 换成 `to`；`to` 为空串即删除。 */
	replace: (from: string, to: string) => void;
}

/** 剪贴板里的图片常常没有文件名，toast 里兜一个。 */
const FALLBACK_FILE_NAME = "粘贴的图片";

interface PasteJob {
	file: File;
	token: string;
}

interface LocalUrlActions {
	/** 登记一个本地 blob URL。 */
	register: (key: string, url: string) => void;
	/** 回收并注销。 */
	release: (key: string) => void;
	/** 换个键继续挂着同一个 blob（token → 真实 attachment id）。 */
	rename: (from: string, to: string) => void;
}

/**
 * 本次会话自己造出来的 blob URL 表。
 *
 * 键与正文里的引用一一对应：上传中是 token，上传成功后改成 attachment id。
 * 之所以成功后还留着（而不是立刻回收换成签名 URL），是因为签名 URL 要等
 * `caseAttachments.list` 重新拉回来才有；中间那一小段如果没有 blob 顶着，
 * 刚贴好的图会闪一下占位块。
 */
function useLocalImageUrls() {
	const [urls, setUrls] = useState<ReadonlyMap<string, string>>(
		() => new Map()
	);
	// 卸载时要回收，但那个 effect 只跑一次，拿不到最新的 state，只能靠 ref 转发。
	const latest = useRef(urls);
	latest.current = urls;

	useEffect(
		() => () => {
			for (const url of latest.current.values()) {
				URL.revokeObjectURL(url);
			}
		},
		[]
	);

	const actions = useMemo<LocalUrlActions>(
		() => ({
			register: (key, url) => setUrls((prev) => new Map(prev).set(key, url)),
			release: (key) => {
				// revokeObjectURL 放在 updater 外面：updater 必须是纯函数
				// （StrictMode 会跑两遍），在里面动全局资源等于让一次被丢弃的
				// 渲染把还在用的 blob 提前作废。
				const url = latest.current.get(key);
				if (url !== undefined) {
					URL.revokeObjectURL(url);
				}
				setUrls((prev) => {
					if (!prev.has(key)) {
						return prev;
					}
					const next = new Map(prev);
					next.delete(key);
					return next;
				});
			},
			rename: (from, to) =>
				setUrls((prev) => {
					const url = prev.get(from);
					if (url === undefined) {
						return prev;
					}
					const next = new Map(prev);
					next.delete(from);
					next.set(to, url);
					return next;
				}),
		}),
		[]
	);

	return { actions, urls };
}

/**
 * 串行跑完这一批。
 *
 * 每张单独调一次 `upload([file])` 而不是一次塞进去一批：批量接口只返回成功的
 * id 数组，对不上「第几张失败了」，而占位必须**逐个**换或删。
 */
async function runOneUpload(
	job: PasteJob,
	target: CasePasteTarget,
	actions: LocalUrlActions,
	upload: (files: readonly File[]) => Promise<string[]>
) {
	let attachmentId: string | undefined;
	try {
		[attachmentId] = await upload([job.file]);
	} catch {
		// 上传层把「服务端说不行」都转成了返回值，会抛到这里的是网络中断、
		// 请求被取消这类它覆盖不到的情况——照失败处理，但得自己 toast。
		toast.error(`${job.file.name || FALLBACK_FILE_NAME}：上传失败，请重试`);
	}
	{
		const placeholder = buildCaseUploadingRef(job.token);
		if (attachmentId === undefined) {
			// 失败就把占位删干净。留着它等于给用户一个永远「上传中」的破引用，
			// 而且它会跟着正文一起被保存下来。失败原因上传层已经 toast 过了。
			actions.release(job.token);
			target.replace(placeholder, "");
			return;
		}
		// 改键与改文本在同一个 tick 里发生，React 批处理后一起生效，
		// 不存在「文本已指向 id 而 blob 还挂在 token 上」的中间帧。
		actions.rename(job.token, attachmentId);
		target.replace(placeholder, buildCaseAttachmentRef(attachmentId));
	}
}

async function runUploads(
	jobs: readonly PasteJob[],
	target: CasePasteTarget,
	actions: LocalUrlActions,
	upload: (files: readonly File[]) => Promise<string[]>
) {
	for (const job of jobs) {
		// biome-ignore lint/performance/noAwaitInLoops: 串行是刻意的，理由与 use-case-attachment-upload.ts 里那条相同——预签名只有 5 分钟有效期，并发抢上行带宽会把每一个都拖到过期
		await runOneUpload(job, target, actions, upload);
	}
}

/** 兜底本身炸了（写回字段时字段已经不在了之类）也不能留下 unhandled rejection。 */
function reportPasteCrash() {
	toast.error("图片上传中断，请重试");
}

export interface CasePasteUpload {
	/** attachment id / 上传中的 token → 可显示的 URL。 */
	imageUrls: ReadonlyMap<string, string | null>;
	/**
	 * 正文里还有 `![](uploading:<token>)` 没落定。
	 *
	 * 刻意**不**复用上传层的 `uploading`：那一位在串行的两张图之间会瞬间落回
	 * false（`upload()` 是一张一张调的），而保存按钮的禁用条件问的是「正文里
	 * 还有没有假引用」，中间掉下去一帧就足够让人按到保存。这里数的是**整批**
	 * 编排任务，从插占位到最后一张换完/删完全程为真。
	 */
	uploading: boolean;
	/** null = 这条路上不该接管粘贴（存储未配置）。 */
	uploadPasted: ((files: File[], target: CasePasteTarget) => void) | null;
}

/**
 * 编排层对「怎么上传」是无知的：`uploader` 由调用方注入。
 *
 * 编辑已有用例走 `useCaseImageUpload`（presign + register，直接落库）；
 * 新建用例走 `use-case-draft-attachments.ts` 里那个草稿态的（presignDraftUpload，
 * 登记推迟到保存时）。两条链路的占位/预览/失败回滚一模一样，那部分只有这一份。
 */
export function useCasePasteUpload(
	uploader: CaseImageUpload,
	serverUrls: ReadonlyMap<string, string | null>
): CasePasteUpload {
	const { actions, urls } = useLocalImageUrls();
	const { storageUnavailable, upload } = uploader;
	const [running, setRunning] = useState(0);

	// 服务端签名 URL 一到位就把对应的 blob 放掉。少了这一步，一次会话里贴几十张图
	// 就是几十个永远不释放的 blob。
	useEffect(() => {
		for (const key of urls.keys()) {
			if ((serverUrls.get(key) ?? null) !== null) {
				actions.release(key);
			}
		}
	}, [actions, serverUrls, urls]);

	const imageUrls = useMemo<ReadonlyMap<string, string | null>>(() => {
		if (urls.size === 0) {
			return serverUrls;
		}
		const merged = new Map(serverUrls);
		for (const [key, url] of urls) {
			// 签名 URL 存在且非 null 时以它为准；否则（还没查到 / 签不出来）用本地 blob。
			if ((merged.get(key) ?? null) === null) {
				merged.set(key, url);
			}
		}
		return merged;
	}, [serverUrls, urls]);

	const uploadPasted = useCallback(
		(files: File[], target: CasePasteTarget) => {
			const jobs: PasteJob[] = [];
			for (const file of files.slice(0, CASE_IMAGE_BATCH_LIMIT)) {
				// 预检放在插占位**之前**：不然一张 30MB 的原图会先在预览里闪出来
				// 再被删掉。上传层还会再检一次，但这里已经拦下的不会走到那儿，
				// 不存在重复 toast。
				const precheck = precheckCaseImage(file);
				if (precheck.ok) {
					const token = crypto.randomUUID();
					actions.register(token, URL.createObjectURL(file));
					jobs.push({ file, token });
				} else {
					toast.error(`${file.name || FALLBACK_FILE_NAME}：${precheck.reason}`);
				}
			}
			if (jobs.length === 0) {
				return;
			}
			// 一次性插完所有占位：字段值是受控的，循环里插 N 次的话后 N-1 次读到的
			// 都还是插入前的旧值，互相覆盖只剩最后一张。
			target.insert(
				jobs.map((job) => buildCaseUploadingRef(job.token)).join("\n")
			);
			// 计数而不是布尔：两次粘贴可以重叠，后一批开始时前一批还没跑完。
			setRunning((count) => count + 1);
			runUploads(jobs, target, actions, upload)
				.catch(reportPasteCrash)
				.finally(() => setRunning((count) => count - 1));
		},
		[actions, upload]
	);

	return {
		imageUrls,
		uploading: running > 0,
		uploadPasted: storageUnavailable ? null : uploadPasted,
	};
}
