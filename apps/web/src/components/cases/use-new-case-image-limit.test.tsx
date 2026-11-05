import { renderHook } from "@testing-library/react";
import { toast } from "sonner";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CaseAttachmentContextValue } from "@/components/cases/case-attachment-context";
import type { CasePasteTarget } from "@/components/cases/use-case-upload-commands";
import { useNewCaseImageLimit } from "@/components/cases/use-new-case-image-limit";

vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

type UploadPasted = NonNullable<CaseAttachmentContextValue["uploadPasted"]>;

const png = (n: number) => new File(["x"], `${n}.png`, { type: "image/png" });
const FILES = [png(1), png(2), png(3)];
const TARGET: CasePasteTarget = { insert: vi.fn(), replace: vi.fn() };

function attachments(
	uploadPasted: UploadPasted | null
): CaseAttachmentContextValue {
	return {
		discardUpload: vi.fn(),
		imageUrls: new Map(),
		retryUpload: vi.fn(),
		uploading: false,
		uploadPasted,
		uploads: new Map(),
	};
}

/** 用现有的图片数量渲染，然后添加 FILES，返回原来的上传函数收到的文件。 */
function addAt(count: number): File[] | undefined {
	const upload = vi.fn<UploadPasted>();
	const { result } = renderHook(() =>
		useNewCaseImageLimit(attachments(upload), count)
	);
	result.current.uploadPasted?.(FILES, TARGET);
	return upload.mock.lastCall?.[0];
}

beforeEach(() => {
	vi.clearAllMocks();
});

describe("useNewCaseImageLimit：新用例一次最多保存 200 张图片", () => {
	it("uploads all images while the case has room, without a message", () => {
		expect(addAt(197)).toEqual(FILES);
		expect(toast.error).not.toHaveBeenCalled();
	});

	it.each([
		[199, [FILES[0]], "新用例最多 200 张图片，现在有 199 张，2 张没有加入"],
		[200, undefined, "新用例最多 200 张图片，现在有 200 张，3 张没有加入"],
	])(
		"with %i images, uploads %j and says the limit and the count",
		(count, uploaded, message) => {
			expect(addAt(count)).toEqual(uploaded);
			expect(toast.error).toHaveBeenCalledWith(message);
		}
	);

	it("keeps uploadPasted null when the storage is not configured", () => {
		const { result } = renderHook(() =>
			useNewCaseImageLimit(attachments(null), 0)
		);
		expect(result.current.uploadPasted).toBeNull();
	});
});
