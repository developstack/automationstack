import { fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { VersionViewer } from "@/components/versions/version-viewer";
import { renderWithQuery } from "@/test-dom-fixtures";

const getVersion = vi.hoisted(() =>
	vi.fn<() => Promise<unknown>>(() => Promise.reject(new Error("断网")))
);

vi.mock("@/utils/orpc", async () => {
	const { skipToken } = await import("@tanstack/react-query");
	return {
		orpc: {
			caseAttachments: {
				list: {
					queryOptions: ({ input }: { input: unknown }) => ({
						queryFn: () => Promise.resolve([]),
						queryKey: ["caseAttachments", "list", input],
					}),
				},
			},
			cases: {
				getVersion: {
					queryOptions: ({ input }: { input: unknown }) => ({
						queryFn: input === skipToken ? skipToken : getVersion,
						queryKey: ["cases", "getVersion", input],
					}),
				},
			},
		},
	};
});

describe("VersionViewer：版本内容加载失败", () => {
	it("shows the error and loads only the failed version again", async () => {
		renderWithQuery(
			<VersionViewer baseVersion={null} caseId="c1" targetVersion={2} />
		);
		expect(await screen.findByText("版本内容加载失败")).toBeTruthy();
		const calls = getVersion.mock.calls.length;
		fireEvent.click(screen.getByRole("button", { name: "重试" }));
		await waitFor(() =>
			expect(getVersion.mock.calls.length).toBeGreaterThan(calls)
		);
	});
});
