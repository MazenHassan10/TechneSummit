"""Fetch full sched profiles (photo, company, position, bio, personal links) for every Great Hall person.
Usage: python3 scrape_profiles.py /tmp/sched/greathall.json > /tmp/sched/profiles.json"""
import html, json, re, sys, urllib.request
from concurrent.futures import ThreadPoolExecutor

def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    return urllib.request.urlopen(req, timeout=60).read().decode("utf-8", "replace")

def text(s):
    s = re.sub(r"<br\s*/?>|</p>", "\n", s or "")
    return re.sub(r"[ \t]+", " ", html.unescape(re.sub(r"<[^>]+>", "", s))).strip()

SHARE = re.compile(r"shareArticle|intent/tweet|dialog/share|api\.whatsapp|t\.me/share|sched\.com|sched\.co")

def profile(p):
    s = get(p["profile"])
    g = lambda pat: (re.search(pat, s, re.S) or [None, ""])[1]
    social = g(r'id="user-profile__social"(.*?)<hr>')
    links = sorted({h for h in re.findall(r'href="(https?://[^"]+)"', social) if not SHARE.search(h)})
    img = g(r'id="myavatar"[^>]*?src="([^"]+)"') or g(r'<img src="([^"]+)"[^>]*id="myavatar"')
    return {**p,
            "photo": ("https:" + img) if img.startswith("//") else (img or p["photo"]),
            "company": text(g(r'user-profile__company">(.*?)</div>')),
            "position": text(g(r'user-profile__position">(.*?)</div>')),
            "bio": text(g(r'user-profile__about-content">(.*?)</div>\s*</div>')),
            "links": links}

sessions = json.load(open(sys.argv[1]))
uniq = {}
for s in sessions:
    for p in s["people"]:
        uniq.setdefault(p["profile"], {**p, "sessions": []})["sessions"].append(s["title"])
with ThreadPoolExecutor(8) as ex:
    out = list(ex.map(profile, uniq.values()))
json.dump(out, sys.stdout, ensure_ascii=False, indent=1)
