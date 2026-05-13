#!/usr/bin/env python3
"""
Git 周报独立应用 — 轻量级 Web 服务

零依赖启动：python3 git_report_app.py
自动打开浏览器访问 http://localhost:9966

功能：
  - 提供 HTML 页面（独立 UI，无需前后端项目）
  - 代理 GitLab API 调用（解决 CORS）
  - 读写 YAML 配置文件
"""
import datetime as dt
import json
import os
import re
import sys
import threading
import urllib.error
import urllib.parse
import urllib.request
import webbrowser
from http.server import HTTPServer, SimpleHTTPRequestHandler
from pathlib import Path

try:
    import yaml
except ImportError:
    import subprocess
    print("正在安装 PyYAML ...")
    subprocess.check_call([sys.executable, "-m", "pip", "install", "pyyaml", "-q"])
    import yaml

# ─── 配置 ──────────────────────────────────────────────────────
PORT = 9966
SCRIPT_DIR = Path(__file__).resolve().parent
CONFIG_PATH = SCRIPT_DIR / "git-report-config.yaml"
HTML_PATH = SCRIPT_DIR / "git_report.html"
WEEKDAYS = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"]


# ─── 工具函数 ──────────────────────────────────────────────────
def load_config():
    if CONFIG_PATH.exists():
        with open(CONFIG_PATH, "r", encoding="utf-8") as f:
            return yaml.safe_load(f) or {}
    return {}


def save_config(cfg):
    with open(CONFIG_PATH, "w", encoding="utf-8") as f:
        yaml.dump(cfg, f, allow_unicode=True, default_flow_style=False, sort_keys=False)


def project_from_repo_url(repo_url):
    parsed = urllib.parse.urlparse(repo_url)
    base = f"{parsed.scheme}://{parsed.netloc}"
    path = parsed.path.strip("/")
    if path.endswith(".git"):
        path = path[:-4]
    return base, path


def fetch_commits(repo, branch, token, author, since, until):
    base, project = project_from_repo_url(repo)
    params = {
        "since": f"{since}T00:00:00+08:00",
        "until": f"{until}T23:59:59+08:00",
        "per_page": "100",
    }
    if branch:
        params["ref_name"] = branch
    if author and "@" in author:
        params["author"] = author

    logs = []
    page = 1
    while True:
        params["page"] = str(page)
        encoded = urllib.parse.quote(project, safe="")
        url = f"{base}/api/v4/projects/{encoded}/repository/commits?{urllib.parse.urlencode(params)}"
        try:
            req = urllib.request.Request(url, headers={"PRIVATE-TOKEN": token})
            with urllib.request.urlopen(req, timeout=20) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                hdrs = resp.headers
        except urllib.error.HTTPError as exc:
            return [], f"GitLab HTTP {exc.code}"
        except Exception as exc:
            return [], str(exc)

        for c in data:
            subject = c.get("title") or c.get("message", "").splitlines()[0]
            c_author = c.get("author_name", "")
            if "merge" in subject.lower():
                continue
            if author and "@" not in author and c_author != author:
                continue
            logs.append({
                "date": c.get("created_at", "")[:10],
                "author": c_author,
                "subject": subject,
                "hash": c.get("id", "")[:7],
            })

        next_page = hdrs.get("X-Next-Page")
        if not next_page:
            break
        page = int(next_page)

    logs.sort(key=lambda x: (x["date"], x["author"], x["subject"]))
    return logs, None


# ─── HTTP Handler ───────────────────────────────────────────────
class ReportHandler(SimpleHTTPRequestHandler):
    """处理 HTML 静态文件 + JSON API"""

    def log_message(self, fmt, *args):
        # 静默普通日志，只打印 API 调用
        try:
            first = str(args[0]) if args else ""
            if "/api/" in first:
                super().log_message(fmt, *args)
        except Exception:
            pass

    def do_GET(self):
        if self.path == "/" or self.path == "/index.html":
            self._serve_html()
        elif self.path == "/api/config":
            self._api_get_config()
        elif self.path == "/favicon.ico":
            self.send_response(204)
            self.end_headers()
        else:
            self.send_response(404)
            self.end_headers()

    def do_POST(self):
        if self.path == "/api/config":
            self._api_save_config()
        elif self.path == "/api/generate":
            self._api_generate()
        else:
            self.send_error(404)

    def do_OPTIONS(self):
        self.send_response(200)
        self._cors_headers()
        self.end_headers()

    def _cors_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def _json_response(self, data, status=200):
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self._cors_headers()
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _read_body(self):
        length = int(self.headers.get("Content-Length", 0))
        return json.loads(self.rfile.read(length).decode("utf-8")) if length else {}

    # ── 页面 ──
    def _serve_html(self):
        if not HTML_PATH.exists():
            self.send_error(500, "git_report.html not found")
            return
        content = HTML_PATH.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(content)))
        self.end_headers()
        self.wfile.write(content)

    # ── API: 读取配置 ──
    def _api_get_config(self):
        cfg = load_config()
        self._json_response({
            "token": cfg.get("gitlab", {}).get("token", ""),
            "author": cfg.get("author", ""),
            "output_dir": cfg.get("output_dir", ""),
            "repos": cfg.get("repos", []),
        })

    # ── API: 保存配置 ──
    def _api_save_config(self):
        body = self._read_body()
        cfg = {
            "gitlab": {"token": body.get("token", "")},
            "author": body.get("author", ""),
            "output_dir": body.get("output_dir", str(SCRIPT_DIR / "reports")),
            "repos": body.get("repos", []),
        }
        save_config(cfg)
        self._json_response({"ok": True})

    # ── API: 生成周报 ──
    def _api_generate(self):
        body = self._read_body()
        token = body.get("token", "")
        author = body.get("author", "")
        since = body.get("since", "")
        until = body.get("until", "")
        repos = body.get("repos", [])

        if not token:
            self._json_response({"error": "GitLab Token 不能为空"}, 400)
            return
        if not repos:
            self._json_response({"error": "仓库列表不能为空"}, 400)
            return

        results = []
        for item in repos:
            repo = (item.get("repo") or "").strip()
            branch = (item.get("branch") or "").strip()
            group = (item.get("group") or "").strip()
            if not repo:
                continue
            _, project = project_from_repo_url(repo)
            logs, error = fetch_commits(repo, branch, token, author, since, until)
            results.append({
                "project": project,
                "repo": repo,
                "branch": branch,
                "group": group,
                "logs": logs,
                "error": error,
            })

        # 可选：保存到文件
        output_dir = body.get("output_dir", "")
        saved_files = []
        if output_dir:
            try:
                out = Path(output_dir)
                out.mkdir(parents=True, exist_ok=True)
                md = self._render_md(results, author, since, until)
                md_path = out / f"git-weekly-report_{since}_to_{until}.md"
                md_path.write_text(md, encoding="utf-8")
                saved_files.append(str(md_path))
            except Exception:
                pass

        self._json_response({"results": results, "saved_files": saved_files})

    def _render_md(self, results, author, since, until):
        lines = ["# Git 仓库周报", "", f"- 时间范围：{since} 至 {until}", f"- 作者：{author or '全部'}", ""]
        total = sum(len(r["logs"]) for r in results)
        lines += [f"## 汇总", "", f"共 {len(results)} 个仓库，{total} 条提交。", ""]
        for item in results:
            bl = f" [{item['branch']}]" if item["branch"] else ""
            lines.append(f"## {item['project']}{bl}")
            lines.append("")
            if item.get("error"):
                lines += [f"> 获取失败：{item['error']}", ""]
                continue
            if not item["logs"]:
                lines += ["无提交记录", ""]
                continue
            lines += ["| 日期 | 星期 | 作者 | 提交内容 |", "| --- | --- | --- | --- |"]
            grouped = {}
            for log in item["logs"]:
                key = (log["date"], log["author"])
                grouped.setdefault(key, []).append(log["subject"])
            for (d, a), subs in grouped.items():
                wd = WEEKDAYS[dt.date.fromisoformat(d).weekday()]
                s = "<br>".join(f"- {x}" for x in subs)
                lines.append(f"| {d} | {wd} | {a} | {s} |")
            lines.append("")
        return "\n".join(lines).rstrip() + "\n"


# ─── 启动 ───────────────────────────────────────────────────────
def main():
    server = HTTPServer(("0.0.0.0", PORT), ReportHandler)
    url = f"http://localhost:{PORT}"
    print(f"\n  🚀 Git 周报应用已启动: {url}")
    print(f"  📁 配置文件: {CONFIG_PATH}")
    print(f"  按 Ctrl+C 停止\n")

    # 延迟打开浏览器
    threading.Timer(0.5, lambda: webbrowser.open(url)).start()

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n  已停止")
        server.server_close()


if __name__ == "__main__":
    main()
