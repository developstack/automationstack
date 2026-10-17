import { describe, expect, it } from "vitest";

import { caseContentPatchSchema, importCaseSchema } from "../schemas/case";
import {
	foreignScreenshotIds,
	stepScreenshotIds,
} from "./case-step-screenshots";

const shot = (n: number) =>
	`00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const step = (groups: {
	actionScreenshots?: string[];
	expectedScreenshots?: string[];
}) => ({ expected: "", id: "s1", step: "", ...groups });

describe("stepScreenshotIds / foreignScreenshotIds", () => {
	const steps = [
		step({ actionScreenshots: [shot(1)], expectedScreenshots: [shot(2)] }),
		step({}),
		step({ expectedScreenshots: [shot(2), shot(3)] }),
	];

	it("lists every id of both groups once, in order, and treats a missing group as empty", () => {
		expect(stepScreenshotIds(steps)).toEqual([shot(1), shot(2), shot(3)]);
		expect(stepScreenshotIds(undefined)).toEqual([]);
	});

	it.each([
		["all owned", [shot(1), shot(2), shot(3)], []],
		["one foreign in each group", [shot(2)], [shot(1), shot(3)]],
		["none owned", [], [shot(1), shot(2), shot(3)]],
	])("%s", (_name, owned, expected) => {
		expect(foreignScreenshotIds(steps, new Set(owned))).toEqual(expected);
	});
});

describe("step screenshot schema", () => {
	const nine = Array.from({ length: 9 }, (_, index) => shot(index));

	it.each<[string, unknown, boolean]>([
		["accepts a step without screenshots", step({}), true],
		[
			"accepts 9 screenshots in each group",
			step({ actionScreenshots: nine, expectedScreenshots: nine }),
			true,
		],
		...(["actionScreenshots", "expectedScreenshots"] as const).flatMap(
			(key) =>
				[
					[`rejects 10 ${key}`, step({ [key]: [...nine, shot(9)] }), false],
					[
						`rejects a duplicate id in ${key}`,
						step({ [key]: [shot(1), shot(1)] }),
						false,
					],
					[
						`rejects an id that is not a uuid in ${key}`,
						step({ [key]: ["local:1"] }),
						false,
					],
				] as [string, unknown, boolean][]
		),
	])("%s", (_name, value, ok) => {
		const parsed = caseContentPatchSchema.safeParse({ steps: [value] });
		expect(parsed.success).toBe(ok);
	});

	it("names the group in the error message", () => {
		const parsed = caseContentPatchSchema.safeParse({
			steps: [step({ expectedScreenshots: [...nine, shot(9)] })],
		});
		expect(parsed.error?.issues[0]?.message).toBe("每个步骤最多 9 张预期截图");
	});

	it("import drops both groups, so external writers keep the stored screenshots", () => {
		const parsed = importCaseSchema.parse({
			moduleId: shot(0),
			name: "导入的用例",
			steps: [
				step({ actionScreenshots: [shot(1)], expectedScreenshots: [shot(2)] }),
			],
		});
		expect(parsed.steps).toEqual([step({})]);
	});
});
