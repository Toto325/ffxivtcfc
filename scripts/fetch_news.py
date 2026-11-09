#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
fetch_news.py
抓取 FFXIV 繁中官網「消息列表」，解析成公告清單，
輸出成 data/news.json，供前端 app.js 直接讀取（同源，無 CORS 問題）。

解析規則與原本 app.js 的 app._renderNews 完全對應：
- 容器：.list.news_list
- 每篇公告：a[href*="news_content"]（標題 + 連結）
- 日期：.publish_date（與連結用 index+1 對應，因為列表第一個
        .publish_date 是表頭「日期」欄位標籤，不是實際日期）
- 置頂：該筆所在列（li/tr/div）內若有 .badge.top 或 span.top
"""
import json
import os
import re
import sys

import requests
from bs4 import BeautifulSoup

NEWS_URL = "https://www.ffxiv.com.tw/web/news/news_list.aspx"
OUTPUT_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data", "news.json")

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept-Language": "zh-TW,zh;q=0.9",
}
TIMEOUT = 20


def fetch(url):
    r = requests.get(url, headers=HEADERS, timeout=TIMEOUT)
    r.raise_for_status()
    r.encoding = r.apparent_encoding or "utf-8"
    return r.text


def parse_news(html):
    soup = BeautifulSoup(html, "html.parser")
    container = soup.select_one(".list.news_list")
    if not container:
        print("[fetch_news] 找不到 .list.news_list 容器，網站結構可能已變動", file=sys.stderr)
        return []

    links = container.select('a[href*="news_content"]')
    dates = container.select(".publish_date")
    if not links:
        print("[fetch_news] 找不到任何公告連結", file=sys.stderr)
        return []

    items = []
    for i, link in enumerate(links):
        title = link.get_text(strip=True)
        if not title or len(title) < 2:
            continue

        raw_date = dates[i + 1].get_text(strip=True) if i + 1 < len(dates) else ""
        m = re.match(r"^(\d{4})(\d{2})(\d{2})$", raw_date)
        date = f"{m.group(1)}/{m.group(2)}/{m.group(3)}" if m else raw_date

        href = link.get("href", "")
        if not href.startswith("http"):
            href = "https://www.ffxiv.com.tw/" + href.lstrip("/")

        row = link.find_parent(["li", "tr", "div"])
        pinned = bool(row and (row.select_one(".badge.top") or row.select_one("span.top")))

        items.append({
            "title": title,
            "date": date,
            "href": href,
            "pinned": pinned,
        })

    return items


def main():
    print(f"[fetch_news] 抓取: {NEWS_URL}", file=sys.stderr)
    html = fetch(NEWS_URL)
    items = parse_news(html)

    result = {
        "source": NEWS_URL,
        "items": items,
    }

    os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)
    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)

    print(f"[fetch_news] 完成，共 {len(items)} 則公告，已寫入 {OUTPUT_PATH}", file=sys.stderr)
    if not items:
        print("[fetch_news] 警告：本次未抓到任何公告", file=sys.stderr)


if __name__ == "__main__":
    main()
