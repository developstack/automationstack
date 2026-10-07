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

describe("entity node ids", () => {
	it("round-trips project / module / case ids", () => {
		expect(decodeMindmapNodeId(encodeProjectNodeId("p1"))).toEqual({
			id: "p1",
			kind: "project",
		});
		expect(decodeMindmapNodeId(encodeModuleNodeId("m1"))).toEqual({
			id: "m1",
			kind: "module",
		});
		expect(decodeMindmapNodeId(encodeCaseNodeId(CASE_ID))).toEqual({
			id: CASE_ID,
			kind: "case",
		});
	});

	it("keeps the kind predicates in sync with the decoder", () => {
		expect(isProjectNodeId(encodeProjectNodeId("p1"))).toBe(true);
		expect(isModuleNodeId(encodeModuleNodeId("m1"))).toBe(true);
		expect(isCaseNodeId(encodeCaseNodeId(CASE_ID))).toBe(true);
		expect(isCaseNodeId(encodeStepNodeId(CASE_ID, STEP_ID))).toBe(false);
	});
});

describe("step and expected node ids", () => {
	it("round-trips both composite kinds", () => {
		expect(decodeMindmapNodeId(encodeStepNodeId(CASE_ID, STEP_ID))).toEqual({
			caseId: CASE_ID,
			kind: "step",
			stepId: STEP_ID,
		});
		expect(decodeMindmapNodeId(encodeExpectedNodeId(CASE_ID, STEP_ID))).toEqual(
			{
				caseId: CASE_ID,
				kind: "expected",
				stepId: STEP_ID,
			}
		);
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

	it("survives a step id that itself contains the separator", () => {
		const nodeId = encodeStepNodeId(CASE_ID, "a:b");
		expect(decodeMindmapNodeId(nodeId)).toEqual({
			caseId: CASE_ID,
			kind: "step",
			stepId: "a:b",
		});
	});
});

describe("malformed ids", () => {
	const malformed = [
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
	];

	it.each(malformed)("decodes %j to null", (nodeId) => {
		expect(decodeMindmapNodeId(nodeId)).toBeNull();
	});
});
