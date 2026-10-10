import type { ConnectionTestResult } from "@automationstack/api/auth/casdoor/test-connection";
import { useMutation } from "@tanstack/react-query";
import { useCallback, useState } from "react";

import type { ConnectionChecks } from "@/components/auth-settings/auth-connection-checks-meta";
import {
	type AuthSettingsFormValues,
	toAuthSettingsSaveInput,
} from "@/components/auth-settings/auth-settings-form-values";
import { orpc } from "@/utils/orpc";

/** 「测试连接」按钮和保存失败时的分步结果（plan 021 §10.6 第 6 项）。 */
export function useAuthConnectionTest() {
	const [checks, setChecks] = useState<ConnectionChecks | null>(null);
	const test = useMutation(
		orpc.authSettings.testConnection.mutationOptions({
			meta: { suppressErrorToast: true },
			onSuccess: (result) => setChecks({ ...result, source: "test" }),
		})
	);
	const { mutate, reset } = test;

	const run = useCallback(
		(values: AuthSettingsFormValues) => {
			setChecks(null);
			// 服务端只读取与连接有关的字段，其他字段被忽略。
			mutate(toAuthSettingsSaveInput(values));
		},
		[mutate]
	);
	const showSaveResult = useCallback(
		(result: ConnectionTestResult) => {
			reset();
			setChecks({ ...result, source: "save", testedAt: null });
		},
		[reset]
	);

	return {
		checks,
		error: test.error?.message ?? null,
		run,
		showSaveResult,
		testing: test.isPending,
	};
}
