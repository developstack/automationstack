/** biome-ignore-all lint/suspicious/noConsole: 运维脚本的控制台输出就是它的交付物 */
/* eslint-disable no-console */

// 把认证方式改回 local（plan 021 §10.5 第 5 项）。
// 用于 Casdoor 配置错误、所有人都不能登录时的恢复。在 pod 中用 tsx 执行。

import { runAuthSetLocal } from "../apps/server/src/auth/auth-set-local-core";
import {
	forceLocalAuthProvider,
	getAuthSettingsRow,
} from "../packages/db/src/repositories/auth-settings-repository";
import { env } from "../packages/env/src/server";

const ARGV_OFFSET = 2;
const EXIT_FAILURE = 1;

async function main(): Promise<void> {
	const result = await runAuthSetLocal(process.argv.slice(ARGV_OFFSET), {
		envDefaults: {
			adminRole: env.CASDOOR_ADMIN_ROLE ?? null,
			clientId: env.CASDOOR_CLIENT_ID ?? null,
			issuer: env.CASDOOR_ISSUER ?? null,
			organization: env.CASDOOR_ORGANIZATION ?? null,
			projectAdminRole: env.CASDOOR_PROJECT_ADMIN_ROLE,
			redirectUrl: env.CASDOOR_REDIRECT_URL ?? null,
		},
		envProvider: env.AUTH_PROVIDER,
		forceLocal: forceLocalAuthProvider,
		getRow: getAuthSettingsRow,
		log: console.log,
		warn: console.warn,
	});
	if (result.kind === "error") {
		console.error(result.message);
		process.exit(EXIT_FAILURE);
	}
}

main()
	.then(() => process.exit(0))
	.catch((error: unknown) => {
		console.error(error);
		process.exit(EXIT_FAILURE);
	});
