"""
sample_data.py
ข้อมูลตัวอย่าง (shape เดียวกับที่ api_client.get_full_post_data คืน)
ใช้เมื่อยังไม่มี FB credential — server จะรัน scoring/analyzer/serializer จริงบนข้อมูลนี้
เพื่อให้ frontend ทำงานได้ครบ pipeline โดยไม่ต้องต่อ Graph API
"""

import random
from datetime import datetime, timedelta

_FORMATS = ["Reel", "Carousel", "Photo", "Video", "Link"]
_TITLES = [
    "5 เมนูข้าวเช้าทำง่าย เสร็จใน 10 นาที คลิกดูเลย",
    "รีวิว 7 ร้านกาแฟย่านอารีย์ ที่ต้องไปก่อนตาย",
    "3 เคล็ดลับเก็บผักให้สดนาน 2 สัปดาห์",
    "โปรโมชั่นเปิดสาขาใหม่ ลด 30% สัปดาห์แรก จองคิวที่ลิงก์",
    "เมนูใหม่: ลาเต้กล้วยหอมหมักน้ำผึ้ง อร่อยจนต้องบอกต่อ",
    "แกะกล่อง! เครื่องครัว gadget ที่ต้องมีในปี 2026",
    "วันนี้ทำอะไรกินดี? 4 ไอเดียมื้อเย็นไว ๆ",
    "เบื้องหลังครัวร้านเรา ที่ลูกค้าไม่เคยเห็น @brand",
]


def sample_posts(n: int = 32, seed: int = 7) -> list[dict]:
    # Deterministic demo fixture; this generator never creates secrets.
    rng = random.Random(seed)  # nosec B311
    start = datetime(2026, 1, 1, tzinfo=None)
    posts = []
    for i in range(n):
        fmt = rng.choice(_FORMATS)
        is_video = fmt in ("Reel", "Video")
        post_class = rng.choices(["organic", "boosted", "ad_only"], weights=[6, 3, 1])[0]
        is_paid = post_class in ("boosted", "ad_only")

        reach = rng.randint(8000, 220000)
        quality = rng.uniform(0.4, 1.6)  # โพสต์บางอันดีกว่าค่าเฉลี่ย
        eng = int(reach * 0.06 * quality)
        organic = 0 if post_class == "ad_only" else int(reach * rng.uniform(0.4, 0.9))
        paid = reach - organic if is_paid else 0
        if not is_paid:
            organic = reach
        viral = int(reach * rng.uniform(0.02, 0.18))

        dt = start + timedelta(days=rng.randint(0, 89),
                               hours=rng.choice([8, 10, 12, 14, 17, 19, 20, 21]),
                               minutes=rng.choice([0, 30]))
        spend = round(rng.uniform(8000, 50000)) if is_paid else None
        objective = rng.choice(["AWARENESS", "ENGAGEMENT", "TRAFFIC", "CONVERSIONS"]) if is_paid else None

        like = int(eng * rng.uniform(0.3, 0.5))
        post = {
            "post_id": f"102_{100 + i}",
            "ad_ids": [],
            "objective": objective,
            "post_class": post_class,
            "format": fmt,
            "video_length_s": rng.choice([12, 18, 22, 35, 48]) if is_video else None,
            "created_time": dt.strftime("%Y-%m-%dT%H:%M:%S+0000"),
            "permalink_url": f"https://facebook.com/102_{100 + i}",
            "message": rng.choice(_TITLES),
            "thumbnail_url": None,

            "impressions": int(reach * rng.uniform(1.1, 1.9)),
            "reach": reach,
            "frequency": round(rng.uniform(1.1, 2.8), 2),
            "reach_organic": organic,
            "reach_paid": paid,
            "reach_viral": viral,

            "views_3s": int(reach * rng.uniform(0.7, 0.95)) if is_video else None,
            "views_3s_unique": int(reach * rng.uniform(0.6, 0.85)) if is_video else None,
            "views_10s": int(reach * rng.uniform(0.4, 0.7)) if is_video else None,
            "views_30s": int(reach * rng.uniform(0.2, 0.5)) if is_video else None,
            "views_complete": int(reach * rng.uniform(0.2, 0.5)) if is_video else None,
            "avg_watch_time_ms": int(rng.uniform(6, 18) * 1000) if is_video else None,

            "engaged_users": eng,
            "post_clicks": int(eng * rng.uniform(0.5, 1.5)),
            "post_clicks_unique": int(eng * rng.uniform(0.4, 1.2)),
            "shares": int(eng * rng.uniform(0.05, 0.2)),
            "saves": int(eng * rng.uniform(0.05, 0.35)),
            "link_clicks": int(eng * rng.uniform(0, 0.3)) if fmt == "Link" else None,
            "comment_count_api": int(eng * rng.uniform(0.02, 0.12)),
            "comment_avg_words": rng.choice([6, 9, 12, 18]),
            "comment_sentiment": round(rng.uniform(-0.3, 0.8), 2),

            "reactions_like": like,
            "reactions_love": int(like * rng.uniform(0.1, 0.4)),
            "reactions_wow": int(like * rng.uniform(0.02, 0.15)),
            "reactions_haha": int(like * rng.uniform(0.02, 0.1)),
            "reactions_sad": int(like * rng.uniform(0, 0.05)),
            "reactions_angry": int(like * rng.uniform(0, 0.05)),

            "hide_post": rng.randint(0, 160),
            "hide_all": rng.randint(0, 50),
            "report_spam": rng.randint(0, 15),
            "unlike_page": None,

            "ad_spend": float(spend) if spend else None,
            "ad_impressions": int(reach * rng.uniform(1.1, 1.9)) if is_paid else None,
            "ad_reach": paid if is_paid else None,
            "ad_frequency": round(rng.uniform(1.2, 3.0), 2) if is_paid else None,
            "ad_cpm": round(rng.uniform(90, 260)) if is_paid else None,
            "ad_cpc": round(rng.uniform(2, 9), 2) if is_paid else None,
            "ad_roas": round(rng.uniform(2.0, 6.5), 1) if (is_paid and objective == "CONVERSIONS") else None,

            "data_pulled_at": datetime.utcnow().isoformat(),
            "missing_fields": [],
        }
        posts.append(post)
    return posts


def sample_page_info() -> dict:
    return {"name": "Bangkok Bites (demo)", "fan_count": 312000, "followers_count": 312000}
