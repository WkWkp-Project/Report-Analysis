"""
topic_extractor.py
Claude API layer (กล่อง "Claude API" ใน flow diagram)
  - topic extraction: แยก topic / content_type / hook_style / tone ของแต่ละโพสต์
  - narrative reasoning: สรุป insight ภาพรวม + insight รายโพสต์เป็นภาษาคน

ทั้งหมดเป็น optional — ถ้าไม่มี ANTHROPIC_API_KEY หรือยังไม่ได้ติดตั้ง `anthropic`
ฟังก์ชัน is_available() จะคืน False และ pipeline จะข้ามชั้นนี้ไป (demo ยังทำงานได้)

ก่อนใช้:
  pip install anthropic
  ตั้ง ANTHROPIC_API_KEY ใน .env
"""

import os
import json
from typing import Optional

MODEL = os.getenv("ANTHROPIC_MODEL", "claude-sonnet-4-6")

_client = None


def is_available() -> bool:
    """มี API key + ติดตั้ง anthropic แล้วหรือยัง — ใช้ตัดสินใจว่าจะเรียก Claude ไหม"""
    if not os.getenv("ANTHROPIC_API_KEY"):
        return False
    try:
        import anthropic  # noqa: F401
    except ImportError:
        return False
    return True


def _get_client():
    """สร้าง client แบบ lazy — ไม่ instantiate ตอน import เพื่อไม่ให้ crash เมื่อไม่มี key"""
    global _client
    if _client is None:
        from anthropic import Anthropic
        _client = Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))
    return _client


SYSTEM_PROMPT = """คุณเป็นนักวิเคราะห์ content marketing
วิเคราะห์โพสต์ Facebook ของแบรนด์ และ tag ตามมิติต่อไปนี้:

1. topic — หัวข้อหลัก (1-3 คำ ภาษาไทย เช่น "เมนูอาหาร", "โปรโมชั่น", "tips ทำอาหาร")
2. content_type — ประเภท: "how-to" / "review" / "promotion" / "announcement" / "tips" / "behind-the-scenes" / "ugc" / "other"
3. hook_style — รูปแบบ hook: "number" / "question" / "statement" / "story" / "shock" / "none"
4. tone — น้ำเสียง: "informative" / "playful" / "urgent" / "emotional" / "professional"

ตอบเป็น JSON object เท่านั้น ไม่มี markdown ไม่มีข้อความอื่น
หาก caption สั้น/ไม่ชัด ให้ใช้ค่า "other" หรือ "unclear" — ห้ามเดา"""


def extract_topics(posts: list[dict], batch_size: int = 20) -> dict[str, dict]:
    """
    Tag posts ทั้ง batch
    return dict: post_id → {topic, content_type, hook_style, tone}

    ใช้ batch เพื่อประหยัด token (รวมหลายโพสต์ใน 1 call)
    """
    if not posts or not is_available():
        return {}

    results = {}
    batches = [posts[i:i+batch_size] for i in range(0, len(posts), batch_size)]

    for batch in batches:
        payload = [
            {"post_id": p["post_id"], "message": (p.get("message") or "")[:300]}
            for p in batch
        ]
        try:
            tags = _call_claude(payload)
            results.update(tags)
        except Exception as e:
            print(f"[WARN] topic extraction failed for batch: {e}")
            # ถ้า fail ให้ใส่ unclear แทน ไม่เดา
            for p in batch:
                results[p["post_id"]] = {
                    "topic": "unclear",
                    "content_type": "other",
                    "hook_style": "none",
                    "tone": "unclear",
                    "error": str(e)[:100],
                }

    return results


def _call_claude(payload: list[dict]) -> dict[str, dict]:
    """เรียก Claude API ส่งโพสต์ทั้ง batch กลับมาเป็น JSON"""
    user_msg = (
        f"วิเคราะห์โพสต์ {len(payload)} อันต่อไปนี้:\n\n"
        + json.dumps(payload, ensure_ascii=False, indent=2)
        + "\n\nตอบเป็น JSON เท่านั้น format:\n"
        + '{"<post_id>": {"topic": "...", "content_type": "...", "hook_style": "...", "tone": "..."}, ...}'
    )

    msg = _get_client().messages.create(
        model=MODEL,
        max_tokens=4000,
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": user_msg}],
    )

    return json.loads(_strip_fences(msg.content[0].text))


def generate_overview_insight(overview: dict, baseline: dict, format_perf: list,
                              correlations: list, patterns: list) -> Optional[str]:
    """
    narrative reasoning ระดับภาพรวม (กล่อง "narrative reasoning" ในไดอะแกรม)
    คืน string ภาษาคน 2-4 ประโยค หรือ None ถ้าเรียกไม่ได้
    """
    if not is_available():
        return None

    context = {
        "avg_er": overview.get("avg_er"),
        "baseline_er": baseline.get("ER"),
        "reach_total": overview.get("reach_total"),
        "spend_total": overview.get("spend_total"),
        "roas": overview.get("roas"),
        "format_perf": format_perf[:5],
        "top_correlations": [c for c in correlations if abs(c.get("value", 0)) >= 0.3][:3],
        "creative_patterns": patterns[:3],
    }
    prompt = (
        "นี่คือสรุปผล performance ของเพจ Facebook ในช่วงที่เลือก (ตัวเลขจริงจาก pipeline):\n\n"
        + json.dumps(context, ensure_ascii=False, indent=2)
        + "\n\nเขียน insight ภาพรวม 2-4 ประโยคเป็นภาษาไทย ใช้ภาษาคน "
        "ชี้จุดเด่น/จุดที่ควรปรับ และ action ที่ทำได้ทันที "
        "อ้างอิงเฉพาะตัวเลขที่ให้มา ห้ามเดาตัวเลขที่ไม่มี ไม่ต้องมี header/bullet"
    )
    try:
        msg = _get_client().messages.create(
            model=MODEL,
            max_tokens=400,
            messages=[{"role": "user", "content": prompt}],
        )
        return msg.content[0].text.strip()
    except Exception as e:
        print(f"[WARN] overview insight failed: {e}")
        return None


def generate_post_insight(post: dict, score_data: dict, baseline: dict) -> Optional[str]:
    """
    Generate narrative insight สำหรับโพสต์เดียว
    ใช้ใน tier 3 (deep-dive) เพื่อสร้าง summary ภาษาคน
    """
    if not is_available():
        return None

    reach = post.get("reach") or 1
    er = (post.get("engaged_users") or 0) / reach * 100
    prompt = f"""โพสต์: {(post.get('message') or '')[:200]}
Format: {post.get('format')}
Score: {score_data.get('total')} / 100 (Grade {score_data.get('grade')})
Reach: {post.get('reach', 'N/A')}
ER: {er:.1f}%
Baseline ER ของเพจ: {(baseline.get('ER') or 0):.1f}%

เขียน insight สั้นๆ 2-3 ประโยค อธิบายว่า:
1. โพสต์นี้ได้คะแนนนี้เพราะอะไร
2. จุดเด่นและจุดที่ต้องปรับ
ตอบเป็นภาษาไทย ใช้ภาษาคน ไม่ต้องมี header/bullet"""

    try:
        msg = _get_client().messages.create(
            model=MODEL,
            max_tokens=300,
            messages=[{"role": "user", "content": prompt}],
        )
        return msg.content[0].text.strip()
    except Exception as e:
        print(f"[WARN] post insight failed: {e}")
        return None


def _strip_fences(text: str) -> str:
    text = text.strip()
    if text.startswith("```"):
        text = text.split("```")[1]
        if text.startswith("json"):
            text = text[4:]
    return text.strip()
