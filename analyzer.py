"""
analyzer.py
Pattern analysis, correlations, creative feature extraction, schedule planning
ทุกค่าที่ return คำนวณจาก data จริง — ถ้าไม่พอ sample จะ return None ไม่เดา
"""

import math
import re
from collections import defaultdict
from datetime import datetime, timedelta
from typing import Optional


MIN_SAMPLE = 5  # จำนวน posts ขั้นต่ำที่จะ compute


# ──────────────────────────────────────────────────────────────
# CORRELATION ANALYSIS
# ──────────────────────────────────────────────────────────────

def compute_correlations(posts: list[dict], baseline: dict) -> list[dict]:
    """
    คำนวณ Pearson correlation ของ features ต่างๆ กับ engagement rate
    return list ของ {feature, r, n, confidence}
    ถ้า n < MIN_SAMPLE ไม่ return feature นั้น
    """
    if len(posts) < MIN_SAMPLE:
        return []

    # Extract (feature_value, ER) pairs
    feature_fns = {
        "ตัวเลขใน caption": lambda p: 1 if bool(re.search(r'\d', p.get("message", ""))) else 0,
        "วิดีโอ < 30 วินาที": lambda p: 1 if (p.get("format") in ("Reel", "Video") and
                                               p.get("video_length_s", 999) < 30) else 0,
        "มี CTA ในประโยคแรก": lambda p: _has_cta_first_line(p.get("message", "")),
        "โพสต์ช่วงเย็น (17–21)": lambda p: 1 if _hour_of(p.get("created_time", "")) in range(17, 22) else 0,
        "ความยาว caption (คำ)": lambda p: len(p.get("message", "").split()),
        "จำนวน hashtag": lambda p: len(re.findall(r'#\w+', p.get("message", ""))),
        "มีการ tag แบรนด์/คนอื่น": lambda p: 1 if "@" in p.get("message", "") else 0,
        "โพสต์ช่วงเช้า (7–10)": lambda p: 1 if _hour_of(p.get("created_time", "")) in range(7, 11) else 0,
    }

    results = []
    for feature_name, fn in feature_fns.items():
        pairs = []
        for p in posts:
            reach = p.get("reach") or 0
            if reach < 100:
                continue
            eng = p.get("engaged_users")
            if eng is None:
                continue
            er = eng / reach * 100
            try:
                fval = fn(p)
                pairs.append((fval, er))
            except Exception:
                continue

        if len(pairs) < MIN_SAMPLE:
            continue

        r, n = _pearson(pairs)
        if r is None:
            continue

        results.append({
            "feature": feature_name,
            "r": round(r, 2),
            "n": n,
            "confidence": "high" if n >= 15 else "medium" if n >= 8 else "low",
        })

    return sorted(results, key=lambda x: abs(x["r"]), reverse=True)


# ──────────────────────────────────────────────────────────────
# CREATIVE PATTERN EXTRACTION
# ──────────────────────────────────────────────────────────────

def extract_creative_patterns(posts: list[dict], scores: dict) -> list[dict]:
    """
    ดู top 10% posts → หา patterns ที่ซ้ำกัน
    return list ของ {label, value, detail, type}
    """
    if not scores or len(posts) < MIN_SAMPLE:
        return []

    scored = [(p, scores.get(p["post_id"])) for p in posts if scores.get(p["post_id"])]
    scored = [(p, s) for p, s in scored if s.total is not None]
    if not scored:
        return []

    scored.sort(key=lambda x: x[1].total, reverse=True)
    top_n = max(2, len(scored) // 10)
    top_posts = [p for p, s in scored[:top_n]]
    all_posts = [p for p, s in scored]

    patterns = []

    # Format in top vs all
    fmt_top = defaultdict(int)
    fmt_all = defaultdict(int)
    for p in top_posts: fmt_top[p.get("format", "?")] += 1
    for p in all_posts: fmt_all[p.get("format", "?")] += 1

    if top_posts:
        dominant_fmt = max(fmt_top, key=fmt_top.get)
        top_rate = fmt_top[dominant_fmt] / len(top_posts)
        all_rate = fmt_all[dominant_fmt] / max(len(all_posts), 1)
        if top_rate > 0.4 and top_rate > all_rate * 1.5:
            patterns.append({
                "label": "Format", "type": "format",
                "value": dominant_fmt,
                "detail": f"พบใน {fmt_top[dominant_fmt]}/{len(top_posts)} top posts · {top_rate/all_rate:.1f}× overrepresented",
                "top_format": dominant_fmt,
                "lift": round(top_rate / max(all_rate, 0.01), 1),
            })

    # Number in first line
    top_num = sum(1 for p in top_posts if bool(re.search(r'^\d+', p.get("message", "").strip())))
    if len(top_posts) > 0 and top_num / len(top_posts) > 0.4:
        all_num = sum(1 for p in all_posts if bool(re.search(r'^\d+', p.get("message", "").strip())))
        patterns.append({
            "label": "Hook pattern", "type": "hook", "hook": "number",
            "value": "ขึ้นต้นด้วยตัวเลข",
            "detail": f"พบใน {top_num}/{len(top_posts)} top posts · {top_num/len(top_posts)*100:.0f}%",
        })

    # Short video
    short_top = sum(1 for p in top_posts if p.get("format") in ("Reel","Video") and p.get("video_length_s", 999) < 30)
    if short_top > 1:
        patterns.append({
            "label": "Duration", "type": "duration",
            "value": "วิดีโอ < 30 วินาที",
            "detail": f"พบใน {short_top}/{len(top_posts)} top posts",
        })

    return patterns[:6]


# ──────────────────────────────────────────────────────────────
# FORMAT PERFORMANCE
# ──────────────────────────────────────────────────────────────

def compute_format_performance(posts: list[dict], baseline: dict) -> list[dict]:
    """
    คำนวณ avg ER ต่อ format
    return list ของ {format, ER, count}
    """
    fmt_ers = defaultdict(list)
    for p in posts:
        reach = p.get("reach") or 0
        eng = p.get("engaged_users")
        if reach < 100 or eng is None:
            continue
        fmt_ers[p.get("format", "Unknown")].append(eng / reach * 100)

    result = []
    for fmt, ers in fmt_ers.items():
        if len(ers) < 1:
            continue
        result.append({
            "format": fmt,
            "ER": round(sum(ers) / len(ers), 2),
            "count": len(ers),
        })
    return sorted(result, key=lambda x: x["ER"], reverse=True)


# ──────────────────────────────────────────────────────────────
# TIME HEATMAP
# ──────────────────────────────────────────────────────────────

DAYS_TH = ["จ", "อ", "พ", "พฤ", "ศ", "ส", "อา"]
TIME_SLOTS = [(6, 10), (10, 14), (14, 17), (17, 20), (20, 23), (23, 27)]
SLOT_LABELS = ["6–10", "10–14", "14–17", "17–20", "20–23", "23+"]


def compute_time_heatmap(posts: list[dict]) -> list[dict]:
    """
    คำนวณ avg ER ต่อ day × time slot
    return format สำหรับ plotly imshow
    """
    grid = defaultdict(list)  # (day_idx, slot_idx) -> list of ER

    for p in posts:
        ct = p.get("created_time", "")
        if not ct: continue
        try:
            dt = datetime.fromisoformat(ct.replace("Z", "+00:00"))
        except Exception:
            continue
        reach = p.get("reach") or 0
        eng = p.get("engaged_users")
        if reach < 100 or eng is None: continue

        er = eng / reach * 100
        day_idx = dt.weekday()  # 0=Mon..6=Sun
        hour = dt.hour
        slot_idx = next((i for i, (s, e) in enumerate(TIME_SLOTS) if s <= hour < e), None)
        if slot_idx is not None:
            grid[(day_idx, slot_idx)].append(er)

    if not grid:
        return []

    # Build matrix [day][slot] = avg ER
    result = []
    for day_i, day_label in enumerate(DAYS_TH):
        row = {"day": day_label}
        for slot_i, slot_label in enumerate(SLOT_LABELS):
            vals = grid.get((day_i, slot_i), [])
            row[slot_label] = round(sum(vals) / len(vals), 2) if vals else None
        result.append(row)

    return result


# ──────────────────────────────────────────────────────────────
# SCHEDULE PLANNER
# ──────────────────────────────────────────────────────────────

def build_schedule_plan(
    posts: list[dict],
    scores: dict,
    weeks_ahead: int = 4
) -> list[dict]:
    """
    สร้างแผน posting สำหรับ N สัปดาห์ถัดไป
    ทุก slot แสดง:
      - predicted_score_range (CI 80%)
      - confidence ("high" / "medium" / "low" / None)
      - sample_size (n posts ที่ใช้ estimate)
      - reasoning
    slot ที่มี sample < 3 → confidence = None (ไม่แสดง prediction)
    """
    # Build slot history: (day_idx, slot_idx) -> list of scores
    slot_scores = defaultdict(list)
    for p in posts:
        ct = p.get("created_time", "")
        if not ct: continue
        try:
            dt = datetime.fromisoformat(ct.replace("Z", "+00:00"))
        except Exception:
            continue
        ps = scores.get(p["post_id"])
        if not ps or ps.total is None: continue

        day_idx = dt.weekday()
        hour = dt.hour
        slot_idx = next((i for i, (s, e) in enumerate(TIME_SLOTS) if s <= hour < e), None)
        if slot_idx is not None:
            slot_scores[(day_idx, slot_idx)].append(ps.total)

    # Generate slots for upcoming weeks
    today = datetime.today()
    plan = []
    for week in range(weeks_ahead):
        for day in range(7):
            dt = today + timedelta(days=week * 7 + day - today.weekday())
            if dt.date() < today.date():
                continue
            for slot_i, slot_label in enumerate(SLOT_LABELS):
                day_i = dt.weekday()
                historical = slot_scores.get((day_i, slot_i), [])
                n = len(historical)

                if n < 3:
                    confidence = None
                    low, mid, high = None, None, None
                    reasoning = f"sample น้อยเกินไป (n={n}) — ไม่ predict"
                elif n < 5:
                    confidence = "low"
                    low, mid, high = _ci(historical, 0.5)
                    reasoning = f"n={n} · CI กว้าง · ใช้ความระมัดระวัง"
                elif n < 10:
                    confidence = "medium"
                    low, mid, high = _ci(historical, 0.7)
                    reasoning = f"n={n} · based on {n} historical posts ใน slot นี้"
                else:
                    confidence = "high"
                    low, mid, high = _ci(historical, 0.8)
                    reasoning = f"n={n} posts · p80 CI"

                plan.append({
                    "date": dt.strftime("%Y-%m-%d"),
                    "date_display": dt.strftime("%-d %b %Y"),
                    "day_label": DAYS_TH[day_i],
                    "time_slot": slot_label,
                    "score_low": low,
                    "score_mid": mid,
                    "score_high": high,
                    "confidence": confidence,
                    "n": n,
                    "reasoning": reasoning,
                })

    return plan


# ──────────────────────────────────────────────────────────────
# HELPERS
# ──────────────────────────────────────────────────────────────

def _pearson(pairs: list[tuple]) -> tuple[Optional[float], int]:
    """Pearson r สำหรับ list ของ (x, y)"""
    n = len(pairs)
    if n < MIN_SAMPLE:
        return None, n
    xs = [p[0] for p in pairs]
    ys = [p[1] for p in pairs]
    xbar, ybar = sum(xs) / n, sum(ys) / n
    num = sum((x - xbar) * (y - ybar) for x, y in zip(xs, ys))
    den_x = math.sqrt(sum((x - xbar) ** 2 for x in xs))
    den_y = math.sqrt(sum((y - ybar) ** 2 for y in ys))
    denom = den_x * den_y
    if denom == 0:
        return None, n
    return num / denom, n


def _ci(values: list[float], coverage: float = 0.8) -> tuple:
    """Return (low, mid, high) confidence interval"""
    s = sorted(values)
    n = len(s)
    mid = s[n // 2]
    tail = (1 - coverage) / 2
    low_i = max(0, int(tail * n))
    high_i = min(n - 1, int((1 - tail) * n))
    return round(s[low_i], 1), round(mid, 1), round(s[high_i], 1)


def _hour_of(created_time: str) -> int:
    try:
        dt = datetime.fromisoformat(created_time.replace("Z", "+00:00"))
        return dt.hour
    except Exception:
        return -1


def _has_cta_first_line(text: str) -> int:
    if not text:
        return 0
    first_line = text.split("\n")[0].lower()
    ctas = ["คลิก", "กด", "ดู", "ลอง", "เช็ค", "สมัคร", "จอง", "ลิงก์", "link", "comment", "แชร์", "บอกต่อ", "แท็ก", "tag"]
    return 1 if any(cta in first_line for cta in ctas) else 0
