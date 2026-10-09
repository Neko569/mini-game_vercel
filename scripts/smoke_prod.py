#!/usr/bin/env python3
# 线上冒烟：静态页 / 建房 / 双人入座 / 开局 / 自动走子 / 长轮询
import json, urllib.request

BASE = "https://mini-game-vercel.vercel.app"

def get(path):
    with urllib.request.urlopen(BASE + path, timeout=35) as r:
        return r.status, r.read()

def post(body):
    r = urllib.request.Request(BASE + "/api/action", data=json.dumps(body).encode(),
        method="POST", headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(r, timeout=35) as resp:
        return json.loads(resp.read())

ok = fail = 0
def chk(cond, name):
    global ok, fail
    ok += bool(cond); fail += (not cond)
    print(("  ✓ " if cond else "  ✗ ") + name, flush=True)

s, b = get("/fxq/")
chk(s == 200, f"静态页 200 ({s})")
s, b = get("/api/new-room")
code = json.loads(b)["code"]
chk(s == 200 and len(code) == 4, f"建房 {code}")

a = post({"room": code, "gid": "p1", "t": "join", "name": "jia"})
chk(a["ok"] and a["events"][0]["you"]["seat"] == 0, "甲入座 seat0")
b2 = post({"room": code, "gid": "p2", "t": "join", "name": "yi"})
chk(b2["ok"] and b2["events"][0]["you"]["seat"] == 1, "乙入座 seat1")
st = post({"room": code, "gid": "p1", "t": "start"})
chk(st["ok"] and st["events"][0]["t"] == "start", "开局")
game = st["events"][0]["game"]
chk(len(game["planePositionList"]) == 8, "引擎初始化 8 架飞机")

moves = 0
g = game
done = False
while moves < 600 and not done:
    if g["state"] < 4:
        gid = "p%d" % (g["state"] + 1)
        r = post({"room": code, "gid": gid, "t": "roll"})
    else:
        seat = g["state"] - 4
        gid = "p%d" % (seat + 1)
        mv = []
        for t in range(4):
            idx = 4 * seat + t
            pos = g["planePositionList"][idx]
            if (pos == 0 and g["lastDice"] % 2 == 0 and g["sixTimes"] < 3) or (0 < pos < 57):
                mv.append(idx)
        if mv:
            r = post({"room": code, "gid": gid, "t": "move", "plane": mv[0]})
        else:
            r = post({"room": code, "gid": gid, "t": "pass"})
    if not r["ok"]:
        chk(False, "动作被拒: %s @ step %d" % (r.get("error"), moves))
        break
    ge = [e for e in r["events"] if e["t"] == "game"]
    if ge:
        g = ge[-1]["game"]
    if g.get("winners"):
        chk(True, "对局完成（%d 步），winners=%s" % (moves, g["winners"]))
        done = True
    moves += 1

s, b = get("/api/state?room=%s&v=0&wait=0" % code)
chk(s == 200 and b"ok" in b, "长轮询端点正常")
print("\n===== 线上冒烟: %d 通过 / %d 失败 =====" % (ok, fail))
