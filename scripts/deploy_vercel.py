#!/usr/bin/env python3
# Vercel REST API 直传部署（无需 CLI）：v13/deployments + v2/files
# 用法：VTK=<token> python3 scripts/deploy_vercel.py
import hashlib, json, os, sys, time, urllib.request

TOKEN = os.environ["VTK"]
TEAM = "team_qxZyPil3DifLec6ApHBFfXEs"
PROJECT = "mini-game-vercel"
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
API = "https://api.vercel.com"

FILES = [
    "api/action.js", "api/new-room.js", "api/state.js",
    "api/_lib/api.js", "api/_lib/engine.js", "api/_lib/logic.js", "api/_lib/store.js",
    "public/index.html",
    "public/assets/game-client.js", "public/assets/icons.js",
    "public/fxq/app.js", "public/fxq/engine.js", "public/fxq/index.html",
    "package.json", "package-lock.json", "vercel.json",
]

def req(method, path, body=None, raw=None, headers=None):
    url = API + path + ("&" if "?" in path else "?") + f"teamId={TEAM}"
    data = raw if raw is not None else (json.dumps(body).encode() if body is not None else None)
    r = urllib.request.Request(url, data=data, method=method)
    r.add_header("Authorization", "Bearer " + TOKEN)
    if body is not None: r.add_header("Content-Type", "application/json")
    if raw is not None: r.add_header("Content-Type", "application/octet-stream")
    for k, v in (headers or {}).items(): r.add_header(k, v)
    try:
        with urllib.request.urlopen(r) as resp:
            return resp.status, json.loads(resp.read() or b"{}")
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b"{}")

meta = []
for f in FILES:
    b = open(os.path.join(ROOT, f), "rb").read()
    meta.append({"file": f, "sha": hashlib.sha1(b).hexdigest(), "size": len(b)})

body = {"name": PROJECT, "target": "production", "files": meta}
code, resp = req("POST", "/v13/deployments?skipAutoDetectionConfirmation=1", body)

if code in (400, 409) and isinstance(resp.get("error", {}).get("missing"), list):
    bysha = {m["sha"]: m for m in meta}
    missing = resp["error"]["missing"]
    for sha in missing:
        m = bysha.get(sha)
        if not m: print("unknown missing sha", sha); sys.exit(1)
        raw = open(os.path.join(ROOT, m["file"]), "rb").read()
        c2, _ = req("POST", "/v2/files", raw=raw, headers={"x-vercel-digest": sha})
        if c2 not in (200, 201): print("upload fail", m["file"], c2); sys.exit(1)
    print(f"uploaded {len(missing)} missing files, redeploying...")
    code, resp = req("POST", "/v13/deployments?skipAutoDetectionConfirmation=1", body)

if code not in (200, 201):
    print("deploy create fail", code, json.dumps(resp)[:300]); sys.exit(1)

did, url = resp["id"], resp.get("url")
print(f"deployment created: {did} {url}")

for i in range(60):
    time.sleep(5)
    c3, d3 = req("GET", f"/v13/deployments/{did}")
    state = d3.get("readyState")
    if state in ("READY", "ERROR", "CANCELED"):
        print("state:", state)
        if state != "READY":
            print(json.dumps(d3.get("builds") or d3)[:500]); sys.exit(1)
        break
else:
    print("timeout"); sys.exit(1)

c4, d4 = req("GET", f"/v9/projects/{PROJECT}/domains")
print("domains:", json.dumps([d.get("name") for d in d4.get("domains", [])]))
print("PROD_URL: https://" + (d4.get("domains") or [{}])[0].get("name", url))
