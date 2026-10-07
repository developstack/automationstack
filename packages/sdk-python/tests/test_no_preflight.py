"""§7.2 第 5 条的守卫：**SDK 不做预检**。

正常路径只有一次 `POST /ingest/executions`——跑之前没有任何需要人确认的配置，
归属由用例的 sourceRef 自己解析（§3.7）。`GET /ingest/runs` 只是把候选摆出来
给人看，SDK 不依赖它就能上报。

这条规则很容易在某次「加个友好提示」的改动里被悄悄破坏（先查一下有哪些任务，
再决定报不报），而破坏之后没有任何测试会红——它不改变任何返回值。
所以这里直接扫源码：除了声明它的 `route_paths.py` 与把它转出去给人写排查
脚本的 `__init__.py`，任何生产文件都不许提到它。

⚠️ 用 `ast` 而不是正则去注释：本包的注释里到处在解释「为什么不调它」，
正则删注释在 Python 里还得处理三引号字符串，反而更容易漏。走 AST 的话
「注释与 docstring 天然不在树上」这件事是语言保证的。
"""

from __future__ import annotations

import ast
import pathlib
from typing import Set, Tuple

_PACKAGE_DIR = (
    pathlib.Path(__file__).resolve().parents[1] / "src" / "automationstack_sdk"
)
_ALLOWED = {"__init__.py", "route_paths.py"}
_FORBIDDEN_NAME = "INGEST_RUNS_ROUTE"
_FORBIDDEN_PATH = "/ingest/runs"


def _docstring_ids(tree: ast.AST) -> Set[int]:
    """docstring 也是 AST 上的字符串常量，得单独摘出来放行。"""
    found = set()
    for node in ast.walk(tree):
        body = getattr(node, "body", None)
        if not isinstance(body, list) or not body:
            continue
        first = body[0]
        if (
            isinstance(first, ast.Expr)
            and isinstance(first.value, ast.Constant)
            and isinstance(first.value.value, str)
        ):
            found.add(id(first.value))
    return found


def _code_symbols(path: pathlib.Path) -> Tuple[Set[str], Set[str]]:
    tree = ast.parse(path.read_text(encoding="utf-8"))
    skip = _docstring_ids(tree)
    names: Set[str] = set()
    strings: Set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Name):
            names.add(node.id)
        elif isinstance(node, ast.Attribute):
            names.add(node.attr)
        elif isinstance(node, ast.alias):
            names.add(node.name.split(".")[-1])
        elif isinstance(node, ast.Constant) and isinstance(node.value, str):
            if id(node) not in skip:
                strings.add(node.value)
    return names, strings


def test_no_production_file_references_the_runs_route() -> None:
    """生产代码里没有第二处提到 GET /ingest/runs。"""
    offenders = []
    for path in sorted(_PACKAGE_DIR.glob("*.py")):
        if path.name in _ALLOWED:
            continue
        names, strings = _code_symbols(path)
        if _FORBIDDEN_NAME in names or any(_FORBIDDEN_PATH in s for s in strings):
            offenders.append(path.name)
    assert offenders == []


def test_runtime_dependencies_stay_empty() -> None:
    """运行时依赖必须是零，也不许出现任何测试框架。

    附件走预签名 PUT，只需要标准库的 urllib，不引 boto3（D28）；
    绑上任何一个测试框架就等于把本包的大版本焊死在那个框架上（§7.3）。
    """
    manifest = (
        (pathlib.Path(__file__).resolve().parents[1] / "pyproject.toml")
        .read_text(encoding="utf-8")
        .replace(" ", "")
    )
    assert "dependencies=[]" in manifest
    project_section = manifest.split("[dependency-groups]")[0]
    for framework in ("pytest", "unittest2", "nose", "robotframework", "behave"):
        assert framework not in project_section


def test_package_imports_no_third_party() -> None:
    """整个包只 import 标准库和自己——这条比读 pyproject 更硬。

    pyproject 写着零依赖但源码里 `import requests` 是完全可能发生的，
    到用户机器上才炸成 ImportError。
    """
    stdlib_ok = {
        "__future__", "ast", "atexit", "dataclasses", "datetime", "hashlib",
        "json", "os", "re", "sys", "time", "typing", "urllib", "uuid",
    }
    for path in sorted(_PACKAGE_DIR.glob("*.py")):
        tree = ast.parse(path.read_text(encoding="utf-8"))
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                for alias in node.names:
                    assert alias.name.split(".")[0] in stdlib_ok, path.name
            elif isinstance(node, ast.ImportFrom) and node.level == 0:
                assert (node.module or "").split(".")[0] in stdlib_ok, path.name
