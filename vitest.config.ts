import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const resolveFromRoot = (relative: string): string =>
	fileURLToPath(new URL(relative, import.meta.url));

export default defineConfig({
	test: {
		projects: [
			{
				resolve: {
					alias: {
						"@": resolveFromRoot("./apps/web/src"),
					},
				},
				test: {
					environment: "node",
					include: ["src/**/*.test.ts"],
					name: "web",
					root: resolveFromRoot("./apps/web"),
				},
			},
			{
				test: {
					environment: "node",
					include: ["src/**/*.test.ts"],
					name: "api",
					root: resolveFromRoot("./packages/api"),
				},
			},
			{
				test: {
					environment: "node",
					include: ["src/**/*.test.ts"],
					name: "server",
					root: resolveFromRoot("./apps/server"),
				},
			},
			{
				test: {
					environment: "node",
					include: ["src/**/*.test.ts"],
					name: "db",
					root: resolveFromRoot("./packages/db"),
				},
			},
			{
				test: {
					environment: "node",
					include: ["sdk-*/src/**/*.test.ts"],
					name: "sdk",
					root: resolveFromRoot("./packages"),
				},
			},
		],
	},
});
