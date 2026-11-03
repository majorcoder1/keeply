"""Link previews: the server fetches a page's title/description/picture, and must refuse to be
used to reach private or internal addresses (SSRF). Uses a local test website on 127.0.0.1:8191."""
import base64, hashlib, hmac, json, os, re, struct, sys, threading, time, urllib.error, urllib.request, uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

BASE = "http://127.0.0.1:8000"          # the real rules: private addresses refused
BASE_LOCAL = "http://127.0.0.1:8002"    # same app started with LINK_PREVIEW_ALLOW_PRIVATE=true (see README), so it can reach the local test website
SITE = "http://127.0.0.1:8191"
results = []
PNG = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==")


class Site(BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def send(self, code, ctype, body, extra=None):
        self.send_response(code); self.send_header("Content-Type", ctype); self.send_header("Content-Length", str(len(body)))
        for k, v in (extra or {}).items(): self.send_header(k, v)
        self.end_headers(); self.wfile.write(body)
    def do_GET(self):
        p = self.path
        if p == "/ok":
            self.send(200, "text/html; charset=utf-8", f'<html><head><title>Fallback title</title><meta property="og:title" content="Sermon &amp; Study: John 3"><meta property="og:description" content="  A talk on\n grace   and truth. <script>x</script>"><meta property="og:site_name" content="Test Church"><meta property="og:image" content="/img.png"></head><body>hi</body></html>'.encode())
        elif p == "/plain": self.send(200, "text/html", b"<html><head><title>Just a title</title></head><body>x</body></html>")
        elif p == "/img.png": self.send(200, "image/png", PNG)
        elif p == "/redirect-ok": self.send(302, "text/plain", b"", {"Location": "/ok"})
        elif p == "/loop": self.send(302, "text/plain", b"", {"Location": "/loop"})
        elif p == "/huge": self.send(200, "text/html", b"<html><head><title>Big page</title></head><body>" + b"x" * 3_000_000 + b"</body></html>")
        elif p == "/json": self.send(200, "application/json", b'{"title":"no"}')
        elif p == "/latin1": self.send(200, "text/html; charset=iso-8859-1", "<html><head><title>Café Crème</title></head></html>".encode("latin-1"))
        elif p == "/bigimage": self.send(200, "text/html", b'<html><head><title>Has big image</title><meta property="og:image" content="/big.png"></head></html>')
        elif p == "/big.png": self.send(200, "image/png", PNG + b"0" * 400_000)
        elif p == "/notimage": self.send(200, "text/html", b'<html><head><title>Image is not an image</title><meta property="og:image" content="/ok"></head></html>')
        elif p == "/slow": time.sleep(9); self.send(200, "text/html", b"<title>late</title>")
        elif p == "/empty": self.send(200, "text/html", b"<html><head></head><body></body></html>")
        else: self.send(404, "text/plain", b"no")

srv = ThreadingHTTPServer(("127.0.0.1", 8191), Site); threading.Thread(target=srv.serve_forever, daemon=True).start()

def req(method, path, token=None, body=None, base=None):
    h = {"Accept": "application/json", "Content-Type": "application/json"}
    if token: h["Authorization"] = f"Bearer {token}"
    r = urllib.request.Request((base or BASE) + path, data=json.dumps(body).encode() if body is not None else None, method=method, headers=h)
    try:
        with urllib.request.urlopen(r, timeout=60) as resp: return resp.status, json.loads(resp.read() or b"{}"), dict(resp.headers)
    except urllib.error.HTTPError as e:
        raw = e.read()
        try: return e.code, json.loads(raw), dict(e.headers)
        except Exception: return e.code, raw[:100], dict(e.headers)

def totp(secret, step):
    key = base64.b32decode(secret + "=" * (-len(secret) % 8)); h = hmac.new(key, struct.pack(">Q", step), hashlib.sha1).digest(); o = h[19] & 15
    return f"{(((h[o] & 0x7F) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3]) % 10**6:06d}"

def ok(name, cond, detail=""): results.append((name, bool(cond), detail))

def user():
    email = f"lp-{uuid.uuid4().hex[:6]}@example.test"
    _, d, _ = req("POST", "/api/register", body={"name": "lp", "email": email, "password": "secret-pass-123"}); tok = d["token"]
    _, s, _ = req("POST", "/api/two-factor/setup", tok); req("POST", "/api/two-factor/confirm", tok, body={"code": totp(s["secret"], int(time.time()) // 30)})
    return tok

try:
    tok = user()
    # ===== working previews (against the local test website) =====
    st, d, h = req("POST", "/api/link-preview", tok, base=BASE_LOCAL, body={"url": SITE + "/ok"})
    ok("a normal page gives title, description, site name and a picture", st == 200 and d["title"] == "Sermon & Study: John 3" and d["description"] == "A talk on grace and truth. x" and d["site"] == "Test Church" and d["image"] and d["image"].startswith("data:image/png;base64,"), f"{st} {str(d)[:160]}")
    ok("text is cleaned: tags stripped, spaces collapsed, entities decoded", "<" not in d["title"] + d["description"] and "  " not in d["description"])
    ok("the response is marked private (not cacheable by shared caches)", "private" in h.get("Cache-Control", ""), h.get("Cache-Control", ""))
    st, d, _ = req("POST", "/api/link-preview", tok, base=BASE_LOCAL, body={"url": SITE + "/plain"}); ok("a page with only a <title> still works (no picture)", st == 200 and d["title"] == "Just a title" and d["image"] is None and d["site"] == "127.0.0.1", f"{st} {d}")
    st, d, _ = req("POST", "/api/link-preview", tok, base=BASE_LOCAL, body={"url": SITE + "/redirect-ok"}); ok("a normal redirect is followed", st == 200 and d["title"] == "Sermon & Study: John 3", f"{st} {d}")
    st, d, _ = req("POST", "/api/link-preview", tok, base=BASE_LOCAL, body={"url": SITE + "/loop"}); ok("a redirect loop stops (422)", st == 422, f"{st}")
    st, d, _ = req("POST", "/api/link-preview", tok, base=BASE_LOCAL, body={"url": SITE + "/huge"}); ok("a 3 MB page is cut off and its title still found", st == 200 and d["title"] == "Big page", f"{st} {d}")
    st, d, _ = req("POST", "/api/link-preview", tok, base=BASE_LOCAL, body={"url": SITE + "/json"}); ok("a non-web page (JSON) is refused", st == 422, f"{st}")
    st, d, _ = req("POST", "/api/link-preview", tok, base=BASE_LOCAL, body={"url": SITE + "/latin1"}); ok("an old-style (latin-1) page reads correctly", st == 200 and d["title"] == "Café Crème", f"{st} {d}")
    st, d, _ = req("POST", "/api/link-preview", tok, base=BASE_LOCAL, body={"url": SITE + "/bigimage"}); ok("an oversized picture is dropped, the rest kept", st == 200 and d["title"] == "Has big image" and d["image"] is None, f"{st} {str(d)[:100]}")
    st, d, _ = req("POST", "/api/link-preview", tok, base=BASE_LOCAL, body={"url": SITE + "/notimage"}); ok("a 'picture' that isn't an image is dropped", st == 200 and d["image"] is None, f"{st}")
    t0 = time.time(); st, d, _ = req("POST", "/api/link-preview", tok, base=BASE_LOCAL, body={"url": SITE + "/slow"}); ok("a slow site gives up (422) within the time limit", st == 422 and time.time() - t0 < 9, f"{st} {time.time()-t0:.1f}s")
    st, d, _ = req("POST", "/api/link-preview", tok, base=BASE_LOCAL, body={"url": SITE + "/missing"}); ok("a 404 page is refused (422)", st == 422, f"{st}")
    st, d, _ = req("POST", "/api/link-preview", tok, base=BASE_LOCAL, body={"url": SITE + "/empty"}); ok("a page with nothing to show is refused (422)", st == 422, f"{st}")
    st, d, _ = req("POST", "/api/link-preview", None, base=BASE_LOCAL, body={"url": SITE + "/ok"}); ok("needs sign-in", st == 401, f"{st}")
    reg = req("POST", "/api/register", body={"name": "n", "email": f"n{uuid.uuid4().hex[:6]}@example.test", "password": "secret-pass-123"})[1]["token"]
    st, d, _ = req("POST", "/api/link-preview", reg, base=BASE_LOCAL, body={"url": SITE + "/ok"}); ok("needs two-factor to be on", st == 403, f"{st}")
    st, d, _ = req("POST", "/api/link-preview", tok, base=BASE_LOCAL, body={"url": ""}); ok("an empty address is refused (422)", st == 422, f"{st}")

    # ===== the safety rules (private addresses refused: the default on the real server) =====
    bad = {
        "this computer (127.0.0.1)": SITE + "/ok", "localhost": "http://localhost/", "an internal 10.x address": "http://10.0.0.1/",
        "an internal 192.168.x address": "http://192.168.1.1/", "172.16.x address": "http://172.16.5.5/", "the cloud metadata address": "http://169.254.169.254/latest/meta-data/",
        "carrier-grade NAT 100.64.x": "http://100.64.0.1/", "0.0.0.0": "http://0.0.0.0/", "an IPv6 address": "http://[::1]/",
        "a number-style address (2130706433)": "http://2130706433/", "a file:// address": "file:///etc/passwd", "an ftp:// address": "ftp://example.com/",
        "a gopher:// address": "gopher://example.com/", "a javascript: address": "javascript:alert(1)", "a password in the address": "http://user:pass@example.com/",
        "an unusual port (22)": "http://example.com:22/", "no address at all": "http://", "plain text": "not a url",
    }
    for label, url in bad.items():
        st, d, _ = req("POST", "/api/link-preview", tok, {"url": url}); ok(f"refused: {label}", st == 422, f"{st} {str(d)[:80]}")
    codes = [req("POST", "/api/link-preview", tok, {"url": "http://10.0.0.1/"})[0] for _ in range(45)]
    ok("a flood of requests is rate limited (429)", 429 in codes, str(sorted(set(codes))))
finally:
    srv.shutdown()

w = max(len(n) for n, _, _ in results)
for n, good, det in results: print(("PASS " if good else "FAIL ") + n.ljust(w) + ("" if good else "   <- " + str(det)))
print(f"\n{sum(g for _, g, _ in results)} of {len(results)} passed"); sys.exit(0 if all(g for _, g, _ in results) else 1)
