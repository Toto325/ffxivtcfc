#!/usr/bin/env python3
"""
把 raphael-rs (KonaeAkira/raphael-rs, Apache-2.0) 的 Rust 靜態資料檔
轉換成本站可用的 JSON 資料。
來源: raphael-data/data/{recipes.rs, rlvls.rs, item_names_tw.rs}
"""
import re, json, os

SRC = "/home/claude/research/raphael-rs/raphael-data/data"
OUT = "/home/claude/site/data"
os.makedirs(OUT, exist_ok=True)

def parse_kv_block(text, key_pattern=r'(\w+)\s*:\s*([^,}\[]+|\[[^\]]*\])'):
    """解析 `Struct { a: 1, b: "x", c: [ ... ], }` 這種區塊成 dict"""
    d = {}
    for m in re.finditer(key_pattern, text):
        k, v = m.group(1), m.group(2).strip()
        d[k] = v
    return d

def parse_val(v):
    v = v.strip()
    if v == 'true': return True
    if v == 'false': return False
    if re.fullmatch(r'-?\d+', v): return int(v)
    if v.startswith('"') and v.endswith('"'): return v[1:-1]
    return v

# ---------- 1. recipes.rs ----------
def convert_recipes():
    text = open(f"{SRC}/recipes.rs", encoding="utf-8").read()
    recipes = {}
    # 逐筆抓 "id => Recipe { ... },"（用括號配對抓完整區塊，避免 ingredients 內的巢狀 { } 被截斷）
    pos = 0
    pattern = re.compile(r'(\d+)\s*=>\s*Recipe\s*\{')
    for m in pattern.finditer(text):
        rid = int(m.group(1))
        start = m.end()
        depth = 1
        i = start
        while depth > 0:
            if text[i] == '{': depth += 1
            elif text[i] == '}': depth -= 1
            i += 1
        body = text[start:i-1]
        # ingredients 是巢狀陣列，先抽出來單獨處理，再處理剩餘純量欄位
        ing_match = re.search(r'ingredients\s*:\s*\[(.*?)\]\s*,', body, re.S)
        ingredients = []
        if ing_match:
            for im in re.finditer(r'Ingredient\s*\{\s*item_id\s*:\s*(\d+)\s*,\s*amount\s*:\s*(\d+)\s*\}', ing_match.group(1)):
                iid, amt = int(im.group(1)), int(im.group(2))
                if iid != 0 and amt != 0:
                    ingredients.append({"itemId": iid, "amount": amt})
            body_wo_ing = body[:ing_match.start()] + body[ing_match.end():]
        else:
            body_wo_ing = body
        scalars = parse_kv_block(body_wo_ing)
        recipes[rid] = {
            "jobId": parse_val(scalars.get('job_id', '0')),
            "itemId": parse_val(scalars.get('item_id', '0')),
            "rlvl": parse_val(scalars.get('recipe_level', '0')),
            "progressFactor": parse_val(scalars.get('progress_factor', '100')),
            "qualityFactor": parse_val(scalars.get('quality_factor', '100')),
            "durabilityFactor": parse_val(scalars.get('durability_factor', '100')),
            "materialFactor": parse_val(scalars.get('material_factor', '0')),
            "isExpert": parse_val(scalars.get('is_expert', 'false')),
            "reqCraftsmanship": parse_val(scalars.get('req_craftsmanship', '0')),
            "reqControl": parse_val(scalars.get('req_control', '0')),
            "ingredients": ingredients,
        }
    with open(f"{OUT}/recipes.json", "w", encoding="utf-8") as f:
        json.dump(recipes, f, ensure_ascii=False, separators=(',', ':'))
    print(f"recipes.json: {len(recipes)} 筆")
    return recipes

# ---------- 2. rlvls.rs ----------
def convert_rlvls():
    text = open(f"{SRC}/rlvls.rs", encoding="utf-8").read()
    rlvls = []
    for m in re.finditer(r'RecipeLevel\s*\{([^}]*)\}', text):
        d = parse_kv_block(m.group(1))
        rlvls.append({
            "classJobLevel": parse_val(d.get('job_level', '0')),
            "maxProgress": parse_val(d.get('max_progress', '0')),
            "maxQuality": parse_val(d.get('max_quality', '0')),
            "maxDurability": parse_val(d.get('max_durability', '0')),
            "progressDiv": parse_val(d.get('progress_div', '0')),
            "qualityDiv": parse_val(d.get('quality_div', '0')),
            "progressMod": parse_val(d.get('progress_mod', '0')),
            "qualityMod": parse_val(d.get('quality_mod', '0')),
        })
    with open(f"{OUT}/rlvls.json", "w", encoding="utf-8") as f:
        json.dump(rlvls, f, ensure_ascii=False, separators=(',', ':'))
    print(f"rlvls.json: {len(rlvls)} 筆（陣列索引 = rlvl）")
    return rlvls

# ---------- 3. item_names_tw.rs ----------
def convert_item_names_tw():
    text = open(f"{SRC}/item_names_tw.rs", encoding="utf-8").read()
    names = {}
    for m in re.finditer(r'(\d+)\s*=>\s*"((?:[^"\\]|\\.)*)"', text):
        iid = int(m.group(1))
        raw = m.group(2)
        # .rs 原始檔內文字本身就是 UTF-8，只有 \" \\ 這種標準跳脫需要處理
        name = raw.replace('\\"', '"').replace('\\\\', '\\')
        names[iid] = name
    with open(f"{OUT}/item-names-tw.json", "w", encoding="utf-8") as f:
        json.dump(names, f, ensure_ascii=False, separators=(',', ':'))
    print(f"item-names-tw.json: {len(names)} 筆")
    return names

if __name__ == "__main__":
    convert_recipes()
    convert_rlvls()
    convert_item_names_tw()
