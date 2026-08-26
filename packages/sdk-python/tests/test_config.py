"""配置解析（§5.1 / D31）。环境变量名必须与 Node 版逐字一致。"""

from __future__ import annotations

import pytest

from automationstack_sdk import ReporterConfigError, resolve_reporter_config

ENV = {
    "AS_BASE_URL": "https://qa.example.com/",
    "AS_PROJECT": "11111111-2222-4333-8444-555555555555",
    # 占位符，不是真实凭据。
    "AS_TOKEN": "as_live_xxxxxxxx",
}


def test_reads_the_three_required_env_vars() -> None:
    config = resolve_reporter_config(env=ENV)
    assert config.project_id == ENV["AS_PROJECT"]
    assert config.token == ENV["AS_TOKEN"]


def test_strips_trailing_slash_from_base_url() -> None:
    """不削的话会拼出 `//ingest/...`，反代 301 之后 Authorization 头可能丢，
    表现是莫名其妙的 401。"""
    assert resolve_reporter_config(env=ENV).base_url == "https://qa.example.com"
    assert (
        resolve_reporter_config(env={**ENV, "AS_BASE_URL": "https://x.dev///"}).base_url
        == "https://x.dev"
    )


@pytest.mark.parametrize(
    ("missing", "hint"), [("AS_TOKEN", "AS_TOKEN"), ("AS_PROJECT", "AS_PROJECT"), ("AS_BASE_URL", "AS_BASE_URL")]
)
def test_missing_config_raises_immediately(missing: str, hint: str) -> None:
    """缺 token 这种事必须在跑测试之前炸，而不是等跑完二十分钟。"""
    env = {k: v for k, v in ENV.items() if k != missing}
    with pytest.raises(ReporterConfigError) as excinfo:
        resolve_reporter_config(env=env)
    assert hint in str(excinfo.value)


def test_explicit_beats_env() -> None:
    """两者都在时以代码里写的为准，否则同一份配置在本机和 CI 上表现不同。"""
    config = resolve_reporter_config(env=ENV, project_id="explicit")
    assert config.project_id == "explicit"


def test_optional_env_vars_land_on_the_config() -> None:
    """AS_BRANCH / AS_COMMIT_SHA / AS_CI_URL 只影响失败清单上的「怎么复现」。"""
    config = resolve_reporter_config(
        env={
            **ENV,
            "AS_BRANCH": "feat/pay",
            "AS_CI_URL": "https://ci.example.com/job/12",
            "AS_COMMIT_SHA": "a3f9c2",
        }
    )
    assert (config.branch, config.commit_sha) == ("feat/pay", "a3f9c2")
    assert config.ci_url == "https://ci.example.com/job/12"


def test_run_ids_is_not_an_env_var() -> None:
    """runIds 是每次调用的收窄白名单，**不是**配置项（D31）。

    放进环境变量它就变成了每迭代要维护的东西，第一次会忘，第二次就没人用了。
    """
    assert resolve_reporter_config(env={**ENV, "AS_RUN_IDS": "r1,r2"}).run_ids is None
    assert resolve_reporter_config(env=ENV, run_ids=["r1"]).run_ids == ["r1"]
