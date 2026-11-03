"""Logging in with the 24-digit number: the server side. Run against the test server on :8000."""
import base64, hashlib, hmac, json, secrets, struct, sys, time, urllib.error, urllib.request, uuid

BASE = "http://127.0.0.1:8000"
results = []

def req(method, path, token=None, body=None):
    h = {"Accept": "application/json", "Content-Type": "application/json"}
    if token: h["Authorization"] = f"Bearer {token}"
    r = urllib.request.Request(BASE + path, data=json.dumps(body).encode() if body is not None else None, method=method, headers=h)
    try:
        with urllib.request.urlopen(r, timeout=60) as resp: return resp.status, json.loads(resp.read() or b"{}")
    except urllib.error.HTTPError as e:
        raw = e.read()
        try: return e.code, json.loads(raw)
        except Exception: return e.code, raw[:100]

def totp(secret, step):
    key = base64.b32decode(secret + "=" * (-len(secret) % 8)); h = hmac.new(key, struct.pack(">Q", step), hashlib.sha1).digest(); o = h[19] & 15
    return f"{(((h[o] & 0x7F) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3]) % 10**6:06d}"

def ok(name, cond, detail=""): results.append((name, bool(cond), detail))
hexid = lambda: secrets.token_hex(32)
salt = lambda: base64.urlsafe_b64encode(secrets.token_bytes(16)).decode().rstrip("=")

def account(with_key=True, with_number=True, two_factor=True):
    email = f"num-{uuid.uuid4().hex[:8]}@example.test"
    _, d = req("POST", "/api/register", body={"name": "num", "email": email, "password": "secret-pass-123"}); tok = d["token"]
    sec = None
    if two_factor:
        _, s = req("POST", "/api/two-factor/setup", tok); sec = s["secret"]
        req("POST", "/api/two-factor/confirm", tok, body={"code": totp(sec, int(time.time()) // 30 - 1)})
    lid, lauth = hexid(), hexid()
    if with_key:
        body = {"salt": salt(), "check": "enc1:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"}
        if with_number: body.update(login_id=lid, login_auth=lauth)
        st, d = req("POST", "/api/key", tok, body)
        assert st == 200, (st, d)
    return dict(email=email, token=tok, secret=sec, lid=lid, lauth=lauth)

try:
    # ===== saving the number with the key =====
    a = account()
    st, me = req("GET", "/api/user", a["token"])
    ok("after the key is saved the account says number login is on", st == 200 and me.get("number_set") is True and me.get("key_set") is True, str(me)[:120])
    ok("the lookup values are never sent back to the app", "number_id" not in me and "number_auth" not in me)
    st, d = req("POST", "/api/key", a["token"], {"salt": salt(), "check": "enc1:xxxxxxxxxxxxxxxxxxxxxxxx", "login_id": hexid(), "login_auth": hexid()})
    ok("a second key is refused (409), the number can't be swapped that way", st == 409, f"{st}")

    # ===== logging in with the number =====
    st, d = req("POST", "/api/login/number", body={"login_id": a["lid"], "login_auth": a["lauth"]})
    ok("the right number gives a two-factor challenge, no token yet", st == 200 and d.get("two_factor") is True and d.get("challenge") and "token" not in d, f"{st} {str(d)[:80]}")
    st, d2 = req("POST", "/api/two-factor/challenge", body={"challenge": d["challenge"], "code": totp(a["secret"], int(time.time()) // 30)})
    ok("the authenticator code then gives a token and the key salt + check for unlocking", st == 200 and d2.get("token") and d2["user"].get("key_salt") and d2["user"].get("key_check", "").startswith("enc1:"), f"{st} {str(d2)[:100]}")
    st, me2 = req("GET", "/api/user", d2["token"]); ok("that token works", st == 200 and me2["email"] == a["email"], f"{st}")
    ok("the challenge from a number login can't be used twice", req("POST", "/api/two-factor/challenge", body={"challenge": d["challenge"], "code": totp(a["secret"], int(time.time()) // 30 + 1)})[0] == 422)

    # ===== refusals =====
    st, d = req("POST", "/api/login/number", body={"login_id": a["lid"], "login_auth": hexid()}); ok("a wrong proof is refused (422)", st == 422, f"{st} {str(d)[:100]}")
    msg1 = str(d)
    st, d = req("POST", "/api/login/number", body={"login_id": hexid(), "login_auth": hexid()}); ok("an unknown number is refused (422)", st == 422, f"{st}")
    ok("with the same message, so it doesn't reveal which numbers exist", str(d) == msg1, f"{msg1} / {d}")
    for label, body in {"no values": {}, "short values": {"login_id": "abc", "login_auth": "def"}, "capital letters": {"login_id": "A" * 64, "login_auth": "B" * 64}, "the id only": {"login_id": a["lid"]}, "a plain 24-digit number": {"login_id": "123456789012345678901234", "login_auth": "x"}}.items():
        ok(f"refused: {label}", req("POST", "/api/login/number", body=body)[0] == 422)
    b = account(with_number=False)
    ok("an account whose key has no number can't log in that way", req("POST", "/api/login/number", body={"login_id": b["lid"], "login_auth": b["lauth"]})[0] == 422)
    c = account(with_key=False)
    ok("an account with no key yet has no number login", req("POST", "/api/login/number", body={"login_id": c["lid"], "login_auth": c["lauth"]})[0] == 422)
    d_ = account()
    st, _ = req("POST", "/api/key", c["token"], {"salt": salt(), "check": "enc1:yyyyyyyyyyyyyyyyyyyyyyyyyyyy", "login_id": d_["lid"], "login_auth": hexid()})
    ok("a lookup value that another account already has is refused", st == 409, f"{st}")

    # ===== adding the number to an account that has a key without one =====
    st, d = req("PUT", "/api/key/number", b["token"], {"login_id": b["lid"], "login_auth": b["lauth"]})
    ok("an account made before number login can add it", st == 200 and d.get("number_set") is True, f"{st} {str(d)[:100]}")
    ok("and can then log in with it", req("POST", "/api/login/number", body={"login_id": b["lid"], "login_auth": b["lauth"]})[1].get("two_factor") is True)
    ok("it can't be replaced once set (409)", req("PUT", "/api/key/number", b["token"], {"login_id": hexid(), "login_auth": hexid()})[0] == 409)
    ok("an account without a key can't add one (422)", req("PUT", "/api/key/number", c["token"], {"login_id": hexid(), "login_auth": hexid()})[0] == 422)
    ok("it needs sign-in", req("PUT", "/api/key/number", None, {"login_id": hexid(), "login_auth": hexid()})[0] == 401)
    ok("and two-factor to be on", req("PUT", "/api/key/number", req("POST", "/api/register", body={"name": "n", "email": f"n{uuid.uuid4().hex[:6]}@example.test", "password": "secret-pass-123"})[1]["token"], {"login_id": hexid(), "login_auth": hexid()})[0] == 403)
    ok("the other account's number was not touched", req("POST", "/api/login/number", body={"login_id": d_["lid"], "login_auth": d_["lauth"]})[1].get("two_factor") is True)

    # ===== losing the number erases the account's data and its number login =====
    st, d = req("POST", "/api/key/reset", d_["token"], {"password": "secret-pass-123"})
    ok("erasing and starting over turns that number off", st == 200 and d.get("number_set") is False and d.get("key_set") is False, f"{st} {str(d)[:100]}")
    ok("so the old number no longer logs in", req("POST", "/api/login/number", body={"login_id": d_["lid"], "login_auth": d_["lauth"]})[0] == 422)

    # ===== email login is unchanged =====
    st, d = req("POST", "/api/login", body={"email": a["email"], "password": "secret-pass-123"})
    ok("email and password still log in (and still need the code)", st == 200 and d.get("two_factor") is True)

    # ===== rate limit =====
    lid = hexid(); codes = [req("POST", "/api/login/number", body={"login_id": lid, "login_auth": hexid()})[0] for _ in range(9)]
    ok("too many tries on one number are slowed down (429)", 429 in codes and codes[:6] == [422] * 6, str(codes))
    ok("a different number isn't affected", req("POST", "/api/login/number", body={"login_id": hexid(), "login_auth": hexid()})[0] == 422)
except Exception as e:
    import traceback; ok("script ran to the end", False, traceback.format_exc()[-300:])

bad = [r for r in results if not r[1]]
for n, c, d in results: print(("PASS " if c else "FAIL ") + n + ("" if c or not d else "  -> " + d))
print(f"\n{len(results)-len(bad)}/{len(results)} passed"); sys.exit(1 if bad else 0)
