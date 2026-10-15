import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
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

describe("useCaseEditAttachments：编辑区的图片地址、文件名和步骤截图", () => {
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
		"gives the file name of each attachment; with R2 configured %s screenshots are available %s",
		async (configured, available) => {
			storage.configured = configured;
			const { result } = renderHook(() => useCaseEditAttachments(CASE_ID), {
				wrapper: createQueryWrapper(),
			});
			await waitFor(() =>
				expect(result.current.fileNames.get(ATTACHMENT_ID)).toBe("登录页.png")
			);
			await waitFor(() =>
				expect(result.current.screenshots.available).toBe(available)
			);
		}
	);
});
