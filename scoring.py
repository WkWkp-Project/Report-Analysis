"""
scoring.py
คำนวณคะแนนและ grade ของแต่ละโพสต์
หลักการ:
  - ทุก component มี reasoning text เป็นภาษาคนอ่าน
  - เทียบกับ baseline ของเพจตัวเอง (ไม่ใช่ industry)
  - ถ้าข้อมูลไม่พอ component นั้น = None ไม่เดา
  - score สุดท้ายปรับ weight ตามจำนวน component ที่มีข้อมูล
"""

from dataclasses import dataclass, field
from typing import Optional
import math


# ───────────────────────────────────────────────────────────────
# DATA CLASSES
# ───────────────────────────────────────────────────────────────

@dataclass
class ComponentScore:
    name: str
    weight: float
    raw_value: Optional[float]       # ค่าจริงที่วัดได้
    baseline: Optional[float]        # baseline ของเพจ
    multiplier: Optional[float]      # raw / baseline
    percentile: Optional[float]      # p0–p100 เทียบกับ historical posts
    weighted_score: Optional[float]  # คะแนนที่ contribute ใน 0–max_pts
    max_pts: float
    reasoning: str                   # อธิบายเป็นภาษาคน
    confidence: str                  # "high" | "medium" | "low" | "unavailable"


@dataclass
class PostScore:
    post_id: str
    components: list[ComponentScore]
    total: Optional[float]
    grade: Optional[str]
    grade_reasoning: str
    available_components: int
    missing_fields: list[str]


# ───────────────────────────────────────────────────────────────
# GRADE MAP
# ───────────────────────────────────────────────────────────────

GRADE_THRESHOLDS = [
    (90, "A"),
    (75, "B"),
    (60, "C"),
    (45, "D"),
    (0,  "F"),
]

GRADE_ADVICE = {
    "A": "top 10% ของเพจ — ทำซ้ำ format ทันที, ทุ่ม budget ต่อยอด",
    "B": "ดีกว่าค่าเฉลี่ย — ใช้เป็น template ได้, ปรับนิดหน่อยเพื่อ A",
    "C": "ค่ากลาง — ตรวจ objective, เวลา, hook ว่าตรงไหมก่อนทำซ้ำ",
    "D": "ต่ำกว่าค่าเฉลี่ย — วิเคราะห์ root cause, อย่าทำซ้ำ pattern นี้",
    "F": "เสียโอกาส — ถ้ายังรัน paid ให้หยุดก่อน, ตรวจ creative และ targeting",
}


# ───────────────────────────────────────────────────────────────
# SCORER
# ───────────────────────────────────────────────────────────────

class PostScorer:
    """
    รับ post_data (dict จาก api_client) + page_baseline (dict)
    คืน PostScore ที่มี reasoning ครบทุก component
    """

    def __init__(self, page_baseline: dict, historical_posts: Optional[list] = None):
        """
        page_baseline: {
            "ER": float,          # %  engagement rate เฉลี่ย
            "save_rate": float,   # %
            "share_rate": float,  # %
            "comment_count": float,
            "comment_avg_words": float,
            "comment_sentiment": float,
            "reach_rate": float,  # reach / follower %
            "hide_rate": float,   # %
            "follower_count": int,
        }
        historical_posts: list ของ post_data ที่ผ่านมา 90 วัน
                          ใช้คำนวณ percentile จริง (ถ้ามี)
        """
        self.b = page_baseline
        self.historical = historical_posts or []

    def score(self, post: dict) -> PostScore:
        missing = []
        components = []

        # ── Component 1: Engagement quality (40%) ──────────────
        c1 = self._score_engagement(post, missing)
        components.append(c1)

        # ── Component 2: Reach efficiency (25%) ────────────────
        c2 = self._score_reach(post, missing)
        components.append(c2)

        # ── Component 3: Save + share rate (20%) ───────────────
        c3 = self._score_save_share(post, missing)
        components.append(c3)

        # ── Component 4: Comment quality (15%) ─────────────────
        c4 = self._score_comments(post, missing)
        components.append(c4)

        # ── Aggregate ─────────────────────────────────────────
        available = [c for c in components if c.weighted_score is not None]
        if not available:
            return PostScore(
                post_id=post["post_id"],
                components=components,
                total=None, grade=None,
                grade_reasoning="ไม่มีข้อมูลเพียงพอในการให้คะแนน",
                available_components=0,
                missing_fields=missing
            )

        # ปรับ weight ตาม available components
        total_weight = sum(c.weight for c in available)
        scaled_score = sum(
            (c.weighted_score / c.max_pts) * (c.weight / total_weight) * 100
            for c in available
        )
        total = round(scaled_score, 1)
        grade = _to_grade(total)

        # Grade reasoning
        top = sorted(available, key=lambda c: (c.weighted_score or 0) / c.max_pts, reverse=True)
        best = top[0]
        worst = top[-1]
        lost = 100 - total

        best_pct = (best.weighted_score / best.max_pts) * 100
        reasoning = (
            f"โพสต์ได้ {total}/100 · Grade {grade} · "
            f"จุดเด่น: {best.name} ({best_pct:.0f}% ของ max)"
        )
        if lost > 5:
            reasoning += f" · เสียคะแนนหลักจาก: {worst.name}"

        return PostScore(
            post_id=post["post_id"],
            components=components,
            total=total,
            grade=grade,
            grade_reasoning=reasoning,
            available_components=len(available),
            missing_fields=list(set(missing))
        )

    # ── Component scoring methods ──────────────────────────────

    def _score_engagement(self, p: dict, missing: list) -> ComponentScore:
        reach = p.get("reach")
        engaged = p.get("engaged_users")
        baseline_er = self.b.get("ER")

        if not reach or not engaged or not baseline_er:
            if not reach:   missing.append("reach")
            if not engaged: missing.append("engaged_users")
            return ComponentScore(
                "Engagement quality", 40, None, baseline_er,
                None, None, None, 40,
                "ไม่มีข้อมูล reach หรือ engaged_users", "unavailable"
            )

        er = (engaged / reach) * 100
        multiplier = er / baseline_er
        percentile = self._percentile("er", er)

        # Score: 0–40 ตาม log scale เพื่อไม่ให้ outlier distort
        raw_pts = _log_scale(multiplier, min_m=0.1, max_m=5.0, max_pts=40)

        reasoning = (
            f"ER {er:.1f}% ÷ baseline {baseline_er:.1f}% = {multiplier:.2f}× "
            f"→ p{percentile:.0f} → {raw_pts:.1f}/40"
        )

        return ComponentScore(
            "Engagement quality", 40,
            raw_value=er, baseline=baseline_er,
            multiplier=multiplier, percentile=percentile,
            weighted_score=raw_pts, max_pts=40,
            reasoning=reasoning,
            confidence="high" if percentile is not None else "medium"
        )

    def _score_reach(self, p: dict, missing: list) -> ComponentScore:
        reach = p.get("reach")
        follower = self.b.get("follower_count")
        baseline_reach_rate = self.b.get("reach_rate")
        frequency = p.get("frequency") or p.get("ad_frequency")
        viral = p.get("reach_viral")

        if not reach or not follower:
            if not reach: missing.append("reach")
            return ComponentScore(
                "Reach efficiency", 25, None, baseline_reach_rate,
                None, None, None, 25,
                "ไม่มีข้อมูล reach หรือ follower_count", "unavailable"
            )

        reach_rate = (reach / follower) * 100
        baseline_r = baseline_reach_rate or 30  # fallback 30%
        multiplier = reach_rate / baseline_r
        percentile = self._percentile("reach_rate", reach_rate)

        viral_coef = (viral / reach) if viral and reach else 0

        raw_pts = _log_scale(multiplier, min_m=0.1, max_m=3.0, max_pts=22)

        # Penalty สำหรับ frequency สูง
        freq_penalty = 0
        freq_note = ""
        if frequency and frequency > 2.0:
            freq_penalty = min(5, (frequency - 2.0) * 2)
            freq_note = f" · เสีย {freq_penalty:.1f} จุดจาก frequency {frequency:.2f} เกิน 2.0"

        viral_bonus = min(3, viral_coef * 20)
        final_pts = round(max(0, raw_pts - freq_penalty + viral_bonus), 1)

        reasoning = (
            f"Reach {_fmt(reach)} ÷ follower {_fmt(follower)} = {reach_rate:.1f}% "
            f"(baseline {baseline_r:.0f}%) = {multiplier:.2f}× "
            f"· viral {viral_coef:.2f}"
            f"{freq_note}"
            f" → {final_pts:.1f}/25"
        )

        return ComponentScore(
            "Reach efficiency", 25,
            raw_value=reach_rate, baseline=baseline_r,
            multiplier=multiplier, percentile=percentile,
            weighted_score=final_pts, max_pts=25,
            reasoning=reasoning,
            confidence="high" if frequency is not None else "medium"
        )

    def _score_save_share(self, p: dict, missing: list) -> ComponentScore:
        reach = p.get("reach")
        saves = p.get("saves")
        shares = p.get("shares")
        baseline_save = self.b.get("save_rate", 0)
        baseline_share = self.b.get("share_rate", 0)

        if not reach:
            missing.append("reach")
            return ComponentScore(
                "Save + share", 20, None, None,
                None, None, None, 20,
                "ไม่มีข้อมูล reach", "unavailable"
            )

        save_rate = (saves / reach * 100) if saves is not None else None
        share_rate = (shares / reach * 100) if shares is not None else None

        if save_rate is None and share_rate is None:
            missing.extend(["saves", "shares"])
            return ComponentScore(
                "Save + share", 20, None, None,
                None, None, None, 20,
                "ดึง saves/shares ไม่ได้", "unavailable"
            )

        combined = (save_rate or 0) + (share_rate or 0)
        baseline_combined = (baseline_save or 0) + (baseline_share or 0)
        baseline_combined = max(baseline_combined, 0.5)  # floor
        multiplier = combined / baseline_combined
        percentile = self._percentile("save_share", combined)

        raw_pts = _log_scale(multiplier, min_m=0.1, max_m=8.0, max_pts=20)

        parts = []
        if save_rate is not None:
            parts.append(f"save {save_rate:.2f}% (baseline {baseline_save:.1f}%)")
        if share_rate is not None:
            parts.append(f"share {share_rate:.2f}% (baseline {baseline_share:.1f}%)")

        pct_str = f"p{percentile:.0f}" if percentile is not None else "p?"
        reasoning = (
            f"{' + '.join(parts)} = {combined:.2f}% · {multiplier:.1f}× baseline "
            f"→ {pct_str} → {raw_pts:.1f}/20"
        )

        return ComponentScore(
            "Save + share", 20,
            raw_value=combined, baseline=baseline_combined,
            multiplier=multiplier, percentile=percentile,
            weighted_score=raw_pts, max_pts=20,
            reasoning=reasoning,
            confidence="high" if (saves is not None and shares is not None) else "medium"
        )

    def _score_comments(self, p: dict, missing: list) -> ComponentScore:
        # comment quality based on count + avg length + sentiment (ถ้ามี)
        reach = p.get("reach")
        comment_count = p.get("comment_count_api")  # ถ้าดึงได้
        sentiment = p.get("comment_sentiment")       # optional NLP
        avg_words = p.get("comment_avg_words")       # optional
        baseline_comment_rate = self.b.get("comment_rate", 0)

        if not reach:
            missing.append("reach")
            return ComponentScore(
                "Comment quality", 15, None, None,
                None, None, None, 15,
                "ไม่มีข้อมูล reach", "unavailable"
            )

        if comment_count is None:
            missing.append("comment_count")
            return ComponentScore(
                "Comment quality", 15, None, None,
                None, None, None, 15,
                "ดึง comment count ไม่ได้", "unavailable"
            )

        comment_rate = (comment_count / reach) * 100
        multiplier = comment_rate / max(baseline_comment_rate, 0.1)
        percentile = self._percentile("comment_rate", comment_rate)

        raw_pts = _log_scale(multiplier, min_m=0.1, max_m=5.0, max_pts=12)

        # bonus: sentiment และ avg_words
        bonus = 0
        bonus_notes = []
        if sentiment and sentiment > 0.3:
            bonus += 2
            bonus_notes.append(f"sentiment +{sentiment:.2f}")
        if avg_words and avg_words > self.b.get("comment_avg_words", 5):
            bonus += 1
            bonus_notes.append(f"avg {avg_words:.0f} คำ")

        final_pts = min(15, raw_pts + bonus)

        reasoning = (
            f"{comment_count} comments · rate {comment_rate:.2f}% "
            f"· {multiplier:.1f}× baseline"
        )
        if bonus_notes:
            reasoning += f" · bonus: {', '.join(bonus_notes)}"
        reasoning += f" → {final_pts:.1f}/15"

        return ComponentScore(
            "Comment quality", 15,
            raw_value=comment_rate, baseline=None,
            multiplier=multiplier, percentile=percentile,
            weighted_score=final_pts, max_pts=15,
            reasoning=reasoning,
            confidence="high" if sentiment is not None else "medium"
        )

    # ── Percentile (ถ้ามี historical data) ────────────────────

    def _percentile(self, metric: str, value: float) -> Optional[float]:
        if not self.historical:
            return None
        key_map = {
            "er": lambda p: (p.get("engaged_users") or 0) / (p.get("reach") or 1) * 100,
            "reach_rate": lambda p: (p.get("reach") or 0) / (self.b.get("follower_count") or 1) * 100,
            "save_share": lambda p: ((p.get("saves") or 0) + (p.get("shares") or 0)) / (p.get("reach") or 1) * 100,
            "comment_rate": lambda p: (p.get("comment_count_api") or 0) / (p.get("reach") or 1) * 100,
        }
        fn = key_map.get(metric)
        if not fn:
            return None
        values = sorted([fn(p) for p in self.historical if fn(p) > 0])
        if not values:
            return None
        rank = sum(1 for v in values if v <= value)
        return round((rank / len(values)) * 100, 0)


# ───────────────────────────────────────────────────────────────
# BASELINE CALCULATOR (จาก historical posts)
# ───────────────────────────────────────────────────────────────

def calculate_baseline(posts: list[dict], follower_count: int) -> dict:
    """
    คำนวณ baseline ของเพจจาก historical posts
    ใช้ median ไม่ใช่ mean เพื่อกัน outlier
    """
    def median(lst):
        s = sorted([x for x in lst if x is not None])
        if not s: return None
        n = len(s)
        return s[n // 2] if n % 2 else (s[n // 2 - 1] + s[n // 2]) / 2

    ers, saves, shares, comments, reaches, hides = [], [], [], [], [], []

    for p in posts:
        reach = p.get("reach") or 0
        if reach == 0:
            continue
        eng = p.get("engaged_users")
        if eng is not None:
            ers.append(eng / reach * 100)
        sv = p.get("saves")
        if sv is not None:
            saves.append(sv / reach * 100)
        sh = p.get("shares")
        if sh is not None:
            shares.append(sh / reach * 100)
        cm = p.get("comment_count_api")
        if cm is not None:
            comments.append(cm / reach * 100)
        reaches.append(reach)
        hide = p.get("hide_post")
        if hide is not None:
            hides.append(hide / reach * 100)

    return {
        "ER": round(median(ers) or 0, 2),
        "save_rate": round(median(saves) or 0, 2),
        "share_rate": round(median(shares) or 0, 2),
        "comment_rate": round(median(comments) or 0, 2),
        "reach_rate": round(median([r / follower_count * 100 for r in reaches]) or 0, 2),
        "hide_rate": round(median(hides) or 0, 3),
        "follower_count": follower_count,
        "sample_size": len(posts),
    }


# ───────────────────────────────────────────────────────────────
# HELPERS
# ───────────────────────────────────────────────────────────────

def _to_grade(score: float) -> str:
    for threshold, grade in GRADE_THRESHOLDS:
        if score >= threshold:
            return grade
    return "F"


def _log_scale(multiplier: float, min_m: float, max_m: float, max_pts: float) -> float:
    """
    Map multiplier onto 0–max_pts ด้วย log scale
    multiplier 1.0 = baseline = ~50% ของ max_pts
    """
    m = max(min_m, min(multiplier, max_m))
    log_min = math.log(min_m)
    log_max = math.log(max_m)
    log_m = math.log(m)
    fraction = (log_m - log_min) / (log_max - log_min)
    return round(fraction * max_pts, 1)


def _fmt(n) -> str:
    if n is None: return "N/A"
    if n >= 1_000_000: return f"{n/1_000_000:.1f}M"
    if n >= 1_000: return f"{n/1_000:.1f}K"
    return str(int(n))
