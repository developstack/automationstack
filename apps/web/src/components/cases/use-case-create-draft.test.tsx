import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { emptyCaseFormValues } from "@/components/cases/case-meta";
import { useCaseCreateDraft } from "@/components/cases/use-case-create-draft";

vi.mock("@/components/auth/use-session", () => ({
	useSession: () => ({ isPending: false, user: { username: "alice" } }),
}));
vi.mock("@/components/cases/use-case-draft-attachments", () => ({
	useCaseDraftAttachments: () => ({ pending: [] }),
}));

describe("useCaseCreateDraft：新用例的维护人", () => {
	it("默认是当前用户；没有其他改动时不算改动；清空草稿后还是当前用户", () => {
		const { result } = renderHook(() =>
			useCaseCreateDraft("project-1", "module-1", undefined)
		);
		const expected = emptyCaseFormValues("alice");
		expect(result.current.values).toEqual(expected);
		expect(result.current.baseline).toEqual(expected);

		act(() =>
			result.current.setValues({ ...expected, maintainer: "bob", name: "x" })
		);
		act(() => result.current.discard());
		expect(result.current.values.maintainer).toBe("alice");
	});
});
