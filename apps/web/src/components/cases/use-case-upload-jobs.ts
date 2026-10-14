import { useMemo, useState } from "react";

/**
 * 一张粘贴的图片的上传任务。上传成功后任务消失，占位换成附件引用。
 * 失败的任务保留占位，用户可以重试或移除。
 */
export type CaseUploadJob =
	| { fileName: string; progress: number; status: "queued" | "uploading" }
	| { fileName: string; reason: string; retryable: boolean; status: "failed" };

export type CaseUploadJobs = ReadonlyMap<string, CaseUploadJob>;

export interface CaseUploadJobActions {
	fail: (token: string, reason: string, retryable: boolean) => void;
	progress: (token: string, fraction: number) => void;
	queue: (token: string, fileName: string) => void;
	remove: (token: string) => void;
	start: (token: string) => void;
}

function withJob(
	jobs: CaseUploadJobs,
	token: string,
	update: (job: CaseUploadJob) => CaseUploadJob | null
): CaseUploadJobs {
	const job = jobs.get(token);
	if (job === undefined) {
		return jobs;
	}
	const next = update(job);
	if (next === job) {
		return jobs;
	}
	const copy = new Map(jobs);
	if (next === null) {
		copy.delete(token);
	} else {
		copy.set(token, next);
	}
	return copy;
}

export function useCaseUploadJobs() {
	const [jobs, setJobs] = useState<CaseUploadJobs>(() => new Map());

	const actions = useMemo<CaseUploadJobActions>(
		() => ({
			fail: (token, reason, retryable) =>
				setJobs((prev) =>
					withJob(prev, token, (job) => ({
						fileName: job.fileName,
						reason,
						retryable,
						status: "failed",
					}))
				),
			progress: (token, fraction) =>
				setJobs((prev) =>
					withJob(prev, token, (job) =>
						job.status === "uploading" && job.progress !== fraction
							? { ...job, progress: fraction }
							: job
					)
				),
			queue: (token, fileName) =>
				setJobs((prev) =>
					new Map(prev).set(token, { fileName, progress: 0, status: "queued" })
				),
			remove: (token) => setJobs((prev) => withJob(prev, token, () => null)),
			start: (token) =>
				setJobs((prev) =>
					withJob(prev, token, (job) => ({
						fileName: job.fileName,
						progress: 0,
						status: "uploading",
					}))
				),
		}),
		[]
	);

	return { actions, jobs };
}

export function hasActiveCaseUploads(jobs: CaseUploadJobs): boolean {
	for (const job of jobs.values()) {
		if (job.status !== "failed") {
			return true;
		}
	}
	return false;
}
