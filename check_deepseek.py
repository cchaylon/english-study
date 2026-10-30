#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
本地 DeepSeek 连通性自检脚本（仅用 Python 标准库，无需 pip 安装）。

用法：
    python3 check_deepseek.py                 # 自动读取 assets/js/teach.js 里的密钥
    python3 check_deepseek.py --key sk-xxx    # 指定密钥
    DEEPSEEK_API_KEY=sk-xxx python3 check_deepseek.py

它会依次检查：DNS/网络 → TLS 连接 → 密钥鉴权与余额 → 真实对话请求，
任何一步失败都会给出明确的中文原因。
"""

import argparse
import json
import os
import re
import socket
import sys
import urllib.error
import urllib.request

BASE = "https://api.deepseek.com"
ENDPOINT = BASE + "/chat/completions"
BALANCE = BASE + "/user/balance"
TIMEOUT = 55


def load_key_from_repo():
    here = os.path.dirname(os.path.abspath(__file__))
    path = os.path.join(here, "assets", "js", "teach.js")
    try:
        with open(path, encoding="utf-8") as f:
            m = re.search(r'apiKey\s*:\s*"([^"]+)"', f.read())
            if m:
                return m.group(1)
    except OSError:
        pass
    return ""


def mask(key):
    return key[:6] + "..." + key[-4:] if len(key) > 12 else "(过短)"


def check_dns():
    print("[1/4] 检查 DNS 解析 api.deepseek.com ...", end=" ")
    try:
        socket.gethostbyname("api.deepseek.com")
        print("OK")
        return True
    except socket.gaierror as e:
        print("失败 ->", e)
        print("      DNS 解析不了，通常是网络/代理/防火墙问题。")
        return False


def check_tls():
    """用一次真实 HTTPS 请求验证 TLS（会自动走 HTTP(S)_PROXY 环境变量）。"""
    proxies = urllib.request.getproxies()
    shown = proxies.get("https") or proxies.get("http")
    print("[2/4] 检查 HTTPS 连接" + ("（代理 " + shown + "）" if shown else "") + " ...", end=" ")
    try:
        with urllib.request.urlopen(BASE + "/", timeout=15) as r:
            print("OK (HTTP " + str(r.status) + ")")
        return True
    except urllib.error.HTTPError as e:
        # 任何 HTTP 状态码都说明网络与 TLS 已打通
        print("OK (HTTP " + str(e.code) + ")")
        return True
    except Exception as e:
        print("失败 ->", type(e).__name__, e)
        print("      连不上 api.deepseek.com：检查网络/代理/VPN/防火墙，或被 443 端口封锁。")
        return False


def request(url, key, payload=None):
    data = json.dumps(payload).encode("utf-8") if payload is not None else None
    req = urllib.request.Request(
        url,
        data=data,
        headers={
            "Content-Type": "application/json",
            "Authorization": "Bearer " + key,
        },
        method="POST" if payload is not None else "GET",
    )
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
            return r.status, json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", "ignore")[:300]
        return e.code, {"_error": body}
    except Exception as e:
        return None, {"_error": type(e).__name__ + ": " + str(e)}


def explain_status(code, body):
    if code is None:
        print("请求失败 ->", body.get("_error"))
        print("      连不上 api.deepseek.com：网络/代理/VPN 拦截，注意不是密钥问题。")
        return False
    if code == 200:
        return True
    hints = {
        401: "密钥无效或已失效（401）：去 platform.deepseek.com 重新生成。",
        402: "账户余额不足（402）：去平台充值。",
        403: "无权限（403）：密钥权限或账号问题。",
        429: "请求过于频繁（429）：这个密钥可能被多人共用，稍后再试。",
        500: "DeepSeek 服务端错误（500），稍后重试。",
        503: "服务繁忙（503），稍后重试。",
    }
    print("HTTP", code, "->", hints.get(code, body.get("_error", "未知错误")))
    return False


def check_auth(key):
    print("[3/4] 检查密钥鉴权 + 余额 ...", end=" ")
    code, body = request(BALANCE, key)
    if code != 200:
        print("失败")
        explain_status(code, body)
        return False
    if body.get("is_available") is False:
        print("失败 -> 账户不可用（可能欠费）")
        return False
    infos = body.get("balance_infos") or []
    text = ", ".join(
        i.get("currency", "") + " " + i.get("total_balance", "?") for i in infos
    )
    print("OK（余额", text or "未知", "）")
    return True


def check_chat(key):
    print("[4/4] 发送真实对话请求 ...", end=" ")
    payload = {
        "model": "deepseek-chat",
        "messages": [{"role": "user", "content": "Reply with exactly: OK"}],
        "max_tokens": 10,
        "stream": False,
    }
    code, body = request(ENDPOINT, key, payload)
    if code != 200:
        print("失败")
        explain_status(code, body)
        return False
    try:
        content = body["choices"][0]["message"]["content"].strip()
    except (KeyError, IndexError):
        print("失败 -> 返回结构异常")
        print(json.dumps(body, ensure_ascii=False)[:300])
        return False
    print("OK（模型回复:", content, "）")
    return True


def main():
    parser = argparse.ArgumentParser(description="本地 DeepSeek 连通性自检")
    parser.add_argument("--key", help="DeepSeek API Key，默认从环境变量或 teach.js 读取")
    args = parser.parse_args()

    key = args.key or os.environ.get("DEEPSEEK_API_KEY") or load_key_from_repo()
    if not key:
        print("未找到 API Key：请用 --key 传入，或设置 DEEPSEEK_API_KEY 环境变量。")
        return 2
    print("使用密钥:", mask(key))
    print("-" * 52)

    if not check_dns():
        return 1
    if not check_tls():
        return 1
    if not check_auth(key):
        return 1
    if not check_chat(key):
        return 1

    print("-" * 52)
    print("全部通过：本机可以直接调用 DeepSeek。")
    print("若网页仍报错，问题在浏览器（file:// 打开、内置浏览器或插件拦截），不是网络/密钥。")
    return 0


if __name__ == "__main__":
    sys.exit(main())
