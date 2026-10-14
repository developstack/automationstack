import { describe, expect, it } from "vitest";

import {
	decodeMindmapNodeId,
	encodeCaseNodeId,
	encodeExpectedNodeId,
	encodeModuleNodeId,
	encodeProjectNodeId,
	encodeStepNodeId,
	isCaseNodeId,
	isModuleNodeId,
	isProjectNodeId,
	isStepNodeRef,
} from "./mindmap-node-id.ts";

const CASE_ID = "6f0d0b0e-0000-4000-8000-000000000001";
const STEP_ID = "s1";
const STEP_REF = { caseId: CASE_ID, kind: "step", stepId: STEP_ID };

describe("node ids", () => {
	it.each([
		["project id", encodeProjectNodeId("p1"), { id: "p1", kind: "project" }],
		["module id", encodeModuleNodeId("m1"), { id: "m1", kind: "module" }],
		["case id", encodeCaseNodeId(CASE_ID), { id: CASE_ID, kind: "case" }],
		["step id", encodeStepNodeId(CASE_ID, STEP_ID), STEP_REF],
		[
			"expected id",
			encodeExpectedNodeId(CASE_ID, STEP_ID),
			{ ...STEP_REF, kind: "expected" },
		],
		[
			"step id that itself contains the separator",
			encodeStepNodeId(CASE_ID, "a:b"),
			{ ...STEP_REF, stepId: "a:b" },
		],
	])("round-trips a %s", (_name, nodeId, ref) => {
		expect(decodeMindmapNodeId(nodeId)).toEqual(ref);
	});

	it("keeps the kind predicates in sync with the decoder", () => {
		expect(isProjectNodeId(encodeProjectNodeId("p1"))).toBe(true);
		expect(isModuleNodeId(encodeModuleNodeId("m1"))).toBe(true);
		expect(isCaseNodeId(encodeCaseNodeId(CASE_ID))).toBe(true);
		expect(isCaseNodeId(encodeStepNodeId(CASE_ID, STEP_ID))).toBe(false);
	});

	it("keeps step and expected ids distinct for the same step", () => {
		expect(encodeStepNodeId(CASE_ID, STEP_ID)).not.toBe(
			encodeExpectedNodeId(CASE_ID, STEP_ID)
		);
	});

	it("narrows the ref union with isStepNodeRef", () => {
		const step = decodeMindmapNodeId(encodeStepNodeId(CASE_ID, STEP_ID));
		const module = decodeMindmapNodeId(encodeModuleNodeId("m1"));
		expect(step !== null && isStepNodeRef(step)).toBe(true);
		expect(module !== null && isStepNodeRef(module)).toBe(false);
	});

	it.each([
		"",
		"c:",
		"m:",
		"p:",
		"s:",
		"x:",
		"s:onlycase",
		"x:onlycase",
		"s::step",
		"x::step",
		`s:${CASE_ID}:`,
		`x:${CASE_ID}:`,
		"z:whatever",
		"case:123",
		CASE_ID,
	])("decodes malformed id %j to null", (nodeId) => {
		expect(decodeMindmapNodeId(nodeId)).toBeNull();
	});
});
