"""唯一的网络层。**只有标准库的 urllib，没有 requests，也没有 boto3**（§7.3 / D28）。

附件走预签名 PUT，三种语言的 SDK 都只需要一个 HTTP 客户端。引一个 S3 SDK 会给
用户的环境加一串传递依赖、还会跟他自己那份撞版本，而它换来的能力这里一样都用不上。
连 `requests` 都没引是同一条理由再往前一步：QA 的测试环境常常是被 pip 锁死的，
多一个依赖就多一次「装不上」的可能，而我们要的只是「发个 POST」。

`Transport` 这一层抽象存在的唯一目的是**让测试不连网**：假 transport 直接返回
构造好的响应，整个测试套件里没有一个 socket。（Node 版那边对应的是 `FetchLike`。）
"""

from __future__ import annotations

import json
import time
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from typing import Any, Callable, Dict, Optional

from .errors import IngestHttpError

_DEFAULT_MAX_ATTEMPTS = 3
_DEFAULT_TIMEOUT_SECONDS = 30.0
_RETRY_BASE_DELAY_SECONDS = 0.5
_HTTP_TOO_MANY_REQUESTS = 429
_HTTP_SERVER_ERROR_FLOOR = 500


@dataclass(frozen=True)
class HttpRequest:
    url: str
    method: str
    headers: Dict[str, str] = field(default_factory=dict)
    body: Optional[bytes] = None
    timeout_seconds: float = _DEFAULT_TIMEOUT_SECONDS


@dataclass(frozen=True)
class HttpResponse:
    status: int
    body: bytes


Transport = Callable[[HttpRequest], HttpResponse]


def urllib_transport(request: HttpRequest) -> HttpResponse:
    """默认实现。

    ⚠️ 4xx/5xx 在这里**不抛**，而是照常返回 `HttpResponse`：urllib 默认把它们
    抛成 `HTTPError`，那会让「服务端明确拒了」和「根本没连上」变成同一种异常，
    而这两件事的重试策略正好相反（见 `_is_retriable_status`）。
    """
    raw = urllib.request.Request(  # noqa: S310 — url 来自用户自己配的 AS_BASE_URL
        request.url, data=request.body, headers=request.headers, method=request.method
    )
    try:
        with urllib.request.urlopen(raw, timeout=request.timeout_seconds) as response:
            return HttpResponse(status=response.status, body=response.read())
    except urllib.error.HTTPError as error:
        return HttpResponse(status=error.code, body=error.read())


def _is_retriable_status(status: int) -> bool:
    """只重试「再试一次可能就好了」的那些：429、5xx（网络层异常在调用处兜）。

    4xx **一律不重试**——请求体本身有问题，重发一百次还是同一条 400，
    而重试会把「SDK 发错了」伪装成「网络不稳」，人在日志里看到的是超时。
    重试之所以安全，是因为幂等键在请求体里、跨重试是同一个（§5.2）：
    服务端要么整轮重跑（`completedAt is null`），要么直接返回缓存的对账单。
    """
    return status == _HTTP_TOO_MANY_REQUESTS or status >= _HTTP_SERVER_ERROR_FLOOR


def _read_server_message(body: bytes) -> Optional[str]:
    """服务端的错误体固定是 `{ error, message }`；取不出来就返回 None，绝不自己编一句。"""
    try:
        parsed = json.loads(body.decode("utf-8"))
    except (ValueError, UnicodeDecodeError):
        return None
    if isinstance(parsed, dict) and isinstance(parsed.get("message"), str):
        return parsed["message"]
    return None


class IngestHttpClient:
    def __init__(
        self,
        *,
        base_url: str,
        token: str,
        transport: Optional[Transport] = None,
        max_attempts: int = _DEFAULT_MAX_ATTEMPTS,
        sleep: Optional[Callable[[float], None]] = None,
        timeout_seconds: float = _DEFAULT_TIMEOUT_SECONDS,
    ) -> None:
        self._base_url = base_url
        self._token = token
        self._transport = transport or urllib_transport
        self._max_attempts = max_attempts
        self._sleep = sleep or time.sleep
        self._timeout_seconds = timeout_seconds

    def post_json(self, path: str, body: Any) -> Dict[str, Any]:
        """ingest 端点。返回体由调用方按契约当成对应的对账单类型用。"""
        url = "{0}{1}".format(self._base_url, path)
        response = self._send(
            HttpRequest(
                body=json.dumps(body, ensure_ascii=False).encode("utf-8"),
                headers={
                    "authorization": "Bearer {0}".format(self._token),
                    "content-type": "application/json",
                },
                method="POST",
                timeout_seconds=self._timeout_seconds,
                url=url,
            )
        )
        return json.loads(response.body.decode("utf-8"))

    def put_binary(self, url: str, content_type: str, body: bytes) -> None:
        """直传 R2 的那一步。

        **不带 Authorization**：签名已经在 URL 里，多带一个 Authorization 头
        会让部分 S3 兼容实现按「双重鉴权」直接 400。
        `content_type` 必须逐字用 presign 回来的值（它进了签名的 `SignedHeaders`）。
        """
        self._send(
            HttpRequest(
                body=body,
                headers={"content-type": content_type},
                method="PUT",
                timeout_seconds=self._timeout_seconds,
                url=url,
            )
        )

    def _send(self, request: HttpRequest) -> HttpResponse:
        last_error: Optional[Exception] = None
        for attempt in range(1, self._max_attempts + 1):
            retriable, response, error = self._attempt(request)
            if response is not None:
                return response
            last_error = error
            if not retriable or attempt == self._max_attempts:
                raise error  # type: ignore[misc]
            self._sleep(_RETRY_BASE_DELAY_SECONDS * (2 ** (attempt - 1)))
        raise last_error or RuntimeError(
            "{0} 一次都没有尝试（max_attempts 配成了 0？）".format(request.url)
        )

    def _attempt(self, request: HttpRequest):
        try:
            response = self._transport(request)
        except Exception as error:  # noqa: BLE001 — 连不上、DNS 失败、超时都在这
            return True, None, error
        if 200 <= response.status < 300:
            return False, response, None
        return (
            _is_retriable_status(response.status),
            None,
            IngestHttpError(
                response.status, _read_server_message(response.body), request.url
            ),
        )
