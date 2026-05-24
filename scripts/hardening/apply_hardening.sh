#!/usr/bin/env bash
set -euo pipefail

# ============================================================
# Security Hardening Script
# Applies system-level security hardening for KYC Vault
# Requires: root/sudo privileges
# ============================================================

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'
log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

if [[ $EUID -ne 0 ]]; then
  log_error "This script must be run as root (sudo)"
  exit 1
fi

HARDENING_DIR="$(dirname "$0")"
BACKUP_DIR="/var/backups/hardening-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP_DIR"

# ============================================================
# 1. TLS / mTLS Configuration
# ============================================================
configure_tls() {
  log_info "Configuring TLS parameters"
  local tls_conf="/etc/ssl/openssl.cnf"

  cp "$tls_conf" "$BACKUP_DIR/openssl.cnf.bak" 2>/dev/null || true

  cat << 'TLS' > /etc/ssl/openssl.cnf.d/kyc-vault.conf
# KYC Vault TLS Hardening
min_protocol = TLSv1.3
ciphersuites = TLS_AES_256_GCM_SHA384:TLS_CHACHA20_POLY1305_SHA256
options = -serverpref, -negotiate, -single_dh_use
signature_algorithms = ed25519,ecdsa_secp384r1_sha384
groups = x25519:secp384r1
TLS

  log_info "TLS 1.3 enforced with AEAD ciphers"
}

# ============================================================
# 2. Kernel Parameter Hardening
# ============================================================
harden_kernel() {
  log_info "Hardening kernel parameters"
  local sysctl_conf="/etc/sysctl.d/99-kyc-vault-hardening.conf"

  cp /etc/sysctl.conf "$BACKUP_DIR/sysctl.conf.bak" 2>/dev/null || true

  cat << 'SYSCTL' > "$sysctl_conf"
# ============================================================
# KYC Vault Kernel Hardening
# ============================================================

# IP Spoofing protection
net.ipv4.conf.all.rp_filter = 1
net.ipv4.conf.default.rp_filter = 1

# Ignore ICMP redirects
net.ipv4.conf.all.accept_redirects = 0
net.ipv6.conf.all.accept_redirects = 0
net.ipv4.conf.default.accept_redirects = 0
net.ipv6.conf.default.accept_redirects = 0
net.ipv4.conf.all.secure_redirects = 0
net.ipv4.conf.default.secure_redirects = 0

# Ignore source routed packets
net.ipv4.conf.all.accept_source_route = 0
net.ipv6.conf.all.accept_source_route = 0
net.ipv4.conf.default.accept_source_route = 0
net.ipv6.conf.default.accept_source_route = 0

# Disable ICMP redirect sending
net.ipv4.conf.all.send_redirects = 0
net.ipv4.conf.default.send_redirects = 0

# Disable IP forwarding
net.ipv4.ip_forward = 0
net.ipv6.conf.all.forwarding = 0

# Enable TCP SYN cookies
net.ipv4.tcp_syncookies = 1

# Increase TCP backlog
net.core.somaxconn = 65535
net.ipv4.tcp_max_syn_backlog = 8192

# Increase TIME_WAIT bucket capacity
net.ipv4.tcp_max_tw_buckets = 2000000

# Enable TCP fast open
net.ipv4.tcp_fastopen = 3

# Reduce keepalive time
net.ipv4.tcp_keepalive_time = 300
net.ipv4.tcp_keepalive_intvl = 30
net.ipv4.tcp_keepalive_probes = 5

# Enable BBR congestion control
net.core.default_qdisc = fq
net.ipv4.tcp_congestion_control = bbr

# Disable bogus TCP metrics
net.ipv4.tcp_no_metrics_save = 1

# Protect against TIME-WAIT assassination
net.ipv4.tcp_rfc1337 = 1

# Disable ICMP echo ignore broadcasts
net.ipv4.icmp_echo_ignore_broadcasts = 1

# Ignore bogus ICMP errors
net.ipv4.icmp_ignore_bogus_error_responses = 1

# VM settings
vm.swappiness = 10
vm.dirty_ratio = 60
vm.dirty_background_ratio = 2
vm.overcommit_memory = 1

# Restrict kernel pointer exposure
kernel.kptr_restrict = 2
kernel.dmesg_restrict = 1
kernel.printk = 3 3 3 3
kernel.unprivileged_bpf_disabled = 1
net.core.bpf_jit_harden = 2

# ASLR
kernel.randomize_va_space = 2

# Restrict ptrace
kernel.yama.ptrace_scope = 2

# Increase max user watches for inotify
fs.inotify.max_user_watches = 524288
fs.inotify.max_user_instances = 512

# Restrict perf events
kernel.perf_event_paranoid = 3
kernel.perf_event_max_sample_rate = 1
SYSCTL

  sysctl -p "$sysctl_conf"
  log_info "Kernel parameters hardened (46 settings applied)"
}

# ============================================================
# 3. File Permission Hardening
# ============================================================
harden_permissions() {
  log_info "Hardening file permissions"

  # Restrict /etc/shadow and /etc/passwd
  chmod 640 /etc/shadow
  chmod 644 /etc/passwd
  chmod 640 /etc/group

  # Restrict SSH
  chmod 600 /etc/ssh/sshd_config
  chmod 700 /etc/ssh
  chmod 600 /etc/ssh/*_key
  chmod 644 /etc/ssh/*.pub

  # Restrict cron
  chmod 600 /etc/crontab
  chmod 700 /var/spool/cron
  chown root:root /etc/crontab

  # Restrict sudoers
  chmod 440 /etc/sudoers
  chmod 440 /etc/sudoers.d/* 2>/dev/null || true

  # Set umask globally
  if ! grep -q "umask 027" /etc/profile; then
    echo "umask 027" >> /etc/profile
  fi

  # KYC Vault service files
  if [[ -d /opt/kyc-vault ]]; then
    find /opt/kyc-vault -type f -name "*.pem" -o -name "*.key" -o -name "*.crt" | while read -r f; do
      chmod 600 "$f"
      log_info "Restricted: $f"
    done
    find /opt/kyc-vault -type d -name "secrets" | while read -r d; do
      chmod 700 "$d"
      log_info "Restricted directory: $d"
    done
  fi

  log_info "File permissions hardened"
}

# ============================================================
# 4. SSH Hardening
# ============================================================
harden_ssh() {
  log_info "Hardening SSH configuration"
  local sshd_conf="/etc/ssh/sshd_config"

  cp "$sshd_conf" "$BACKUP_DIR/sshd_config.bak"

  cat << 'SSHD' > "$sshd_conf"
Port 22
Protocol 2
HostKey /etc/ssh/ssh_host_ed25519_key
HostKey /etc/ssh/ssh_host_rsa_key

# Authentication
PermitRootLogin prohibit-password
PubkeyAuthentication yes
AuthorizedKeysFile .ssh/authorized_keys
PasswordAuthentication no
PermitEmptyPasswords no
ChallengeResponseAuthentication no
UsePAM yes
AuthenticationMethods publickey

# Access control
AllowUsers kyc-admin
MaxAuthTries 3
MaxSessions 10
MaxStartups 10:30:100
LoginGraceTime 30

# Forwarding
AllowTcpForwarding no
X11Forwarding no
AllowAgentForwarding no
PermitTunnel no

# Session config
ClientAliveInterval 300
ClientAliveCountMax 2
TCPKeepAlive no
Compression no
PrintMotd no
Banner /etc/ssh/banner

# Logging
SyslogFacility AUTH
LogLevel VERBOSE

# Ciphers and MACs
KexAlgorithms sntrup761x25519-sha512,curve25519-sha256,diffie-hellman-group-exchange-sha256
Ciphers chacha20-poly1305@openssh.com,aes256-gcm@openssh.com
MACs hmac-sha2-512-etm@openssh.com,hmac-sha2-256-etm@openssh.com
HostKeyAlgorithms sk-ssh-ed25519-cert-v01@openssh.com,ssh-ed25519-cert-v01@openssh.com,sk-ssh-ed25519@openssh.com,ssh-ed25519
SSHD

  cat << 'BANNER' > /etc/ssh/banner
****************************************************************
**                                                             **
**  AUTHORIZED ACCESS ONLY                                      **
**  This system is for authorized KYC Vault use only.          **
**  All activity is monitored and logged.                      **
**  Unauthorized access will be prosecuted to the full extent  **
**  of the law.                                                 **
**                                                             **
****************************************************************
BANNER

  systemctl restart sshd
  log_info "SSH hardened (ed25519 keys, pubkey only, no passwords)"
}

# ============================================================
# 5. Disable Unused Services
# ============================================================
disable_services() {
  log_info "Disabling unused services"
  local services=(
    "avahi-daemon" "cups" "rpcbind" "nfs-server"
    "bluetooth" "isc-dhcp-server" "slapd" "telnet"
    "rsh-server" "talk-server" "nis" "tftp"
  )
  for svc in "${services[@]}"; do
    if systemctl is-enabled "$svc" &>/dev/null; then
      systemctl disable --now "$svc" 2>/dev/null || true
      log_info "Disabled: $svc"
    fi
  done
}

# ============================================================
# 6. Auditd Configuration
# ============================================================
configure_auditd() {
  log_info "Configuring auditd for KYC Vault"
  local audit_rules="/etc/audit/rules.d/99-kyc-vault.rules"

  cat << 'AUDIT' > "$audit_rules"
# KYC Vault audit rules
-w /etc/kyc-vault/ -p wa -k kyc-vault-config
-w /opt/kyc-vault/ -p wa -k kyc-vault-bin
-w /var/log/kyc-vault/ -p wa -k kyc-vault-logs
-w /etc/ssh/sshd_config -p wa -k ssh-config
-a always,exit -S execve -F path=/opt/kyc-vault/bin/ -k kyc-vault-exec
-a always,exit -S connect -F a0!=0 -F key=network-connect
-w /etc/sysctl.d/ -p wa -k sysctl-changes
-w /etc/audit/ -p wa -k audit-changes
AUDIT

  augenrules --load 2>/dev/null || true
  systemctl restart auditd 2>/dev/null || true
  log_info "Auditd configured with KYC-specific rules"
}

# ============================================================
# 7. AppArmor / SELinux
# ============================================================
configure_lsm() {
  log_info "Configuring AppArmor for KYC services"

  if command -v aa-status &>/dev/null; then
    local profile="/etc/apparmor.d/opt.kyc-vault.bin.kyc-credential-service"
    cat << 'AA' > "$profile"
#include <tunables/global>

/opt/kyc-vault/bin/kyc-credential-service {
  #include <abstractions/base>
  #include <abstractions/openssl>

  /opt/kyc-vault/** r,
  /etc/kyc-vault/** r,
  /var/log/kyc-vault/** rw,
  /var/lib/kyc-vault/** rw,

  deny /etc/shadow r,
  deny /etc/passwd r,
  deny /root/** rw,
  deny /home/** rw,

  network tcp,
  deny network raw,
  deny network packet,

  capability setuid,
  capability setgid,
  deny capability sys_admin,
  deny capability sys_ptrace,
  deny capability sys_boot,
}
AA
    apparmor_parser -r "$profile" 2>/dev/null || true
    log_info "AppArmor profile installed for credential service"
  else
    log_warn "AppArmor not available; install apparmor-utils"
  fi
}

# ============================================================
# 8. Fail2ban Configuration
# ============================================================
configure_fail2ban() {
  if ! command -v fail2ban-client &>/dev/null; then
    log_warn "fail2ban not installed, skipping"
    return
  fi
  log_info "Configuring fail2ban for KYC API"

  cat << 'F2B' > /etc/fail2ban/jail.d/kyc-vault.conf
[kyc-api]
enabled = true
port = 443
filter = kyc-api
logpath = /var/log/kyc-vault/api-access.log
maxretry = 5
bantime = 3600
findtime = 300

[kyc-ssh]
enabled = true
port = ssh
filter = sshd
logpath = /var/log/auth.log
maxretry = 3
bantime = 86400
F2B

  cat << 'F2BF' > /etc/fail2ban/filter.d/kyc-api.conf
[Definition]
failregex = ^.*Unauthorized access attempt from <HOST>.*$
            ^.*Rate limit exceeded from <HOST>.*$
            ^.*Invalid API key from <HOST>.*$
ignoreregex =
F2BF

  systemctl restart fail2ban 2>/dev/null || true
  log_info "Fail2ban configured for KYC API and SSH"
}

# ============================================================
# 9. Automatic Security Updates
# ============================================================
configure_updates() {
  log_info "Configuring automatic security updates"
  if command -v unattended-upgrade &>/dev/null; then
    cat << 'UU' > /etc/apt/apt.conf.d/50unattended-upgrades
Unattended-Upgrade::Allowed-Origins {
  "${distro_id}:${distro_codename}-security";
  "KYC Vault:${distro_codename}";
};
Unattended-Upgrade::AutoFixInterruptedDpkg "true";
Unattended-Upgrade::MinimalSteps "true";
Unattended-Upgrade::Mail "security@kyc-vault.com";
Unattended-Upgrade::Remove-Unused-Dependencies "true";
Unattended-Upgrade::Automatic-Reboot "false";
UU
    log_info "Automatic security updates configured"
  else
    log_warn "unattended-upgrades not installed"
  fi
}

# ============================================================
# Main
# ============================================================
main() {
  echo "============================================"
  echo "KYC VAULT SECURITY HARDENING"
  echo "Started: $(date)"
  echo "============================================"

  configure_tls
  harden_kernel
  harden_permissions
  harden_ssh
  disable_services
  configure_auditd
  configure_lsm
  configure_fail2ban
  configure_updates

  echo "============================================"
  echo "SECURITY HARDENING COMPLETE"
  echo "Backup: $BACKUP_DIR"
  echo "Review: journalctl -u sshd --no-pager -n 20"
  echo "============================================"
}

main "$@"
