#!/usr/bin/env bash
# 在本地 Casdoor 中创建 automationstack 需要的对象（plan 021 T9、T14、T17）。
#
# 只用于本地开发。脚本只接受 localhost 或 127.0.0.1 上的 Casdoor，
# 并使用 Casdoor 的内置管理员（默认口令 123）。生产环境按 T17 在控制台中手工配置。
#
# 创建的对象：
#   - 组织 CASDOOR_ORGANIZATION：密码类型 bcrypt。
#   - 应用 automationstack：属于这个组织，Is shared 关闭，注册和访客登录关闭，
#     授权类型只有 authorization_code 和 client_credentials，Token 格式 JWT。
#   - 角色 CASDOOR_ADMIN_ROLE，测试用户 alice（加入这个角色）和 bob（普通成员）。
#   - 设置了 CASDOOR_WEBHOOK_URL 时：webhook automationstack-dev，
#     请求头 X-Casdoor-Webhook-Secret 中带共享密钥。
#
# 规则（与 aidevstack cffad68 相同）：
#   - 必须明确指定组织，拒绝 built-in。built-in 的每个用户都是 Casdoor 全局管理员。
#   - 可以重复运行。已存在的对象不重建，不修改用户口令。
#   - 角色成员只增加，不删除。
#   - 凭据只通过标准输入传给 python，不出现在进程参数和 URL 中。
#
# 生成的 client id、client secret、测试用户口令和 webhook 密钥写入
# CASDOOR_DEV_SECRETS_FILE（权限 600）。这个文件不能在仓库目录中。
#
# 用法：
#   CASDOOR_ORGANIZATION=automationstack scripts/casdoor-dev-bootstrap.sh
#   make casdoor-bootstrap
#
# 环境变量：
#   CASDOOR_ORGANIZATION      必填。组织名，不能是 built-in。
#   CASDOOR_URL               默认 http://localhost:8100。
#   CASDOOR_ADMIN_ROLE        默认 automationstack-admin。
#   CASDOOR_REDIRECT_URL      默认 http://localhost:3000/api/auth/casdoor/callback。
#   CASDOOR_ADMIN_PASSWORD    内置管理员 admin 的口令，默认 123。
#   CASDOOR_DEV_SECRETS_FILE  默认 ${TMPDIR:-/tmp}/automationstack-casdoor-dev.env。
#   CASDOOR_WEBHOOK_URL       可选。webhook 的目标地址。
#   CASDOOR_WEBHOOK_ORGANIZATION  webhook 的组织，默认 built-in。原因见下面的 ensure_webhook。
#   CASDOOR_WEBHOOK_ENABLED   默认 true。设为 false 时 webhook 保留但不发送事件。
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

export CASDOOR_URL="${CASDOOR_URL:-http://localhost:8100}"
export CASDOOR_ORGANIZATION="${CASDOOR_ORGANIZATION:?需要 CASDOOR_ORGANIZATION（例如 automationstack）}"
export CASDOOR_ADMIN_ROLE="${CASDOOR_ADMIN_ROLE:-automationstack-admin}"
export CASDOOR_REDIRECT_URL="${CASDOOR_REDIRECT_URL:-http://localhost:3000/api/auth/casdoor/callback}"
export CASDOOR_DEV_SECRETS_FILE="${CASDOOR_DEV_SECRETS_FILE:-${TMPDIR:-/tmp}/automationstack-casdoor-dev.env}"
export CASDOOR_WEBHOOK_URL="${CASDOOR_WEBHOOK_URL:-}"
export CASDOOR_WEBHOOK_ORGANIZATION="${CASDOOR_WEBHOOK_ORGANIZATION:-built-in}"
export CASDOOR_WEBHOOK_ENABLED="${CASDOOR_WEBHOOK_ENABLED:-true}"
admin_password="${CASDOOR_ADMIN_PASSWORD:-123}"

if [ "${CASDOOR_ORGANIZATION}" = "built-in" ]; then
  echo "拒绝使用 built-in 组织：built-in 的每个用户都是 Casdoor 全局管理员。" >&2
  exit 1
fi

case "${CASDOOR_URL}" in
  http://localhost:* | http://127.0.0.1:*) ;;
  *)
    echo "拒绝运行：这个脚本只用于本地 Casdoor（http://localhost 或 http://127.0.0.1）。" >&2
    exit 1
    ;;
esac

secrets_dir="$(cd "$(dirname "${CASDOOR_DEV_SECRETS_FILE}")" && pwd)"
case "${secrets_dir}/" in
  "${ROOT_DIR}/"*)
    echo "拒绝写入：CASDOOR_DEV_SECRETS_FILE 不能在仓库目录中（${ROOT_DIR}）。" >&2
    exit 1
    ;;
esac

# 管理员口令从标准输入传入。python 程序本身用 -c 传入，所以标准输入是空闲的。
read -r -d '' PY_PROGRAM <<'PY' || true
import http.cookiejar
import json
import os
import secrets
import sys
import urllib.error
import urllib.parse
import urllib.request

BASE = os.environ["CASDOOR_URL"].rstrip("/")
ORG = os.environ["CASDOOR_ORGANIZATION"]
ROLE = os.environ["CASDOOR_ADMIN_ROLE"]
REDIRECT = os.environ["CASDOOR_REDIRECT_URL"]
SECRETS_FILE = os.environ["CASDOOR_DEV_SECRETS_FILE"]
WEBHOOK_URL = os.environ["CASDOOR_WEBHOOK_URL"]
WEBHOOK_ORG = os.environ["CASDOOR_WEBHOOK_ORGANIZATION"]
WEBHOOK_ENABLED = os.environ["CASDOOR_WEBHOOK_ENABLED"] == "true"
APP = "automationstack"
WEBHOOK = "automationstack-dev"
WEBHOOK_HEADER = "X-Casdoor-Webhook-Secret"
WEBHOOK_EVENTS = ["add-user", "update-user", "delete-user", "update-role", "add-role", "delete-role"]
ADMIN_PASSWORD = sys.stdin.read()

opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))


def call(path, payload=None, query=None):
    url = f"{BASE}{path}"
    if query:
        url += "?" + urllib.parse.urlencode(query)
    data = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(url, data=data, method="POST" if data else "GET")
    if data:
        req.add_header("Content-Type", "application/json")
    try:
        with opener.open(req, timeout=15) as resp:
            raw = resp.read().decode()
    except urllib.error.HTTPError as exc:
        raise SystemExit(f"{path} HTTP {exc.code}：{exc.read().decode()[:200]}") from exc
    try:
        body = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise SystemExit(f"{path} 返回的不是 JSON：{raw[:200]}") from exc
    if isinstance(body, dict) and body.get("status") == "error":
        raise SystemExit(f"{path} 失败：{body.get('msg')}")
    return body


def load_secrets():
    values = {}
    if os.path.exists(SECRETS_FILE):
        with open(SECRETS_FILE, encoding="utf-8") as fh:
            for line in fh:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    key, value = line.split("=", 1)
                    values[key] = value
    return values


def save_secrets(values):
    fd = os.open(SECRETS_FILE, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w", encoding="utf-8") as fh:
        fh.write("# 本地 Casdoor 的开发凭据，由 scripts/casdoor-dev-bootstrap.sh 生成。不要提交。\n")
        for key in sorted(values):
            fh.write(f"{key}={values[key]}\n")
    os.chmod(SECRETS_FILE, 0o600)


def login():
    call("/api/login", {
        "application": "app-built-in",
        "organization": "built-in",
        "username": "admin",
        "password": ADMIN_PASSWORD,
        "type": "login",
        "autoSignin": False,
        "signinMethod": "Password",
    })


def ensure_organization():
    if call("/api/get-organization", query={"id": f"admin/{ORG}"}).get("data"):
        return "kept"
    # 以 built-in 组织为模板，复制界面相关的默认值。去掉所有口令和白名单类字段。
    template = call("/api/get-organization", query={"id": "admin/built-in"})["data"]
    org = dict(template)
    org.update({
        "owner": "admin",
        "name": ORG,
        "createdTime": "",
        "displayName": ORG,
        "websiteUrl": "",
        "passwordType": "bcrypt",
        "passwordSalt": "",
        "masterPassword": "",
        "defaultPassword": "",
        "masterVerificationCode": "",
        "ipWhitelist": "",
        "ipRestriction": "",
        "defaultApplication": APP,
        "enableSoftDeletion": False,
        "isProfilePublic": False,
        "disableSignin": False,
    })
    call("/api/add-organization", org)
    return "created"


def ensure_application(values):
    existing = call("/api/get-application", query={"id": f"admin/{APP}"}).get("data")
    if existing:
        values["CASDOOR_CLIENT_ID"] = existing["clientId"]
        values["CASDOOR_CLIENT_SECRET"] = existing["clientSecret"]
        return "kept"
    template = call("/api/get-application", query={"id": "admin/app-built-in"})["data"]
    app = dict(template)
    for key in ("organizationObj", "certPublicKey", "CertObj"):
        app.pop(key, None)
    client_id = secrets.token_hex(10)
    client_secret = secrets.token_hex(20)
    app.update({
        "owner": "admin",
        "name": APP,
        "createdTime": "",
        "displayName": "automationstack",
        "homepageUrl": "",
        "organization": ORG,
        "cert": "cert-built-in",
        "isShared": False,
        "enablePassword": True,
        "enableSignUp": False,
        "enableGuestSignin": False,
        "grantTypes": ["authorization_code", "client_credentials"],
        "tokenFormat": "JWT",
        "tokenFields": [],
        "redirectUris": [REDIRECT],
        "clientId": client_id,
        "clientSecret": client_secret,
        "providers": [],
    })
    call("/api/add-application", app)
    values["CASDOOR_CLIENT_ID"] = client_id
    values["CASDOOR_CLIENT_SECRET"] = client_secret
    return "created"


def ensure_user(name, display, values):
    if call("/api/get-user", query={"id": f"{ORG}/{name}"}).get("data"):
        return "kept"
    key = f"CASDOOR_TEST_{name.upper()}_PASSWORD"
    password = values.get(key) or secrets.token_urlsafe(18)
    call("/api/add-user", {
        "owner": ORG,
        "name": name,
        "displayName": display,
        "email": f"{name}@example.test",
        "password": password,
        "type": "normal-user",
        "isAdmin": False,
        "signupApplication": APP,
    })
    values[key] = password
    return "created"


def ensure_role(admin_ref):
    existing = call("/api/get-role", query={"id": f"{ORG}/{ROLE}"}).get("data")
    if existing is None:
        call("/api/add-role", {
            "owner": ORG,
            "name": ROLE,
            "displayName": "automationstack 平台管理员",
            "description": "成员映射为 automationstack 的平台 admin（plan 021 D4）",
            "users": [admin_ref],
            "groups": [],
            "roles": [],
            "domains": [],
            "isEnabled": True,
        })
        return "created"
    users = list(existing.get("users") or [])
    if admin_ref in users:
        return "kept"
    merged = dict(existing)
    merged["users"] = users + [admin_ref]
    # update-* 要求完整对象，id 必须放在查询参数中。
    call("/api/update-role", merged, query={"id": f"{ORG}/{ROLE}"})
    return "member+"


# 组织不是 built-in 的 webhook 使用「只允许公网地址」的 HTTP 客户端，
# 不能访问内网、回环和集群内地址（Casdoor v4.11.0 object/webhook_util.go 的 sendWebhook）。
# 所以集群内的 webhook 地址只能配置在 built-in 组织的 webhook 中。
# 这个 webhook 不设置 singleOrgOnly，会收到所有组织的事件。服务端必须按对象的 owner 过滤。
# 事件记录的 organization 是操作人的组织，不是被修改对象的组织，所以不能用 singleOrgOnly 过滤。
# Casdoor 只在启动时检查有没有 webhook，有才启动发送任务。第一次创建 webhook 后必须重启 Casdoor。
def ensure_webhook(values):
    if not WEBHOOK_URL:
        return "skipped"
    secret = values.get("CASDOOR_WEBHOOK_SECRET") or secrets.token_hex(32)
    values["CASDOOR_WEBHOOK_SECRET"] = secret
    fields = {
        "owner": "admin",
        "name": WEBHOOK,
        "organization": WEBHOOK_ORG,
        "url": WEBHOOK_URL,
        "method": "POST",
        "contentType": "application/json",
        "headers": [{"name": WEBHOOK_HEADER, "value": secret}],
        "events": WEBHOOK_EVENTS,
        "tokenFields": [],
        "objectFields": ["All"],
        "isUserExtended": False,
        "singleOrgOnly": False,
        "isEnabled": WEBHOOK_ENABLED,
        "maxRetries": 3,
        "retryInterval": 60,
        "useExponentialBackoff": False,
    }
    existing = call("/api/get-webhook", query={"id": f"admin/{WEBHOOK}"}).get("data")
    if existing is None:
        call("/api/add-webhook", {**fields, "createdTime": ""})
        return "created"
    merged = dict(existing)
    merged.update(fields)
    call("/api/update-webhook", merged, query={"id": f"admin/{WEBHOOK}"})
    return "updated"


values = load_secrets()
login()
steps = [
    ("organization", ORG, ensure_organization),
    ("application", APP, lambda: ensure_application(values)),
    ("user", "alice", lambda: ensure_user("alice", "Alice（管理员）", values)),
    ("user", "bob", lambda: ensure_user("bob", "Bob（成员）", values)),
    ("role", ROLE, lambda: ensure_role(f"{ORG}/alice")),
    ("webhook", WEBHOOK, lambda: ensure_webhook(values)),
]
for kind, name, step in steps:
    print(f"  {step():8} {kind:12} {name}")
    save_secrets(values)

print(f"→ 开发凭据已写入 {SECRETS_FILE}（权限 600，不要提交）")
print(f"→ 发现地址: {BASE}/.well-known/openid-configuration")
PY

printf '%s' "${admin_password}" | python3 -c "${PY_PROGRAM}"
