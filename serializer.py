"""
serializer.py
แปลง object จาก backend (api_client / scoring / analyzer) → JSON shape
ที่ React frontend (frontend/src/Dashboard.jsx) ใช้โดยตรง

หลักการเดียวกับทั้งโปรเจกต์: ค่าที่ดึงไม่ได้ = None (null) ไม่เดาเป็น 0
"""

from datetime import datetime
from itertools import groupby
from typing import Optional

from analyzer import (
    compute_correlations,
    extract_creative_patterns,
    compute_format_performance,
    compute_time_heatmap,
)

DAYS_TH_FULL = ["จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์", "อาทิตย์"]
MONTHS_TH = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
             "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."]

FORMAT_COLOR = {
    "Reel": "#C2410C", "Carousel": "#7C3AED", "Video": "#0F766E",
    "Photo": "#525252", "Link": "#737373",
}

# ชื่อ component ใน scoring.py → key ที่ frontend ใช้
COMPONENT_KEY = {
    "Engagement quality": "engagement",
    "Reach efficiency": "reach",
    "Save + share": "save_share",
    "Comment quality": "comment",
}


def _parse_dt(created_time: str) -> Optional[datetime]:
    if not created_time:
        return None
    try:
        return datetime.fromisoformat(created_time.replace("Z", "+00:00"))
    except Exception:
        return None


def _type_label(post_class: str) -> str:
    return {"organic": "organic", "boosted": "boosted", "ad_only": "ad"}.get(post_class, "organic")


def serialize_post(post: dict, score) -> dict:
    """แปลง 1 โพสต์ (backend dict + PostScore) → frontend post object"""
    dt = _parse_dt(post.get("created_time"))
    reach = post.get("reach")
    eng = post.get("engaged_users")
    spend = post.get("ad_spend")

    out = {
        "id": post.get("post_id"),
        "title": (post.get("message") or "")[:90] or "(ไม่มีข้อความ)",
        "format": post.get("format", "Photo"),
        "length": post.get("video_length_s"),
        "type": _type_label(post.get("post_class", "organic")),
        "objective": (post.get("objective") or post.get("post_class") or "organic"),
        "date": f"{dt.day} {MONTHS_TH[dt.month - 1]} {dt.year}" if dt else None,
        "time": dt.strftime("%H:%M") if dt else None,
        "day": DAYS_TH_FULL[dt.weekday()] if dt else None,

        "impressions": post.get("impressions"),
        "reach": reach,
        "frequency": post.get("frequency") or post.get("ad_frequency"),
        "reach_organic": post.get("reach_organic"),
        "reach_paid": post.get("reach_paid"),
        "reach_viral": post.get("reach_viral"),

        "views_3s": post.get("views_3s"),
        "views_15s": post.get("views_10s"),
        "views_completion": post.get("views_complete"),
        "avg_watch": round(post["avg_watch_time_ms"] / 1000, 1) if post.get("avg_watch_time_ms") else None,
        "unique_viewers": post.get("views_3s_unique"),
        "sound_on": None,  # Graph API ไม่เปิด field นี้

        "engagement": eng,
        "shares": post.get("shares"),
        "saves": post.get("saves"),
        "reactions": {
            "like": post.get("reactions_like", 0),
            "love": post.get("reactions_love", 0),
            "wow": post.get("reactions_wow", 0),
            "haha": post.get("reactions_haha", 0),
            "sad": post.get("reactions_sad", 0),
            "angry": post.get("reactions_angry", 0),
        },
        "comments": post.get("comment_count_api"),
        "comment_avg_words": post.get("comment_avg_words"),
        "sentiment": post.get("comment_sentiment"),
        "question_rate": None,  # ต้องใช้ NLP แยก ยังไม่ดึง

        "spend": spend,
        "cpm": post.get("ad_cpm"),
        "cpe": round(spend / eng, 2) if (spend and eng) else None,
        "roas": post.get("ad_roas"),
        "purchases": post.get("ad_purchases"),
        "revenue": post.get("ad_revenue"),

        "hide_post": post.get("hide_post"),
        "report_spam": post.get("report_spam"),
        "hide_all": post.get("hide_all"),

        "score": score.total if score else None,
        "grade": score.grade if score else None,
    }

    # score_components — เฉพาะ component ที่มีข้อมูล
    if score:
        comps = {}
        for c in score.components:
            key = COMPONENT_KEY.get(c.name)
            if not key:
                continue
            comps[key] = {
                "value": round(c.weighted_score, 1) if c.weighted_score is not None else None,
                "max": c.max_pts,
                "reason": c.reasoning,
                "confidence": c.confidence,
            }
        # frontend แสดง detailed view เฉพาะเมื่อมี score_components ครบ 4 และมีคะแนน
        has_all = all(comps.get(k, {}).get("value") is not None for k in COMPONENT_KEY.values())
        if has_all:
            out["score_components"] = comps
        out["summary"] = score.grade_reasoning

    return out


def _baseline(baseline: dict, paid_posts: list) -> dict:
    """frontend PAGE_BASELINE shape"""
    spend = sum((p.get("ad_spend") or 0) for p in paid_posts)
    eng = sum((p.get("engaged_users") or 0) for p in paid_posts)
    reach = sum((p.get("reach") or 0) for p in paid_posts)
    sentiments = [p.get("comment_sentiment") for p in paid_posts if p.get("comment_sentiment") is not None]
    return {
        "ER": baseline.get("ER"),
        "save": baseline.get("save_rate"),
        "share": baseline.get("share_rate"),
        "comment_sentiment": round(sum(sentiments) / len(sentiments), 2) if sentiments else None,
        "CPE": round(spend / eng, 2) if eng else None,
        "CPM": round(spend / reach * 1000) if reach else None,
        "hide_rate": baseline.get("hide_rate"),
        "follower": baseline.get("follower_count"),
        "posts_90d": baseline.get("sample_size"),
    }


def _format_perf(posts: list, baseline: dict) -> list:
    rows = compute_format_performance(posts, baseline)
    for r in rows:
        r["color"] = FORMAT_COLOR.get(r["format"], "#525252")
    return rows


def _correlations(posts: list, baseline: dict) -> list:
    return [
        {"name": c["feature"], "value": c["r"], "positive": c["r"] >= 0, "n": c["n"], "confidence": c["confidence"]}
        for c in compute_correlations(posts, baseline)
    ]


def _heatmap(posts: list) -> list:
    """แปลง avg ER ต่อ slot → bucket 1–4 (quartile) ตามที่ frontend ต้องการ"""
    rows = compute_time_heatmap(posts)
    if not rows:
        return []
    slot_keys = ["6–10", "10–14", "14–17", "17–20", "20–23", "23+"]
    vals = [row[k] for row in rows for k in slot_keys if row.get(k) is not None]
    if not vals:
        return [{"day": row["day"], "slots": [1] * 6} for row in rows]

    s = sorted(vals)
    q1, q2, q3 = s[len(s) // 4], s[len(s) // 2], s[(len(s) * 3) // 4]

    def bucket(v):
        if v is None:
            return 1
        if v <= q1:
            return 1
        if v <= q2:
            return 2
        if v <= q3:
            return 3
        return 4

    return [{"day": row["day"], "slots": [bucket(row.get(k)) for k in slot_keys]} for row in rows]


def _cost_table(paid_posts: list) -> list:
    rows = []
    sorted_posts = sorted(paid_posts, key=lambda p: (p.get("format", ""), str(p.get("objective", ""))))
    for (fmt, obj), group in groupby(sorted_posts, key=lambda p: (p.get("format", ""), str(p.get("objective", "")))):
        grp = list(group)
        spend = sum((p.get("ad_spend") or 0) for p in grp)
        eng = sum((p.get("engaged_users") or 0) for p in grp)
        reach = sum((p.get("reach") or 0) for p in grp)
        roas_vals = [p.get("ad_roas") for p in grp if p.get("ad_roas") is not None]
        cpe = round(spend / eng, 2) if eng else None
        roas = round(sum(roas_vals) / len(roas_vals), 1) if roas_vals else None
        good = None
        if roas is not None:
            good = True if roas >= 4 else False if roas < 2.5 else None
        rows.append({
            "row": f"{fmt} · {obj}",
            "spend": round(spend),
            "cpm": round(spend / reach * 1000) if reach else None,
            "cpe": cpe,
            "roas": roas,
            "good": good,
        })
    return rows


def _overview(posts: list, baseline: dict) -> dict:
    impressions = sum((p.get("impressions") or 0) for p in posts)
    reach = sum((p.get("reach") or 0) for p in posts)
    org = sum((p.get("reach_organic") or 0) for p in posts)
    paid = sum((p.get("reach_paid") or 0) for p in posts)
    eng = sum((p.get("engaged_users") or 0) for p in posts)
    spend = sum((p.get("ad_spend") or 0) for p in posts)
    link_clicks = sum((p.get("link_clicks") or 0) for p in posts)
    purchase_values = [p.get("ad_purchases") for p in posts if p.get("ad_purchases") is not None]
    direct_revenue_values = [p.get("ad_revenue") for p in posts if p.get("ad_revenue") is not None]
    derived_revenue_values = [
        p["ad_spend"] * p["ad_roas"]
        for p in posts
        if p.get("ad_revenue") is None and p.get("ad_spend") is not None and p.get("ad_roas") is not None
    ]
    revenue_values = direct_revenue_values + derived_revenue_values
    revenue = sum(revenue_values) if revenue_values else None
    conversion_spend = sum(
        (p.get("ad_spend") or 0)
        for p in posts
        if p.get("ad_revenue") is not None or p.get("ad_roas") is not None
    )
    avg_er = round(eng / reach * 100, 1) if reach else None
    roas_vals = [p.get("ad_roas") for p in posts if p.get("ad_roas") is not None]
    roas = (revenue / conversion_spend) if (revenue is not None and conversion_spend) else None
    if roas is None and roas_vals:
        roas = sum(roas_vals) / len(roas_vals)
    return {
        "impressions_total": impressions,
        "reach_total": reach,
        "reach_organic": org,
        "reach_paid": paid,
        "avg_er": avg_er,
        "frequency": round(impressions / reach, 2) if reach else None,
        "engagement_total": eng,
        "link_clicks_total": link_clicks,
        "link_ctr": round(link_clicks / impressions * 100, 2) if impressions else None,
        "baseline_er": baseline.get("ER"),
        "spend_total": round(spend) if spend else None,
        "cpm": round(spend / reach * 1000) if (spend and reach) else None,
        "cpe": round(spend / eng, 2) if (spend and eng) else None,
        "purchases": round(sum(purchase_values)) if purchase_values else None,
        "revenue": round(revenue, 2) if revenue is not None else None,
        "conversion_spend": round(conversion_spend, 2) if conversion_spend else None,
        "revenue_source": (
            "mixed" if direct_revenue_values and derived_revenue_values
            else "meta_action_values" if direct_revenue_values
            else "calculated_from_roas" if derived_revenue_values
            else None
        ),
        "roas": round(roas, 2) if roas is not None else None,
        "roi": round((revenue - conversion_spend) / conversion_spend * 100, 1) if (revenue is not None and conversion_spend) else None,
    }


def build_payload(posts: list, scores: dict, baseline: dict, page_info: dict,
                  since: str, until: str) -> dict:
    """payload หลักที่ /api/analyze ส่งกลับให้ frontend"""
    paid_posts = [p for p in posts if p.get("post_class") in ("boosted", "ad_only")]
    organic_posts = [p for p in posts if p.get("post_class") == "organic"]

    serialized = [serialize_post(p, scores.get(p["post_id"])) for p in posts]
    serialized.sort(key=lambda x: (x["score"] is not None, x["score"] or 0), reverse=True)

    return {
        "page": {
            "name": page_info.get("name", "Page"),
            "followers": page_info.get("fan_count") or page_info.get("followers_count"),
        },
        "range": {"since": since, "until": until},
        "counts": {
            "total": len(posts),
            "organic": len(organic_posts),
            "boosted": len([p for p in paid_posts if p.get("post_class") == "boosted"]),
            "ads": len([p for p in paid_posts if p.get("post_class") == "ad_only"]),
        },
        "baseline": _baseline(baseline, paid_posts),
        "overview": _overview(posts, baseline),
        "posts": serialized,
        "format_perf": _format_perf(posts, baseline),
        "correlations": _correlations(posts, baseline),
        "time_heatmap": _heatmap(posts),
        "creative_patterns": [
            {"label": p.get("label"), "value": p.get("value"), "detail": p.get("detail")}
            for p in extract_creative_patterns(posts, scores)
        ],
        "cost_table": _cost_table(paid_posts),
    }
