import { describe, expect, it } from "vitest";

import { caseContentPatchSchema, importCaseSchema } from "../schemas/case";
import {
	foreignScreenshotIds,
	stepScreenshotIds,
} from "./case-step-screenshots";

const shot = (n: number) =>
	`00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const step = (screenshots?: string[]) => ({
	expected: "",
	id: "s1",
	step: "",
	...(screenshots === undefined ? {} : { screenshots }),
});

describe("stepScreenshotIds / foreignScreenshotIds", () => {
	const steps = [step([shot(1), shot(2)]), step(), step([shot(2), shot(3)])];

	it("lists every id once, in order, and treats a missing list as empty", () => {
		expect(stepScreenshotIds(steps)).toEqual([shot(1), shot(2), shot(3)]);
		expect(stepScreenshotIds(undefined)).toEqual([]);
	});

	it.each([
		["all owned", [shot(1), shot(2), shot(3)], []],
		["one foreign", [shot(1), shot(3)], [shot(2)]],
		["none owned", [], [shot(1), shot(2), shot(3)]],
	])("%s", (_name, owned, expected) => {
		expect(foreignScreenshotIds(steps, new Set(owned))).toEqual(expected);
	});
});

describe("step screenshot schema", () => {
	const nine = Array.from({ length: 9 }, (_, index) => shot(index));

	it.each([
		["accepts an old step without screenshots", step(), true],
		["accepts 9 screenshots", step(nine), true],
		["rejects 10 screenshots", step([...nine, shot(9)]), false],
		["rejects a duplicate id", step([shot(1), shot(1)]), false],
		["rejects an id that is not a uuid", step(["local:1"]), false],
	])("%s", (_name, value, ok) => {
		const parsed = caseContentPatchSchema.safeParse({ steps: [value] });
		expect(parsed.success).toBe(ok);
	});

	it("import drops screenshots, so external writers keep the stored ones", () => {
		const parsed = importCaseSchema.parse({
			moduleId: shot(0),
			name: "导入的用例",
			steps: [step([shot(1)])],
		});
		expect(parsed.steps).toEqual([step()]);
	});
});
