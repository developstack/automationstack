import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { replaceCaseImageRef } from "@/components/cases/case-upload-placeholder";
import type {
	CaseImageUpload,
	CaseImageUploadResult,
} from "@/components/cases/use-case-attachment-upload";
import { useCasePasteUpload } from "@/components/cases/use-case-paste-upload";
import type { CasePasteTarget } from "@/components/cases/use-case-upload-commands";

vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

const ATTACHMENT_ID = "11111111-2222-4333-8444-555555555555";
const ATTACHMENT_REF = `![](attachment:${ATTACHMENT_ID})`;
const NO_SERVER_URLS: ReadonlyMap<string, string | null> = new Map();
const UPLOADED: CaseImageUploadResult = {
	attachmentId: ATTACHMENT_ID,
	kind: "ok",
};

interface PendingUpload {
	onProgress: (fraction: number) => void;
	settle: (result: CaseImageUploadResult) => void;
}

function fakeUploader(storageUnavailable = false) {
	const calls: PendingUpload[] = [];
	const uploader: CaseImageUpload = {
		storageUnavailable,
		upload: (_file, onProgress) =>
			new Promise((resolve) => calls.push({ onProgress, settle: resolve })),
	};
	return { calls, uploader };
}

function textTarget() {
	const field = { text: "看图：" };
	const target: CasePasteTarget = {
		insert: (text) => {
			field.text += text;
		},
		replace: (from, to) => {
			field.text = replaceCaseImageRef(field.text, from, to);
		},
	};
	return { field, target };
}

function setup() {
	const { calls, uploader } = fakeUploader();
	const hook = renderHook(() => useCasePasteUpload(uploader, NO_SERVER_URLS));
	const { field, target } = textTarget();
	const file = new File(["png"], "登录页.png", { type: "image/png" });
	act(() => hook.result.current.uploadPasted?.([file], target));
	const [token] = [...hook.result.current.uploads.keys()];
	if (token === undefined) {
		throw new Error("粘贴后没有上传任务");
	}
	return { calls, field, hook, token };
}

function nthCall(calls: PendingUpload[], index: number): PendingUpload {
	const call = calls[index];
	if (call === undefined) {
		throw new Error(`第 ${index + 1} 次上传没有开始`);
	}
	return call;
}

async function settle(call: PendingUpload, result: CaseImageUploadResult) {
	await act(async () => {
		call.settle(result);
		await new Promise((resolve) => setTimeout(resolve, 0));
	});
}

URL.createObjectURL = vi.fn(() => "blob:local");
URL.revokeObjectURL = vi.fn();

describe("useCasePasteUpload：粘贴图片后显示上传进度，失败时可以重试", () => {
	it("上传中报告进度，传完后占位换成附件引用，任务消失", async () => {
		const { calls, field, hook, token } = setup();
		expect(field.text).toBe(`看图：![](uploading:${token})`);

		const first = nthCall(calls, 0);
		act(() => first.onProgress(0.5));
		expect(hook.result.current.uploads.get(token)).toEqual({
			fileName: "登录页.png",
			progress: 0.5,
			status: "uploading",
		});
		expect(hook.result.current.uploading).toBe(true);

		await settle(first, UPLOADED);
		expect(field.text).toBe(`看图：${ATTACHMENT_REF}`);
		expect(hook.result.current.uploads.has(token)).toBe(false);
		expect(hook.result.current.uploading).toBe(false);
	});

	it("上传失败时保留占位和原因，重试成功后占位换成附件引用", async () => {
		const { calls, field, hook, token } = setup();
		await settle(nthCall(calls, 0), {
			kind: "failed",
			reason: "上传到存储失败（HTTP 403）",
		});
		expect(field.text).toBe(`看图：![](uploading:${token})`);
		expect(hook.result.current.uploads.get(token)).toEqual({
			fileName: "登录页.png",
			reason: "上传到存储失败（HTTP 403）",
			retryable: true,
			status: "failed",
		});
		expect(hook.result.current.uploading).toBe(false);

		act(() => hook.result.current.retryUpload(token));
		act(() => hook.result.current.retryUpload(token));
		expect(calls).toHaveLength(2);
		expect(hook.result.current.uploads.get(token)?.status).toBe("uploading");

		await settle(nthCall(calls, 1), UPLOADED);
		expect(field.text).toBe(`看图：${ATTACHMENT_REF}`);
		expect(hook.result.current.uploads.size).toBe(0);
	});

	it("移除失败的图片会删掉占位和任务", async () => {
		const { calls, field, hook, token } = setup();
		await settle(nthCall(calls, 0), { kind: "failed", reason: "网络中断" });

		act(() => hook.result.current.discardUpload(token));
		expect(field.text).toBe("看图：");
		expect(hook.result.current.uploads.size).toBe(0);
	});

	it("附件存储未配置时任务失败且不能重试", async () => {
		const { calls, hook, token } = setup();
		await settle(nthCall(calls, 0), { kind: "storage-unavailable" });
		expect(hook.result.current.uploads.get(token)).toMatchObject({
			retryable: false,
			status: "failed",
		});
	});

	it("新粘贴的图片和重试排在同一个队列中，一次只上传一张", async () => {
		const { calls, hook } = setup();
		const second = textTarget();
		const file = new File(["png"], "第二张.png", { type: "image/png" });
		act(() => hook.result.current.uploadPasted?.([file], second.target));
		expect(calls).toHaveLength(1);
		const tokens = [...hook.result.current.uploads.keys()];
		expect(hook.result.current.uploads.get(tokens[1] ?? "")?.status).toBe(
			"queued"
		);

		await settle(nthCall(calls, 0), { kind: "failed", reason: "网络中断" });
		expect(calls).toHaveLength(2);
	});

	it("排队中的图片使用最新的上传函数（例如新建用例的范围刚准备好）", async () => {
		const first = fakeUploader();
		const latest = fakeUploader();
		const hook = renderHook(
			({ uploader }) => useCasePasteUpload(uploader, NO_SERVER_URLS),
			{ initialProps: { uploader: first.uploader } }
		);
		const { target } = textTarget();
		const files = ["a.png", "b.png"].map(
			(name) => new File(["png"], name, { type: "image/png" })
		);
		act(() => hook.result.current.uploadPasted?.(files, target));
		hook.rerender({ uploader: latest.uploader });

		await settle(nthCall(first.calls, 0), UPLOADED);
		expect(first.calls).toHaveLength(1);
		expect(latest.calls).toHaveLength(1);
	});
});
