#!/usr/bin/env bash
# 阿里云 ECS：一键安装依赖、构建、配置 nginx 反代 + Node 后端
# 支持：Ubuntu / Debian、Alibaba Cloud Linux / RHEL 系（含 dnf/yum）
# 用法（在仓库根目录）：
#   chmod +x deploy/install-ecs.sh
#   ./deploy/install-ecs.sh
# 可选环境变量：
#   DOMAIN=your.domain.com          默认 _
#   NODE_PORT=3001                  后端端口，默认 3001
#   SMTP_USER=xxx@163.com           邮件发送账号
#   SMTP_PASS=xxx                   邮件授权码
#   NOTIFY_EMAIL=xxx@163.com        通知收件人，默认 chen_the_best@163.com
#   REMOVE_NGINX_DEFAULT=1          默认 1
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT"

DOMAIN="${DOMAIN:-_}"
NODE_PORT="${NODE_PORT:-3001}"
REMOVE_NGINX_DEFAULT="${REMOVE_NGINX_DEFAULT:-1}"

if [[ ! -f "$ROOT/package.json" ]]; then
  echo "错误：请在包含 package.json 的仓库根目录运行（当前: $ROOT）" >&2
  exit 1
fi

if ! command -v sudo >/dev/null 2>&1; then
  echo "错误：需要 sudo" >&2
  exit 1
fi

if [[ ! -f /etc/os-release ]]; then
  echo "错误：无法检测系统版本（缺少 /etc/os-release）" >&2
  exit 1
fi

# shellcheck source=/dev/null
. /etc/os-release

ID_L="${ID:-}"
ID_LIKE="${ID_LIKE:-}"

is_apt() {
  [[ "$ID_L" == "ubuntu" ]] || [[ "$ID_L" == "debian" ]] || [[ "$ID_L" == "linuxmint" ]]
}

is_dnf_yum() {
  [[ "$ID_L" == "alinux" ]] || [[ "$ID_L" == "centos" ]] || [[ "$ID_L" == "rhel" ]] ||
    [[ "$ID_L" == "rocky" ]] || [[ "$ID_L" == "almalinux" ]] || [[ "$ID_L" == "fedora" ]] ||
    [[ "$ID_L" == "anolis" ]] || [[ "$ID_LIKE" == *"rhel"* ]] || [[ "$ID_LIKE" == *"fedora"* ]] ||
    [[ "$ID_LIKE" == *"centos"* ]]
}

echo "==> 系统: ${PRETTY_NAME:-$ID $VERSION_ID}"

if is_apt; then
  echo "==> 安装系统依赖（apt：nginx、rsync、curl、better-sqlite3 编译链）…"
  sudo apt-get update -y
  sudo apt-get install -y nginx rsync curl ca-certificates openssl build-essential python3
elif is_dnf_yum; then
  echo "==> 安装系统依赖（dnf/yum：nginx、rsync、curl、better-sqlite3 编译链）…"
  if command -v dnf >/dev/null 2>&1; then
    sudo dnf install -y nginx rsync curl ca-certificates openssl gcc-c++ make python3 ||
      sudo yum install -y nginx rsync curl ca-certificates openssl gcc-c++ make python3
  else
    sudo yum install -y nginx rsync curl ca-certificates openssl gcc-c++ make python3
  fi
  sudo systemctl enable nginx
else
  echo "错误：未识别的发行版（ID=$ID_L）。请使用 Ubuntu / Debian / Alibaba Cloud Linux，或改用 Docker" >&2
  exit 1
fi

install_node_20() {
  if command -v node >/dev/null 2>&1 && node -e "const m=+process.versions.node.split('.')[0]; process.exit(m<20?1:0)" 2>/dev/null; then
    echo "==> Node.js 已满足 $(node -v)"
    return 0
  fi
  echo "==> 安装 Node.js 20.x …"
  if is_apt; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt-get install -y nodejs
  elif is_dnf_yum; then
    curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
    if command -v dnf >/dev/null 2>&1; then
      sudo dnf install -y nodejs
    else
      sudo yum install -y nodejs
    fi
  fi
}

install_node_20

echo "==> 安装依赖并构建前端…"
npm ci
npm run build

# ========== systemd 服务 ==========

APP_DIR="$ROOT"
SERVICE_FILE="/etc/systemd/system/kosoworld.service"

echo "==> 配置 systemd 服务 kosoworld …"
sudo tee "$SERVICE_FILE" >/dev/null <<UNIT
[Unit]
Description=KosoWorld Node.js Backend
After=network.target

[Service]
Type=simple
WorkingDirectory=${APP_DIR}
ExecStart=$(command -v node) ${APP_DIR}/server/index.mjs
Restart=always
RestartSec=5
Environment=NODE_ENV=production
Environment=HOST=127.0.0.1
Environment=PORT=${NODE_PORT}
Environment=SMTP_HOST=${SMTP_HOST:-smtp.163.com}
Environment=SMTP_PORT=${SMTP_PORT:-465}
Environment=SMTP_USER=${SMTP_USER:-}
Environment=SMTP_PASS=${SMTP_PASS:-}
Environment=NOTIFY_EMAIL=${NOTIFY_EMAIL:-chen_the_best@163.com}
StandardOutput=journal
StandardError=journal
SyslogIdentifier=kosoworld

[Install]
WantedBy=multi-user.target
UNIT

sudo systemctl daemon-reload
sudo systemctl enable kosoworld
echo "==> 重启 kosoworld 后端服务…"
sudo systemctl restart kosoworld
sleep 2
if sudo systemctl is-active --quiet kosoworld; then
  echo "==> kosoworld 服务已启动 (port ${NODE_PORT})"
else
  echo "警告：kosoworld 服务启动异常，请检查 journalctl -u kosoworld" >&2
  sudo journalctl -u kosoworld -n 20 --no-pager 2>/dev/null || true
fi

# ========== nginx 反向代理 ==========

SSL_DIR="/etc/nginx/ssl"
SSL_CN="$DOMAIN"
[[ "$SSL_CN" == "_" ]] && SSL_CN="localhost"
if [[ ! -f "$SSL_DIR/kosoworld.crt" ]]; then
  echo "==> 生成 TLS 自签名证书 $SSL_DIR …"
  sudo mkdir -p "$SSL_DIR"
  sudo openssl req -x509 -nodes -days 3650 -newkey rsa:2048 \
    -keyout "$SSL_DIR/kosoworld.key" -out "$SSL_DIR/kosoworld.crt" \
    -subj "/CN=$SSL_CN/O=kosoworld"
  sudo chmod 644 "$SSL_DIR/kosoworld.crt"
  sudo chmod 640 "$SSL_DIR/kosoworld.key"
fi

fix_ssl_key_owner() {
  local key="$SSL_DIR/kosoworld.key"
  [[ -f "$key" ]] || return 0
  local run_user=""
  if [[ -f /etc/nginx/nginx.conf ]]; then
    run_user=$(awk '/^[[:space:]]*user[[:space:]]+/ {gsub(/;/,"",$2); print $2; exit}' /etc/nginx/nginx.conf)
  fi
  if [[ -n "$run_user" ]] && getent group "$run_user" &>/dev/null; then
    sudo chown root:"$run_user" "$key"
  elif id -u nginx &>/dev/null && getent group nginx &>/dev/null; then
    sudo chown root:nginx "$key"
  elif getent group www-data &>/dev/null; then
    sudo chown root:www-data "$key"
  else
    sudo chmod 644 "$key"
  fi
  sudo chmod 640 "$key"
}
fix_ssl_key_owner

if command -v getenforce &>/dev/null && [[ "$(getenforce 2>/dev/null)" == "Enforcing" ]]; then
  sudo chcon -R -t cert_t "$SSL_DIR" 2>/dev/null || sudo chcon -R -t httpd_sys_content_t "$SSL_DIR" 2>/dev/null || true
fi

CONF_SRC="$SCRIPT_DIR/nginx-kosoworld.conf"
render_conf() {
  sed -e "s|__SERVER_NAME__|$DOMAIN|g" -e "s|__NODE_PORT__|$NODE_PORT|g" "$CONF_SRC"
}

if [[ ! -f "$CONF_SRC" ]]; then
  echo "错误：缺少 $CONF_SRC" >&2
  exit 1
fi

if is_apt; then
  CONF_DST="/etc/nginx/sites-available/kosoworld"
  render_conf | sudo tee "$CONF_DST" >/dev/null
  sudo mkdir -p /etc/nginx/sites-enabled
  sudo ln -sf "$CONF_DST" /etc/nginx/sites-enabled/kosoworld
  if [[ "$REMOVE_NGINX_DEFAULT" == "1" ]] && [[ -e /etc/nginx/sites-enabled/default ]]; then
    echo "==> 移除 /etc/nginx/sites-enabled/default"
    sudo rm -f /etc/nginx/sites-enabled/default
  fi
elif is_dnf_yum; then
  sudo mkdir -p /etc/nginx/conf.d
  render_conf | sudo tee /etc/nginx/conf.d/kosoworld.conf >/dev/null
  if [[ "$REMOVE_NGINX_DEFAULT" == "1" ]]; then
    for f in /etc/nginx/conf.d/default.conf /etc/nginx/conf.d/welcome.conf /etc/nginx/default.d/default.conf; do
      [[ -f "$f" ]] && sudo rm -f "$f"
    done
  fi
fi

echo "==> 检测并重载 nginx …"
if ! sudo nginx -t; then
  echo "错误：nginx -t 未通过" >&2
  exit 1
fi
sudo systemctl enable nginx

echo "==> 重启 nginx …"
sudo systemctl stop nginx 2>/dev/null || true
sleep 1
sudo rm -f /run/nginx.pid 2>/dev/null || true

if ! sudo systemctl start nginx; then
  echo "错误：nginx 启动失败" >&2
  sudo journalctl -u nginx.service -n 20 --no-pager 2>/dev/null || true
  exit 1
fi

echo ""
echo "=========================================="
echo "  部署完成！"
echo "=========================================="
echo "  后端服务：kosoworld (systemd, port ${NODE_PORT})"
echo "  nginx 反代：80 → ${NODE_PORT}, 443 → ${NODE_PORT}"
echo "  自测：curl -I http://127.0.0.1"
echo ""
echo "  管理后端："
echo "    sudo systemctl status kosoworld"
echo "    sudo journalctl -u kosoworld -f"
echo "    sudo systemctl restart kosoworld"
echo ""
if [[ -z "${SMTP_USER:-}" ]]; then
  echo "  ⚠ SMTP 未配置，邮件功能不可用。重新部署时传入："
  echo "    SMTP_USER=xxx@163.com SMTP_PASS=授权码 ./deploy/install-ecs.sh"
fi
echo ""
echo "  阿里云安全组需放行 TCP 80、443"
echo "=========================================="
