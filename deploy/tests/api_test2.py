"""Checks of the new Keeply server rules: two-factor, key storage, refusal of readable data."""
import base64, hashlib, hmac, json, os, struct, sys, time, urllib.error, urllib.request, uuid, sqlite3

BASE = "http://127.0.0.1:8000"
S = os.path.dirname(os.path.abspath(__file__))
API = os.path.expanduser("~/keeply-dev/api")
DB = f"{API}/database/test.sqlite"
DISK = f"{API}/storage/app/public"
results = []


def req(method, path, token=None, body=None, files=None, fields=None, raw=False):
    h = {"Accept": "application/json"}
    if token:
        h["Authorization"] = f"Bearer {token}"
    data = None
    if files is not None or fields is not None:
        b = uuid.uuid4().hex
        parts = []
        for k, v in (fields or {}).items():
            parts.append(f'--{b}\r\nContent-Disposition: form-data; name="{k}"\r\n\r\n{v}\r\n'.encode())
        for k, (name, blob, ctype) in (files or {}).items():
            parts.append(f'--{b}\r\nContent-Disposition: form-data; name="{k}"; filename="{name}"\r\nContent-Type: {ctype}\r\n\r\n'.encode() + blob + b"\r\n")
        parts.append(f"--{b}--\r\n".encode())
        data = b"".join(parts)
        h["Content-Type"] = f"multipart/form-data; boundary={b}"
    elif body is not None:
        data = json.dumps(body).encode()
        h["Content-Type"] = "application/json"
    r = urllib.request.Request(BASE + path, data=data, method=method, headers=h)
    try:
        with urllib.request.urlopen(r, timeout=60) as resp:
            blob = resp.read()
            return resp.status, (blob if raw else j(blob))
    except urllib.error.HTTPError as e:
        blob = e.read()
        return e.code, (blob if raw else j(blob))


def j(blob):
    try:
        return json.loads(blob)
    except Exception:
        return blob[:200]


def ok(name, cond, detail=""):
    results.append((name, bool(cond), detail))


def totp(secret, step):
    key = base64.b32decode(secret + "=" * (-len(secret) % 8))
    h = hmac.new(key, struct.pack(">Q", step), hashlib.sha1).digest()
    o = h[19] & 15
    n = ((h[o] & 0x7F) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3]
    return f"{n % 10**6:06d}"


def now_step():
    return int(time.time()) // 30


def envelope(n=64):
    return b"KPLY1" + os.urandom(12) + os.urandom(n)


def register(tag):
    email = f"{tag}-{uuid.uuid4().hex[:6]}@example.test"
    st, d = req("POST", "/api/register", body={"name": tag, "email": email, "password": "secret-pass-123"})
    return email, d.get("token"), d


def enrol(token):
    st, d = req("POST", "/api/two-factor/setup", token)
    secret = d["secret"]
    return secret


def disk_path(url):
    return os.path.join(DISK, url[len("/storage/"):])


def col(sql, *a):
    con = sqlite3.connect(DB); r = con.execute(sql, a).fetchall(); con.close(); return r


# ===== 1. an old account (no two-factor yet, readable notes) =====
st, d = req("POST", "/api/login", body={"email": "legacy@example.test", "password": "legacy-pass-123"})
ltok = d.get("token")
ok("old account signs in with just a password (not enrolled yet)", st == 200 and ltok and d["user"]["two_factor_enabled"] is False and d["user"]["key_set"] is False, f"{st} {str(d)[:150]}")
ok("user JSON hides the secret columns", all(k not in d["user"] for k in ("two_factor_secret", "two_factor_recovery_codes", "two_factor_last_step", "number_id", "number_auth")), str(list(d["user"])))
st, d = req("GET", "/api/notes", ltok)
ok("before two-factor, notes are closed (403 + flag)", st == 403 and d.get("two_factor_required") is True, f"{st} {d}")
for path in ("/api/recordings", "/api/folders"):
    st, d = req("GET", path, ltok); ok(f"before two-factor, {path} is closed", st == 403, f"{st}")
st, d = req("POST", "/api/images", ltok, files={"image": ("a.enc", envelope(), "application/octet-stream")}); ok("before two-factor, uploads are closed", st == 403, f"{st}")
st, d = req("GET", "/api/user", ltok); ok("/user still works so the app knows what to ask", st == 200 and d["two_factor_enabled"] is False)

# ===== 2. turning two-factor on =====
st, d = req("POST", "/api/two-factor/setup", ltok)
secret = d.get("secret")
ok("setup returns a secret and an otpauth link", st == 200 and secret and d["otpauth"].startswith("otpauth://totp/Keeply%3Alegacy%40example.test?secret="), f"{st} {d}")
st, d = req("POST", "/api/two-factor/confirm", ltok, body={"code": "000000"}); ok("confirm with a wrong code is refused", st == 422, f"{st} {d}")
st, d = req("POST", "/api/two-factor/confirm", ltok, body={"code": totp(secret, now_step())})
recov = d.get("recovery_codes", [])
ok("confirm with the right code turns it on and returns 8 recovery codes", st == 200 and len(recov) == 8 and d["user"]["two_factor_enabled"] is True, f"{st} {str(d)[:200]}")
ok("recovery codes look like xxxxx-xxxxx", all(len(c) == 11 and c[5] == "-" for c in recov), str(recov[:2]))
st, d = req("POST", "/api/two-factor/setup", ltok); ok("can't run setup again once on", st == 409, f"{st}")
st, d = req("GET", "/api/notes", ltok)
ok("after two-factor, notes open again (still readable: not migrated yet)", st == 200 and any("SECRET-ALPHA" in (n.get("title") or "") for n in d), f"{st}")
stored = col("select two_factor_secret from users where email='legacy@example.test'")[0][0]
ok("authenticator secret is stored encrypted, not as plain text", stored and secret not in stored, stored[:40])

# ===== 3. signing in with two-factor =====
st, d = req("POST", "/api/login", body={"email": "legacy@example.test", "password": "wrong"})
ok("wrong password still fails", st == 422, f"{st}")
st, d = req("POST", "/api/login", body={"email": "legacy@example.test", "password": "legacy-pass-123"})
chal = d.get("challenge")
ok("right password but 2FA on -> challenge, NO token", st == 200 and d.get("two_factor") is True and chal and "token" not in d, f"{st} {str(d)[:120]}")
st, d = req("POST", "/api/two-factor/challenge", body={"challenge": chal, "code": "123456"}); ok("wrong code refused", st == 422, f"{st}")
st, d = req("POST", "/api/two-factor/challenge", body={"challenge": chal, "code": totp(secret, now_step())})
ok("the code used to turn it on can't be used again (replay)", st == 422, f"{st} {str(d)[:100]}")
st, d = req("POST", "/api/two-factor/challenge", body={"challenge": "garbage", "code": "123456"}); ok("forged challenge refused", st == 422, f"{st}")
st, d = req("POST", "/api/two-factor/challenge", body={"challenge": chal, "code": totp(secret, now_step() + 1)})
tok2 = d.get("token")
ok("next 30-second code signs in and returns a token", st == 200 and tok2 and d["user"]["email"] == "legacy@example.test", f"{st} {str(d)[:100]}")
st, d = req("POST", "/api/two-factor/challenge", body={"challenge": chal, "code": totp(secret, now_step() + 1)}); ok("a used challenge can't be reused", st == 422, f"{st}")
st, d = req("GET", "/api/notes", tok2); ok("token from 2FA sign-in works", st == 200, f"{st}")

st, d = req("POST", "/api/login", body={"email": "legacy@example.test", "password": "legacy-pass-123"}); chal2 = d["challenge"]
st, d = req("POST", "/api/two-factor/challenge", body={"challenge": chal2, "recovery_code": recov[0]})
ok("a recovery code signs in", st == 200 and d.get("token"), f"{st} {str(d)[:100]}")
st, d = req("POST", "/api/login", body={"email": "legacy@example.test", "password": "legacy-pass-123"}); chal3 = d["challenge"]
st, d = req("POST", "/api/two-factor/challenge", body={"challenge": chal3, "recovery_code": recov[0]}); ok("a recovery code works only once", st == 422, f"{st}")
st, d = req("POST", "/api/two-factor/challenge", body={"challenge": chal3, "recovery_code": recov[1].upper().replace("-", " ")}); ok("recovery codes ignore case, spaces and dashes", st == 200, f"{st}")

# lock-out after repeated wrong codes
st, d = req("POST", "/api/login", body={"email": "legacy@example.test", "password": "legacy-pass-123"}); chal4 = d["challenge"]
for _ in range(5):
    req("POST", "/api/two-factor/challenge", body={"challenge": chal4, "code": "111111"})
st, d = req("POST", "/api/two-factor/challenge", body={"challenge": chal4, "recovery_code": recov[2]})
ok("5 wrong codes lock the account for a while, even a right recovery code", st == 422 and "Too many" in json.dumps(d), f"{st} {str(d)[:150]}")
con = sqlite3.connect(DB)
con.execute("delete from cache where key like '%2fa-attempts%'"); con.commit(); con.close()

# ===== 4. a fresh account: key, refusal of readable data =====
email, tok, d = register("fresh")
ok("new account gets a token but no two-factor yet", tok and d["user"]["two_factor_enabled"] is False)
st, d = req("POST", "/api/key", tok, body={"salt": "A" * 22, "check": "enc1:abc"}); ok("key can't be saved before two-factor", st == 403, f"{st}")
fsecret = enrol(tok)
st, d = req("POST", "/api/two-factor/confirm", tok, body={"code": totp(fsecret, now_step())}); ok("fresh account turns on 2FA", st == 200)
st, d = req("POST", "/api/key", tok, body={"salt": "short", "check": "enc1:abc"}); ok("bad salt refused", st == 422, f"{st}")
st, d = req("POST", "/api/key", tok, body={"salt": "A" * 22, "check": "plain text"}); ok("key check must be an enc1: block", st == 422, f"{st}")
st, d = req("POST", "/api/key", tok, body={"salt": "A" * 22, "check": "enc1:abcdef"})
ok("key salt + check saved", st == 200 and d["key_set"] is True and d["key_salt"] == "A" * 22 and d["key_check"] == "enc1:abcdef", f"{st} {str(d)[:150]}")
st, d = req("POST", "/api/key", tok, body={"salt": "B" * 22, "check": "enc1:zzz"}); ok("a second key can't overwrite the first (409)", st == 409, f"{st}")
st, d = req("GET", "/api/user", tok); ok("/user returns key_salt and key_check for new devices", d["key_salt"] == "A" * 22 and d["key_check"] == "enc1:abcdef")

st, d = req("POST", "/api/notes", tok, body={"title": "Hello", "body": "enc1:abc"}); ok("note with a readable title is refused", st == 422 and "Update Keeply" in json.dumps(d), f"{st}")
st, d = req("POST", "/api/notes", tok, body={"title": "", "body": "readable body"}); ok("note with a readable body is refused", st == 422, f"{st}")
st, d = req("POST", "/api/notes", tok, body={"title": "", "body": "enc1:abc", "tags": ["x"]}); ok("note with readable labels is refused", st == 422, f"{st}")
st, d = req("POST", "/api/notes", tok, body={"title": "", "body": "enc1:abc", "images": ["/storage/images/9/x.jpg"]}); ok("note listing a readable/other photo is refused", st == 422, f"{st}")
st, d = req("POST", "/api/notes", tok, body={"title": "", "body": "enc1:AAAA", "tags": [], "color": "yellow", "pinned": True})
nid = d.get("id")
ok("encrypted note accepted, colour and pin stay plain", st == 201 and d["body"] == "enc1:AAAA" and d["pinned"] is True and d["color"] == "yellow", f"{st} {str(d)[:150]}")
st, d = req("POST", "/api/folders", tok, body={"name": "Prayer"}); ok("readable folder name refused", st == 422, f"{st}")
st, d = req("POST", "/api/folders", tok, body={"name": "enc1:FOLDERNAME"}); fid = d.get("id"); ok("encrypted folder name accepted", st == 201, f"{st}")
st, d = req("PUT", f"/api/notes/{nid}", tok, body={"title": "", "body": "enc1:BBBB", "folder_id": fid}); ok("note can be filed in own folder", st == 200 and d["folder_id"] == fid, f"{st}")
st, d = req("GET", "/api/folders", tok); sysf = [f for f in d if f["system"]]; ok("starter folders are still plain", {f["name"] for f in sysf} == {"Record", "Work", "Personal"}, str(d))
st, d = req("PUT", f"/api/folders/{sysf[0]['id']}", tok, body={"name": "enc1:X"}); ok("starter folders can't be renamed", st == 422, f"{st}")

# photos and recordings
st, d = req("POST", "/api/images", tok, files={"image": ("photo.jpg", open(f"{S}/work/test.jpg", "rb").read(), "image/jpeg")}); ok("readable photo upload refused", st == 422 and "Update Keeply" in json.dumps(d), f"{st}")
st, d = req("POST", "/api/images", tok, files={"image": ("p.enc", b"KPLY1", "application/octet-stream")}); ok("photo that is only the marker refused", st == 422, f"{st}")
blob = envelope(300)
st, d = req("POST", "/api/images", tok, files={"image": ("p.enc", blob, "application/octet-stream")}); img = d.get("url")
ok("encrypted photo accepted, stored as .enc", st == 201 and img and img.endswith(".enc") and img.startswith("/storage/images/"), f"{st} {d}")
st, got = req("GET", img, raw=True); ok("encrypted photo downloads byte-for-byte", st == 200 and got == blob, f"{st} {len(got)}")
ok("the file on disk is the scrambled bytes, no jpeg inside", open(f"{DISK}/{img[len('/storage/'):]}", "rb").read() == blob)
st, d = req("POST", "/api/notes", tok, body={"title": "", "body": "enc1:CCCC", "images": [img]}); n2 = d.get("id"); ok("note with its own .enc photo accepted", st == 201 and d["images"] == [img], f"{st} {str(d)[:100]}")
st, d = req("PUT", f"/api/notes/{n2}", tok, body={"title": "", "body": "enc1:CCCC", "images": []}); ok("removing the photo from the note deletes the file", st == 200 and not os.path.exists(f"{DISK}/{img[len('/storage/'):]}"), f"{st}")

st, d = req("POST", "/api/recordings", tok, files={"audio": ("r.webm", open(f"{S}/work/test.webm", "rb").read(), "audio/webm")}, fields={"duration": "3", "title": "enc1:TITLE", "mime": "audio/webm"}); ok("readable recording refused", st == 422 and "Update Keeply" in json.dumps(d), f"{st}")
rblob = envelope(5000)
st, d = req("POST", "/api/recordings", tok, files={"audio": ("r.enc", rblob, "application/octet-stream")}, fields={"duration": "3", "title": "Recording", "mime": "audio/webm"}); ok("recording with a readable title refused", st == 422, f"{st}")
st, d = req("POST", "/api/recordings", tok, files={"audio": ("r.enc", rblob, "application/octet-stream")}, fields={"duration": "3", "title": "enc1:TITLE", "mime": "video/x-evil"}); ok("odd recording type refused", st == 422, f"{st}")
st, d = req("POST", "/api/recordings", tok, files={"audio": ("r.enc", rblob, "application/octet-stream")}, fields={"duration": "3", "title": "enc1:TITLE", "mime": "audio/mp4", "note_id": str(nid)})
rid = d.get("id"); rurl = d.get("url", "")
ok("encrypted recording accepted (.enc, mime kept, title kept)", st == 201 and rurl.endswith(".enc") and d["mime"] == "audio/mp4" and d["title"] == "enc1:TITLE", f"{st} {str(d)[:160]}")
st, got = req("GET", rurl.replace("http://localhost:8000", ""), raw=True); ok("recording downloads byte-for-byte", st == 200 and got == rblob, f"{st}")
other_email, other_tok, _ = register("other"); osec = enrol(other_tok); req("POST", "/api/two-factor/confirm", other_tok, body={"code": totp(osec, now_step())})
st, d = req("POST", "/api/recordings", other_tok, files={"audio": ("r.enc", rblob, "application/octet-stream")}, fields={"title": "enc1:T", "mime": "audio/webm", "note_id": str(nid)}); ok("can't attach a recording to someone else's note", st == 422, f"{st}")
st, d = req("PUT", f"/api/notes/{nid}", other_tok, body={"title": "", "body": "enc1:HIJACK"}); ok("can't edit someone else's note", st == 403, f"{st}")
st, d = req("DELETE", f"/api/recordings/{rid}", other_tok); ok("can't delete someone else's recording", st == 403, f"{st}")

# AI endpoints are gone
for p in ("/api/transcribe", "/api/summarize"):
    st, d = req("POST", p, tok, body={"text": "x"}); ok(f"{p} no longer exists", st in (404, 405), f"{st}")

# ===== 5. password change signs other devices out =====
email2, tokA, _ = register("pw"); sec = enrol(tokA); req("POST", "/api/two-factor/confirm", tokA, body={"code": totp(sec, now_step())})
st, d = req("POST", "/api/login", body={"email": email2, "password": "secret-pass-123"})
st, d2 = req("POST", "/api/two-factor/challenge", body={"challenge": d["challenge"], "code": totp(sec, now_step() + 1)}); tokB = d2.get("token")
st, d = req("POST", "/api/password", tokA, body={"password": "brand-new-pass-1"})
st1, _ = req("GET", "/api/user", tokA); st2, _ = req("GET", "/api/user", tokB)
ok("password change keeps this device, signs the other one out", st == 200 and st1 == 200 and st2 == 401, f"{st} {st1} {st2}")

# ===== profile picture =====
st, d = req("POST", "/api/images", tok, files={"image": ("a.enc", envelope(400), "application/octet-stream")}); av1 = d.get("url")
st, d = req("PUT", "/api/avatar", tok, body={"url": av1})
ok("avatar: can be set from the person's own locked image", st == 200 and d["avatar"] == av1, f"{st} {str(d)[:120]}")
st, d = req("GET", "/api/user", tok); ok("avatar: comes back with the user", d.get("avatar") == av1)
st, d = req("POST", "/api/images", tok, files={"image": ("b.enc", envelope(500), "application/octet-stream")}); av2 = d.get("url")
st, d = req("PUT", "/api/avatar", tok, body={"url": av2})
ok("avatar: replacing it deletes the old file", st == 200 and d["avatar"] == av2 and not os.path.exists(disk_path(av1)) and os.path.exists(disk_path(av2)), f"{st}")
st, d = req("POST", "/api/images", other_tok, files={"image": ("o.enc", envelope(200), "application/octet-stream")}); img_other = d.get("url")
st, d = req("PUT", "/api/avatar", tok, body={"url": img_other}); ok("avatar: another person's image is refused", st == 422, f"{st}")
st, d = req("PUT", "/api/avatar", tok, body={"url": "/storage/images/1/readable.jpg"}); ok("avatar: a readable (non-.enc) image is refused", st == 422, f"{st}")
st, d = req("PUT", "/api/avatar", tok, body={"url": "https://evil.example/x.enc"}); ok("avatar: an outside address is refused", st == 422, f"{st}")
st, d = req("PUT", "/api/avatar", tok, body={"url": av2.replace(".enc", "zz.enc")}); ok("avatar: a file that doesn't exist is refused", st == 422, f"{st}")
st, d = req("PUT", "/api/avatar", None, body={"url": av2}); ok("avatar: needs sign-in", st == 401, f"{st}")
_, nt, _ = register("avatar-no2fa"); st, d = req("PUT", "/api/avatar", nt, body={"url": av2}); ok("avatar: needs two-factor first", st == 403, f"{st}")
st, d = req("DELETE", "/api/avatar", tok)
ok("avatar: removing it clears it and deletes the file", st == 200 and d["avatar"] is None and not os.path.exists(disk_path(av2)), f"{st} {str(d)[:100]}")
st, d = req("POST", "/api/images", tok, files={"image": ("c.enc", envelope(300), "application/octet-stream")}); av3 = d.get("url")
req("PUT", "/api/avatar", tok, body={"url": av3})

# ===== 6. "I lost my key": erase and start again =====
st, d = req("POST", "/api/key/reset", tok, body={"password": "nope"}); ok("reset needs the right password", st == 422, f"{st}")
files_before = [p for p in (f"{DISK}/{rurl.split('/storage/')[1]}",) if os.path.exists(p)]
st, d = req("POST", "/api/key/reset", tok, body={"password": "secret-pass-123"})
ok("reset clears the key (and the profile picture)", st == 200 and d["key_set"] is False and d["key_salt"] is None and d["avatar"] is None, f"{st} {str(d)[:100]}")
st, nd = req("GET", "/api/notes", tok); st3, rc = req("GET", "/api/recordings", tok); st4, fl = req("GET", "/api/folders", tok)
ok("reset erased notes and recordings, kept the 3 starter folders", nd == [] and rc == [] and len(fl) == 3 and all(f["system"] for f in fl), f"{nd} {rc} {len(fl)}")
ok("reset deleted the stored files", files_before and not os.path.exists(files_before[0]))
st, d = req("POST", "/api/key", tok, body={"salt": "C" * 22, "check": "enc1:new"}); ok("a new key can be made after reset", st == 200 and d["key_set"], f"{st}")

# ===== 7. sign-in rate limit =====
codes = [req("POST", "/api/login", body={"email": "ratelimit@example.test", "password": "x"})[0] for _ in range(8)]
ok("sign-in is rate limited per email (429 after 6)", 429 in codes and codes[:6] == [422] * 6, str(codes))

w = max(len(n) for n, _, _ in results)
for n, good, det in results:
    print(("PASS " if good else "FAIL ") + n.ljust(w) + ("" if good else "   <- " + str(det)))
print(f"\n{sum(g for _, g, _ in results)} of {len(results)} passed")
sys.exit(0 if all(g for _, g, _ in results) else 1)
