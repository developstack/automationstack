import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
	chmodSync,
	mkdtempSync,
	readFileSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

const SCRIPT = new URL("./prod-env.sh", import.meta.url).pathname;
const ROOT = new URL("../", import.meta.url).pathname;
const KEY_LINE = /^([A-Za-z_][A-Za-z0-9_]*)=/;
const ADDED = /从模板补入/;
const ADDED_WEB_PORT = /从模板补入.*WEB_PORT/;
const APPENDED_BLOCK = /\n# 端口\nWEB_PORT=3001\n$/;
const APPENDED_ON_NEW_LINE = /^DATABASE_URL=x\n\n# ──/;
const REQUIRED_EMPTY = /必填键没有值：DATABASE_URL/;
const EXTRA_KEY = /模板中没有这些键.*OLD_KEY/;
const READABLE = /其他用户可以读取/;

const TEMPLATE = `# 模板说明

# [必填] 数据库
DATABASE_URL=

# 端口
WEB_PORT=3001
`;

function setup(target) {
	const dir = mkdtempSync(join(tmpdir(), "prod-env-"));
	const paths = { target: join(dir, ".env.prod"), template: join(dir, "t") };
	writeFileSync(paths.template, TEMPLATE);
	if (target !== undefined) {
		writeFileSync(paths.target, target);
	}
	const run = () =>
		spawnSync("bash", [SCRIPT, paths.template, paths.target], {
			encoding: "utf8",
		});
	return { ...paths, run };
}

function keysOf(file) {
	return readFileSync(join(ROOT, file), "utf8")
		.split("\n")
		.map((line) => KEY_LINE.exec(line)?.[1])
		.filter(Boolean);
}

test("生产 env 文件不存在时从模板生成，权限 600，退出码 1", () => {
	const env = setup();
	const result = env.run();
	assert.equal(result.status, 1);
	assert.equal(readFileSync(env.target, "utf8"), TEMPLATE);
	assert.equal(statSync(env.target).mode.toString(8).slice(-3), "600");
});

test("补入缺的键和它的注释，已有的值不变，再次执行不重复补入", () => {
	const original = "DATABASE_URL='postgresql://u:p@db:5432/x'\n";
	const env = setup(original);
	const first = env.run();
	assert.equal(first.status, 0, first.stderr);
	assert.match(first.stdout, ADDED_WEB_PORT);
	const merged = readFileSync(env.target, "utf8");
	assert.ok(merged.startsWith(original));
	assert.match(merged, APPENDED_BLOCK);
	assert.ok(!merged.includes("# [必填] 数据库"));

	const second = env.run();
	assert.equal(second.status, 0, second.stderr);
	assert.doesNotMatch(second.stdout, ADDED);
	assert.equal(readFileSync(env.target, "utf8"), merged);
});

test("没有以换行结尾的文件，补入的内容从新的一行开始", () => {
	const env = setup("DATABASE_URL=x");
	assert.equal(env.run().status, 0);
	assert.match(readFileSync(env.target, "utf8"), APPENDED_ON_NEW_LINE);
});

for (const [value, empty] of [
	["", true],
	["''", true],
	['""', true],
	["   # 说明", true],
	["'a b'", false],
	["x # 说明", false],
	["'#'", false],
]) {
	test(`必填键的值写成 ${JSON.stringify(value)} 时${empty ? "为空" : "不为空"}`, () => {
		const env = setup(`DATABASE_URL=${value}\nWEB_PORT=1\n`);
		const result = env.run();
		assert.equal(result.status, empty ? 1 : 0, result.stderr);
		assert.equal(REQUIRED_EMPTY.test(result.stderr), empty);
	});
}

test("模板中没有的键只给警告", () => {
	const env = setup("DATABASE_URL=x\nWEB_PORT=1\nexport OLD_KEY=1\n");
	const result = env.run();
	assert.equal(result.status, 0, result.stderr);
	assert.match(result.stdout, EXTRA_KEY);
});

test("其他用户可以读取时给警告", () => {
	const env = setup("DATABASE_URL=x\nWEB_PORT=1\n");
	chmodSync(env.target, 0o644);
	assert.match(env.run().stdout, READABLE);
	chmodSync(env.target, 0o600);
	assert.doesNotMatch(env.run().stdout, READABLE);
});

test("参数不对或模板不存在时退出码 2", () => {
	assert.equal(spawnSync("bash", [SCRIPT]).status, 2);
	assert.equal(spawnSync("bash", [SCRIPT, "/nonexistent", "x"]).status, 2);
});

test("apps/server/.env.example 的每个键都在 .env.prod.example 中", () => {
	const prodKeys = new Set(keysOf(".env.prod.example"));
	const fixedByCompose = new Set([
		"CLIENT_IP_HEADER",
		"CORS_ORIGIN",
		"FILE_STORAGE_ACCEL_PREFIX",
		"FILE_STORAGE_DIR",
		"NODE_ENV",
		"PORT",
	]);
	const missing = keysOf("apps/server/.env.example").filter(
		(key) => !(fixedByCompose.has(key) || prodKeys.has(key))
	);
	assert.deepEqual(missing, []);
});
