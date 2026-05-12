"""
mokao_obsidian_server.py
粉笔模考爬虫 → Obsidian Vault 直存服务器
用法: python mokao_obsidian_server.py [--port 8765]
默认端口 8765，启动后在浏览器扩展中配置此端口即可
"""

import argparse
import json
import os
import re
import uuid
import webbrowser
from http.server import HTTPServer, BaseHTTPRequestHandler
from pathlib import Path
from urllib.parse import parse_qs, urlparse

VERSION = "1.0.0"

# ===== 配置 =====
DEFAULT_PORT = 8765
DEFAULT_VAULT = ""  # 首次启动时用户选择
CONFIG_FILE = Path(__file__).parent / "vault_config.json"


def load_config():
    if CONFIG_FILE.exists():
        with open(CONFIG_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    return {"vault_path": "", "port": DEFAULT_PORT}


def save_config(cfg):
    with open(CONFIG_FILE, "w", encoding="utf-8") as f:
        json.dump(cfg, f, ensure_ascii=False, indent=2)


def get_vault_folders(vault_path):
    """列出 vault 下的一级文件夹（不含 . 开头的隐藏目录）"""
    if not vault_path or not Path(vault_path).is_dir():
        return []
    return sorted([
        d.name for d in Path(vault_path).iterdir()
        if d.is_dir() and not d.name.startswith(".")
    ])


def sanitize_filename(name):
    """Windows/macOS/Linux 安全文件名"""
    name = re.sub(r'[<>:"/\\|?*\x00-\x1f]', "_", name)
    name = name.strip(". ")
    return name[:200] or "untitled"


def safe_write(path, content):
    """安全写文件，防止覆盖"""
    p = Path(path)
    p.parent.mkdir(parents=True, exist_ok=True)

    # 防重名：xxx.md → xxx_1.md → xxx_2.md ...
    stem = p.stem
    ext = p.suffix
    attempt = 0
    while p.exists():
        attempt += 1
        p = p.parent / f"{stem}_{attempt}{ext}"
        if attempt > 100:
            p = p.parent / f"{stem}_{uuid.uuid4().hex[:6]}{ext}"

    p.write_text(content, encoding="utf-8")
    return p


def obsidian_new_uri(content: str, filename: str = None) -> str:
    """生成 obsidian://new URI（适合小文件）"""
    import urllib.parse
    if filename:
        fname = urllib.parse.quote(sanitize_filename(filename))
    else:
        fname = urllib.parse.quote(sanitize_filename(content[:50].replace("\n", " ")))
    encoded = urllib.parse.quote(content)
    return f"obsidian://new?vault={''}&filename={fname}&content={encoded}"


# ===== HTTP Server =====
class MokaoHandler(BaseHTTPRequestHandler):
    # CORS
    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Max-Age", "3600")

    def _json(self, data, status=200):
        self.send_response(status)
        self._cors()
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.end_headers()
        self.wfile.write(json.dumps(data, ensure_ascii=False).encode("utf-8"))

    def _text(self, content, status=200, content_type="text/plain; charset=utf-8"):
        self.send_response(status)
        self._cors()
        self.send_header("Content-Type", content_type)
        self.end_headers()
        self.wfile.write(content.encode("utf-8") if isinstance(content, str) else content)

    def do_OPTIONS(self):
        self._cors()
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path.rstrip("/")

        if path == "/" or path == "":
            self._json({
                "service": "mokao-obsidian-server",
                "version": VERSION,
                "status": "running",
            })
        elif path == "/config":
            cfg = load_config()
            self._json({
                "vault_path": cfg["vault_path"],
                "port": cfg["port"],
                "folders": get_vault_folders(cfg["vault_path"]),
                "has_vault": bool(cfg["vault_path"]),
            })
        elif path == "/vaults":
            # 尝试发现常见位置的 Obsidian vault
            candidates = []
            home = Path.home()

            # Obsidian 默认 vault 位置
            search_paths = [
                home / "Obsidian",
                home / "Documents" / "Obsidian",
                home / "Documents" / " obsidian",
            ]
            for sp in search_paths:
                if sp.exists():
                    for vault in sorted(sp.iterdir()):
                        if vault.is_dir() and not vault.name.startswith("."):
                            candidates.append({
                                "name": vault.name,
                                "path": str(vault),
                                "type": "folder"
                            })
            self._json({"vaults": candidates})
        elif path == "/folders":
            cfg = load_config()
            self._json({
                "folders": get_vault_folders(cfg["vault_path"]),
            })
        else:
            self._json({"error": "unknown endpoint"}, 404)

    def do_POST(self):
        parsed = urlparse(self.path)
        path = parsed.path.rstrip("/")
        length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(length) if length > 0 else b""

        try:
            data = json.loads(body.decode("utf-8")) if body else {}
        except Exception:
            data = {}

        if path == "/save":
            self._handle_save(data)
        elif path == "/config":
            self._handle_config(data)
        elif path == "/open-uri":
            self._handle_open_uri(data)
        else:
            self._json({"error": "unknown endpoint"}, 404)

    def _handle_save(self, data):
        """保存 Markdown 到 Obsidian Vault"""
        cfg = load_config()
        vault = cfg["vault_path"]

        if not vault:
            self._json({"error": "vault_path_not_set", "message": "请先在设置中选择 Obsidian Vault 路径"}, 400)
            return

        content = data.get("content", "")
        filename = data.get("filename", "")
        folder = data.get("folder", "")  # vault 内子文件夹

        if not content:
            self._json({"error": "empty_content"}, 400)
            return

        # 解析文件名：支持 {{date}}、{{time}} 等占位符
        filename = self._render_filename(filename)

        if not filename.endswith(".md"):
            filename += ".md"

        filename = sanitize_filename(filename)

        # 构建完整路径
        base = Path(vault)
        if folder:
            base = base / folder
        full_path = base / filename

        try:
            saved_path = safe_write(full_path, content)
            rel = saved_path.relative_to(Path(vault))
            self._json({
                "ok": True,
                "path": str(saved_path),
                "relative_path": str(rel),
                "obsidian_uri": f"obsidian://open?vault={Path(vault).name}&file={rel}",
                "note": "文件已保存到 Obsidian Vault",
            })
        except Exception as e:
            self._json({"error": str(e)}, 500)

    def _render_filename(self, tmpl):
        """替换文件名模板变量"""
        from datetime import datetime
        now = datetime.now()
        replacements = {
            "{{date}}": now.strftime("%Y-%m-%d"),
            "{{time}}": now.strftime("%H%M%S"),
            "{{datetime}}": now.strftime("%Y-%m-%d_%H-%M-%S"),
            "{{year}}": str(now.year),
            "{{month}}": now.strftime("%m"),
            "{{day}}": now.strftime("%d"),
        }
        result = tmpl
        for k, v in replacements.items():
            result = result.replace(k, v)
        return result or "mokao_export"

    def _handle_config(self, data):
        """更新配置"""
        cfg = load_config()
        if "vault_path" in data:
            cfg["vault_path"] = data["vault_path"]
        if "port" in data:
            cfg["port"] = int(data["port"])
        save_config(cfg)
        self._json({"ok": True, "config": cfg})

    def _handle_open_uri(self, data):
        """生成 obsidian:// URI 并打开（适用于小文件，不通过服务器）"""
        content = data.get("content", "")
        filename = data.get("filename", "")
        vault = data.get("vault", "")

        # 超过 8KB 用服务器方式更可靠
        if len(content) > 8000:
            self._json({
                "error": "content_too_large",
                "message": f"内容 {len(content)} 字节，超出 URI 长度限制，请使用 /save 接口",
                "size": len(content),
            }, 400)
            return

        uri = obsidian_new_uri(content, filename)
        try:
            webbrowser.open(uri)
            self._json({"ok": True, "uri": uri, "note": "已在浏览器中打开 Obsidian"})
        except Exception as e:
            self._json({"error": str(e)}, 500)

    def log_message(self, format, *args):
        print(f"[mokao] {args[0]}")


def main():
    parser = argparse.ArgumentParser(description="Mokao Obsidian Server")
    parser.add_argument("--port", type=int, default=DEFAULT_PORT, help=f"服务器端口 (default: {DEFAULT_PORT})")
    parser.add_argument("--vault", type=str, default="", help="Obsidian Vault 根目录路径")
    args = parser.parse_args()

    cfg = load_config()
    port = args.port or cfg.get("port", DEFAULT_PORT)
    vault = args.vault or cfg.get("vault_path", "")

    if args.vault:
        cfg["vault_path"] = args.vault
        save_config(cfg)
        print(f"[OK] Vault set: {args.vault}")
    elif cfg["vault_path"]:
        print(f"[OK] Vault loaded: {cfg['vault_path']}")
    else:
        print("[!] No vault path, visit http://localhost:{port} to configure")

    print("")
    print(f"  Mokao Obsidian Server v{VERSION}")
    print(f"  Vault: {cfg['vault_path'] or '(not set)'}")
    print(f"  http://localhost:{port}")
    print(f"")
    print(f"  Press Ctrl+C to stop")
    print(f"  -------------------------------")

    server = HTTPServer(("localhost", port), MokaoHandler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nServer stopped")
        server.shutdown()


if __name__ == "__main__":
    main()