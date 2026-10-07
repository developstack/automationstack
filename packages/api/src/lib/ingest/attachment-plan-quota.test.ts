import { expect, test } from "vitest";

import {
	MAX_AUTOMATION_ATTACHMENT_BYTES_PER_RUN,
	MAX_AUTOMATION_ATTACHMENTS_PER_RUN,
} from "./attachment-contract";
import {
	CASE_A,
	MIB,
	manyRows,
	RUN_CASE_TWO,
	RUN_TWO,
	screenshot,
	targetRow,
} from "./attachment-fixtures";
import { planAttachmentUploads } from "./attachment-reconcile";

test("条数配额：超出的那些逐条拒绝，前面的照常签", () => {
	const overflow = 3;
	const total = MAX_AUTOMATION_ATTACHMENTS_PER_RUN + overflow;
	const planned = planAttachmentUploads({
		attachments: Array.from({ length: total }, (_unused, index) =>
			screenshot(`S${index}`)
		),
		rows: manyRows(total),
		runIds: null,
	});
	expect(planned.groups[0]?.items).toHaveLength(
		MAX_AUTOMATION_ATTACHMENTS_PER_RUN
	);
	expect(planned.rejected).toHaveLength(overflow);
	expect(planned.rejected[0]?.index).toBe(MAX_AUTOMATION_ATTACHMENTS_PER_RUN);
	expect(planned.rejected[0]?.reason).toContain("配额已用完");
	expect(planned.rejected[0]?.runName).toBe("冒烟");
});

test("字节配额：一旦装不下，其后的全部拒绝，不去捡还能塞下的小文件", () => {
	const perFile = 20 * MIB;
	const fits = Math.floor(MAX_AUTOMATION_ATTACHMENT_BYTES_PER_RUN / perFile);
	const total = fits + 2;
	const planned = planAttachmentUploads({
		attachments: Array.from({ length: total }, (_unused, index) =>
			screenshot(`S${index}`, index === total - 1 ? 1024 : perFile)
		),
		rows: manyRows(total),
		runIds: null,
	});
	expect(planned.groups[0]?.items).toHaveLength(fits);
	expect(planned.rejected.map((entry) => entry.index)).toEqual([
		fits,
		fits + 1,
	]);
});

test("配额按单个任务各算一份，横跨两个任务不会缩水", () => {
	const total = MAX_AUTOMATION_ATTACHMENTS_PER_RUN;
	const rows = manyRows(total).flatMap((row, index) => [
		row,
		targetRow({
			caseId: CASE_A,
			runCaseId: `${RUN_CASE_TWO.slice(0, -3)}${String(index).padStart(3, "0")}`,
			runId: RUN_TWO,
			runName: "回归",
			sourceRef: `S${index}`,
		}),
	]);
	const planned = planAttachmentUploads({
		attachments: Array.from({ length: total }, (_unused, index) =>
			screenshot(`S${index}`)
		),
		rows,
		runIds: null,
	});
	expect(planned.rejected).toEqual([]);
	expect(planned.groups.map((group) => group.items.length)).toEqual([
		total,
		total,
	]);
});
