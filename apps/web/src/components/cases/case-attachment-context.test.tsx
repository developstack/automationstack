import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import {
	type CaseAttachmentContextValue,
	CaseAttachmentProvider,
	useCaseAttachments,
	useCaseAttachmentUrls,
	useCaseEditAttachments,
} from "@/components/cases/case-attachment-context";
import { createQueryWrapper } from "@/test-dom-fixtures";

const CASE_ID = "33333333-3333-4333-8333-333333333333";
const ATTACHMENT_ID = "44444444-4444-4444-8444-444444444444";

const storage = vi.hoisted(() => ({ configured: true }));

vi.mock("@/utils/orpc", () => ({
	client: {},
	orpc: {
		caseAttachments: {
			key: () => ["caseAttachments"],
			list: {
				queryOptions: () => ({
					queryFn: () =>
						Promise.resolve([
							{
								attachment: { fileName: "登录页.png", id: ATTACHMENT_ID },
								url: "https://r2.example/login.png",
							},
						]),
					queryKey: ["caseAttachments", "list", CASE_ID],
				}),
			},
			storageStatus: {
				queryOptions: () => ({
					queryFn: () => Promise.resolve({ configured: storage.configured }),
					queryKey: ["caseAttachments", "storageStatus"],
				}),
			},
		},
	},
}));

describe("useCaseEditAttachments：编辑区的图片地址和粘贴上传", () => {
	it("maps attachment ids to URLs for read-only views", async () => {
		const { result } = renderHook(() => useCaseAttachmentUrls(CASE_ID), {
			wrapper: createQueryWrapper(),
		});
		await waitFor(() =>
			expect(result.current.get(ATTACHMENT_ID)).toBe(
				"https://r2.example/login.png"
			)
		);
	});

	it.each([
		[true, true],
		[false, false],
	])(
		"shows the saved images; with R2 configured %s pasting is available %s",
		async (configured, available) => {
			storage.configured = configured;
			const { result } = renderHook(() => useCaseEditAttachments(CASE_ID), {
				wrapper: createQueryWrapper(),
			});
			await waitFor(() =>
				expect(result.current.imageUrls.get(ATTACHMENT_ID)).toBe(
					"https://r2.example/login.png"
				)
			);
			await waitFor(() =>
				expect(result.current.uploadPasted !== null).toBe(available)
			);
		}
	);
});

describe("useCaseAttachments：读取外层提供的图片和上传任务", () => {
	it("has no images and accepts no pasted images without a provider", () => {
		const { result } = renderHook(() => useCaseAttachments());
		expect(result.current.imageUrls.size).toBe(0);
		expect(result.current.uploadPasted).toBeNull();
		expect(result.current.uploading).toBe(false);
		// 默认的重试和移除什么也不做
		result.current.retryUpload("t1");
		result.current.discardUpload("t1");
	});

	it("returns the value of the nearest provider", () => {
		const value = {
			imageUrls: new Map([[ATTACHMENT_ID, "https://r2.example/a.png"]]),
		} as unknown as CaseAttachmentContextValue;
		const wrapper = ({ children }: { children: ReactNode }) => (
			<CaseAttachmentProvider value={value}>{children}</CaseAttachmentProvider>
		);
		const { result } = renderHook(() => useCaseAttachments(), { wrapper });
		expect(result.current).toBe(value);
	});
});
