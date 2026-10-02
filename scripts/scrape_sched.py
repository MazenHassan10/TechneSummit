"""Pull Great Hall sessions + speakers (photo, title/company, role, profile URL) from the official sched.
Usage: python3 scrape_sched.py > /tmp/sched/greathall.json"""
import html, json, re, sys, urllib.request

BASE = "https://technesummit2026.sched.com/"
def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    return urllib.request.urlopen(req, timeout=60).read().decode("utf-8", "replace")

def text(s):
    return html.unescape(re.sub(r"<[^>]+>", "", s or "")).strip()

out = []
for day in ("2026-10-03", "2026-10-04"):
    page = get(f"{BASE}{day}/list/descriptions/")
    for block in re.split(r'<span class="event ev_', page)[1:]:
        loc = re.search(r'list-single__location">\s*<a[^>]*>\s*(.*?)\s*</a>', block, re.S)
        if not loc or "Great Hall" not in loc.group(1):
            continue
        ev = re.search(r'href="(event/[^"]+)"', block)
        title = text(re.search(r'session-title">(.*?)</span>', block, re.S).group(1))
        when = text(re.search(r'list-single__date">(.*?)<span', block, re.S).group(1))
        people = []
        for rm in re.finditer(r"<strong>(Moderators?|Speakers?|Artists?|Sponsors?)</strong>(.*?)(?=<strong>|</div>\s*</div>\s*</div>\s*</div>|$)", block, re.S):
            role = "Moderator" if rm.group(1).startswith("Moderator") else "Speaker"
            for pm in re.finditer(r"<a class='sched-avatar' href='([^']+)'.*?<img src=\"([^\"]+)\".*?<h2><a [^>]*title=\"([^\"]+)\".*?(?:sched-event-details-role-company\">(.*?)</div>)?", rm.group(2), re.S):
                href, img, name, comp = pm.groups()
                people.append({"name": html.unescape(name), "role": role, "profile": BASE + href,
                               "photo": ("https:" + img) if img.startswith("//") else img, "headline": text(comp)})
        out.append({"day": day, "when": when, "title": title, "event": BASE + ev.group(1) if ev else "", "people": people})
json.dump(out, sys.stdout, ensure_ascii=False, indent=1)
