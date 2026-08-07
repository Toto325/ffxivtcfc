#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
fetch_fashion.py
抓取巴哈姆特「時尚品鑑」討論串，解析出符合關鍵字的樓層貼文，
輸出成 data/fashion.json，供前端 app.js 直接讀取（同源，無 CORS 問題）。

解析規則與原本 app.js 的 app._parseFashionClean / fetchFashion 完全對應。
"""
import json
import os
import re
import sys
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup

BASE_URL = "https://forum.gamer.com.tw/C.php?bsn=17608&snA=20177"
KEYWORDS = ["時尚品鑑簡單80分攻略", "金蝶時尚主題"]
PRIO = ["chcooboo", "rhythm"]
OUTPUT_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data", "fashion.json")

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept-Language": "zh-TW,zh;q=0.9",
}
COOKIES = {"over18": "1"}
TIMEOUT = 20


def fetch(url):
    r = requests.get(url, headers=HEADERS, cookies=COOKIES, timeout=TIMEOUT)
    r.raise_for_status()
    r.encoding = r.apparent_encoding or "utf-8"
    return r.text


def get_last_page(html):
    soup = BeautifulSoup(html, "html.parser")
    nums = []
    for a in soup.select('a[href*="page="]'):
        m = re.search(r"[?&]page=(\d+)", a.get("href", ""))
        if m:
            nums.append(int(m.group(1)))
    return max(nums) if nums else 1


def parse_fashion_clean(html):
    soup = BeautifulSoup(html, "html.parser")
    posts = []

    for user_link in soup.select("a.username"):
        author = user_link.get_text(strip=True)
        href = user_link.get("href", "")
        uid_m = re.search(r"home\.gamer\.com\.tw/([^/?#\"']+)", href)
        uid = uid_m.group(1) if uid_m else ""

        container = user_link.find_parent("section")
        if not container:
            continue

        floor_el = container.select_one("a[data-floor]")
        try:
            floor = int(floor_el.get("data-floor", 0)) if floor_el else 0
        except (TypeError, ValueError):
            floor = 0

        content_el = container.select_one(".c-article__content")
        if not content_el:
            continue

        raw_text = content_el.get_text() or ""
        if not raw_text.strip() or len(raw_text) < 20:
            continue
        if not any(kw in raw_text for kw in KEYWORDS):
            continue

        # 走訪子節點，交錯收集文字 / 圖片，規則與 app.js walk() 對應
        segments = []
        text_buf = []
        BLOCK_TAGS = {"div", "p", "h1", "h2", "h3", "h4", "h5", "h6",
                      "section", "article", "header", "footer", "li", "tr", "td", "th"}

        def flush_text():
            t = "".join(text_buf)
            t = re.sub(r"\n{3,}", "\n\n", t).strip()
            if t:
                segments.append({"type": "text", "value": t})
            text_buf.clear()

        def walk(node):
            if isinstance(node, str):
                text_buf.append(node)
                return
            tag = getattr(node, "name", None)
            if tag is None:
                return
            tag = tag.lower()
            if tag == "br":
                text_buf.append("\n")
                return
            if tag in ("script", "style", "iframe"):
                return
            if tag == "img":
                flush_text()
                src = node.get("data-src") or node.get("src") or ""
                if src and "/editor/emotion/" not in src and "bahamut.com.tw/forum/icons" not in src:
                    src = urljoin(BASE_URL, src)
                    segments.append({"type": "img", "src": src})
                return
            is_block = tag in BLOCK_TAGS
            if is_block:
                text_buf.append("\n")
            for child in getattr(node, "contents", []):
                walk(child)
            if is_block:
                text_buf.append("\n")

        for child in list(content_el.contents):
            walk(child)
        flush_text()

        posts.append({
            "author": author or "玩家分享",
            "uid": uid,
            "floor": floor,
            "segments": segments,
        })

    return posts


def main():
    print(f"[fetch_fashion] 抓取第 1 頁: {BASE_URL}", file=sys.stderr)
    html1 = fetch(BASE_URL)
    last_page = get_last_page(html1)
    print(f"[fetch_fashion] 最後頁碼: {last_page}", file=sys.stderr)

    pages = list(range(last_page, max(1, last_page - 1) - 1, -1))
    if not pages:
        pages = [1]

    all_posts = []
    for p in pages:
        url = BASE_URL if p == 1 and last_page == 1 else f"{BASE_URL}&page={p}"
        print(f"[fetch_fashion] 抓取第 {p} 頁", file=sys.stderr)
        html = fetch(url) if p != 1 or last_page != 1 else html1
        all_posts.extend(parse_fashion_clean(html))

    # 依樓層排序（新到舊）並去重
    all_posts.sort(key=lambda p: p["floor"], reverse=True)
    seen = set()
    dedup = []
    for p in all_posts:
        if p["floor"] in seen:
            continue
        seen.add(p["floor"])
        dedup.append(p)

    prio_posts = [p for p in dedup if any(n in p["author"].lower() for n in PRIO)]
    oth_posts = [p for p in dedup if not any(n in p["author"].lower() for n in PRIO)]
    final = (prio_posts if prio_posts else oth_posts)[:3]

    result = {
        "source": BASE_URL,
        "posts": final,
    }

    os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)
    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)

    print(f"[fetch_fashion] 完成，共 {len(final)} 篇貼文，已寫入 {OUTPUT_PATH}", file=sys.stderr)
    if not final:
        print("[fetch_fashion] 警告：本次未抓到任何符合關鍵字的貼文", file=sys.stderr)


if __name__ == "__main__":
    main()
