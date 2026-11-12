import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";

/** 子串断言：失败时把完整文本打出来。 */
const includes = (text, part) => assert.ok(text.includes(part), text);

const SCRIPT = join(
	dirname(fileURLToPath(import.meta.url)),
	"build-dsh-plugin-skills.js"
);
const ROOT = mkdtempSync(join(tmpdir(), "dsh-plugin-skills-"));
after(() => rmSync(ROOT, { force: true, recursive: true }));

let counter = 0;

function writeFiles(root, files) {
	for (const [path, content] of Object.entries(files)) {
		mkdirSync(dirname(join(root, path)), { recursive: true });
		writeFileSync(join(root, path), content);
	}
}

/** 一套全新的源目录与目标目录；源目录含两个 skill。 */
function fixture() {
	counter += 1;
	const source = join(ROOT, `case-${counter}`, "source");
	const target = join(ROOT, `case-${counter}`, "target");
	writeFiles(source, {
		"testcase-authoring/references/b.md": "参考 B\n",
		"testcase-authoring/references/ignored.txt": "不复制\n",
		"testcase-authoring/SKILL.md": "地址 http://localhost:3000/mcp 结束\n",
		"testcase-migration/SKILL.md": "迁移\n",
	});
	return { source, target };
}

function run({ source, target }, ...flags) {
	return spawnSync(
		process.execPath,
		[SCRIPT, ...flags, "--source", source, "--target", target],
		{ encoding: "utf-8" }
	);
}

test("生成：只复制 SKILL.md 与 references/*.md，并替换本地开发地址", () => {
	const dirs = fixture();
	assert.equal(run(dirs).status, 0);
	assert.equal(
		readFileSync(join(dirs.target, "testcase-authoring/SKILL.md"), "utf-8"),
		"地址 https://testcase.logwing.com/mcp 结束\n"
	);
	assert.ok(
		existsSync(join(dirs.target, "testcase-authoring/references/b.md"))
	);
	assert.ok(
		!existsSync(join(dirs.target, "testcase-authoring/references/ignored.txt"))
	);
	const check = run(dirs, "--check");
	assert.equal(check.status, 0, check.stderr);
	includes(check.stdout, "一致");
});

const DRIFT = [
	[
		"内容不同",
		(target) => writeFiles(target, { "testcase-migration/SKILL.md": "旧\n" }),
	],
	["多余", (target) => writeFiles(target, { "stale/SKILL.md": "旧\n" })],
	[
		"缺少",
		(target) => rmSync(join(target, "testcase-authoring/references/b.md")),
	],
];

for (const [label, mutate] of DRIFT) {
	test(`--check 发现漂移时 exit 1，重新生成后恢复一致：${label}`, () => {
		const dirs = fixture();
		run(dirs);
		mutate(dirs.target);
		const check = run(dirs, "--check");
		assert.equal(check.status, 1);
		includes(check.stderr, label);
		assert.equal(run(dirs).status, 0);
		assert.equal(run(dirs, "--check").status, 0);
		assert.ok(!existsSync(join(dirs.target, "stale")));
	});
}

test("找不到 skill 源：--check 跳过并 exit 0，生成模式报错", () => {
	const dirs = { source: join(ROOT, "missing"), target: join(ROOT, "unused") };
	const check = run(dirs, "--check");
	assert.equal(check.status, 0);
	includes(check.stdout, "跳过漂移检查");
	const build = run(dirs);
	assert.notEqual(build.status, 0);
	includes(build.stderr, "找不到 skill 源");
	assert.ok(!existsSync(dirs.target));
});
