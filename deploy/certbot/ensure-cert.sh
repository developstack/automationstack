#!/bin/sh
# 证书不存在时，向 Let's Encrypt 申请（HTTP-01 验证，文件写在 nginx 的 webroot 中）。
# 证书已存在时什么都不做。续期由 compose 中的 certbot 服务负责。
#
# make up:prod 在 certbot 容器中执行本脚本。这时 nginx 必须已经在 80 端口上响应。
set -eu

if [ -f "/etc/letsencrypt/live/${DOMAIN}/fullchain.pem" ]; then
	echo "  ✅ 证书已存在：${DOMAIN}"
	exit 0
fi

set -- certonly --webroot -w /var/www/certbot -d "${DOMAIN}" \
	--agree-tos --non-interactive --no-eff-email
if [ -n "${ACME_EMAIL:-}" ]; then
	set -- "$@" --email "${ACME_EMAIL}"
else
	set -- "$@" --register-unsafely-without-email
fi

echo "  ▶ 向 Let's Encrypt 申请 ${DOMAIN} 的证书"
if ! certbot "$@"; then
	echo "❌ 申请证书失败。检查这几项：" >&2
	echo "   1. 阿里云中 ${DOMAIN} 的 A 记录指向本服务器的公网 IP，并且已经生效。" >&2
	echo "   2. 阿里云安全组允许 80 和 443 端口的入站流量。" >&2
	echo "   3. 中国内地的服务器：域名已经完成 ICP 备案。没有备案时，80 和 443 端口被阻断。" >&2
	echo "   改好后，再执行一次 make up:prod。站点在这期间用 HTTP 提供服务。" >&2
	exit 1
fi
