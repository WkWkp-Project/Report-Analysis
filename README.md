# Facebook Performance Analyzer

วิเคราะห์ performance ของเพจ Facebook แบบครบวงจร
ดึงข้อมูลจาก Graph API + Marketing API โดยตรง — ไม่เดาตัวเลข

## โครงสร้าง

```
fb_analyzer/
├── app.py           Streamlit UI (3 tiers)
├── api_client.py    Facebook Graph API + Marketing API
├── scoring.py       คำนวณคะแนน + เหตุผลแบบ transparent
├── analyzer.py      Correlation, pattern, heatmap, schedule
├── requirements.txt
├── .env.example
└── README.md
```

## Setup

### 1. Clone / copy ไฟล์
```bash
mkdir fb_analyzer && cd fb_analyzer
# วางไฟล์ทั้งหมดที่นี่
```

### 2. Install dependencies
```bash
pip install -r requirements.txt
```

### 3. ตั้งค่า .env
```bash
cp .env.example .env
# แก้ไข .env ใส่ token จริง
```

### 4. ขอ Facebook Access Token
1. ไปที่ [Graph API Explorer](https://developers.facebook.com/tools/explorer/)
2. เลือก App ที่สร้างไว้ (หรือสร้างใหม่ที่ developers.facebook.com)
3. เลือก **User or Page** → เลือกเพจที่ต้องการ
4. เพิ่ม permissions:
   - `pages_read_engagement`
   - `pages_read_user_content`
   - `read_insights`
   - `pages_show_list`
   - `ads_read` (ถ้าต้องการ ad data)
5. Generate Token → Copy ใส่ `.env`

> **หมายเหตุ:** Token ที่ได้จาก Explorer มีอายุ 1 ชั่วโมง
> สำหรับใช้งานจริง ให้ exchange เป็น long-lived token:
> `GET https://graph.facebook.com/oauth/access_token?grant_type=fb_exchange_token&...`

### 5. รัน

**ทางเลือก A — Streamlit (เดิม)**
```bash
streamlit run app.py
```
เปิด browser ที่ `http://localhost:8501`
> ยังไม่มี FB token? กดปุ่ม **📊 โหลด demo data** ใน sidebar
> จะรัน scoring/analyzer pipeline จริงบนข้อมูลตัวอย่างได้ทันที

**ทางเลือก B — REST API + React frontend (แนะนำ)**

backend (terminal 1):
```bash
uvicorn server:app --reload --port 8000
```

frontend (terminal 2):
```bash
cd frontend
npm install        # ครั้งแรกเท่านั้น
npm run dev
```
เปิด browser ที่ `http://localhost:5173`

> ถ้ายังไม่ได้ตั้ง `.env` (ไม่มี FB token) backend จะ fallback เป็น **demo data**
> โดยรัน scoring/analyzer pipeline จริงบนข้อมูลตัวอย่าง — frontend ทำงานได้ครบทันที
> เมื่อใส่ token จริงแล้ว API จะดึงจาก Graph API อัตโนมัติ

#### สถาปัตยกรรม (ทางเลือก B)
```
frontend/ (React + Vite)  ──/api/analyze──▶  server.py (FastAPI)
                                                  │
                              ┌───────────────────┼───────────────────┐
                              ▼                    ▼                   ▼
                        api_client.py         scoring.py          analyzer.py
                       (Graph/Mktg API)    (4-component score)  (corr/heatmap)
                              │                    │                   │
                              └──────────▶ serializer.py ◀─────────────┘
                                       (แปลงเป็น JSON shape ที่ React ใช้)
                                              │
                                              ▼
                                   topic_extractor.py (Claude API · optional)
                              (topic extraction + narrative reasoning)
```

> **ชั้น Claude API (optional)** — ถ้ามี `ANTHROPIC_API_KEY` ใน `.env`
> ระบบจะเติม topic/hook ราย post และ narrative insight ภาพรวม
> (`payload.ai.enabled = true`, `payload.ai_summary`).
> ถ้าไม่มี key จะ fallback เป็น deterministic insight — ทั้ง demo และ live ยังทำงานครบ

dev: vite proxy `/api` → `localhost:8000` (ดู `frontend/vite.config.js`) จึงไม่ติด CORS

## การใช้งาน

1. **Sidebar** — เลือก date range, mode (All/Organic/Paid), กด "Load / Refresh data"
2. **Tier 1 (Overview)** — ภาพรวม, top posts, format chart, heatmap, AI insights
3. **Tier 2 (Ads vs Organic)** — เปรียบเทียบแยกฝั่ง, correlation, creative pattern, cost efficiency
4. **Tier 3 (Post deep-dive)** — คลิกโพสต์ใน sidebar หรือใน table
   - metrics ครบทุก category
   - health check (green/amber/red)
   - score breakdown พร้อม reasoning
   - compare vs page baseline
   - recommendations 3 ระยะ

## Scoring methodology

```
score (0–100) = weighted sum ของ 4 components:

Engagement quality (40%)
  = ER ÷ page_baseline_ER → log-scale → p0–p100

Reach efficiency (25%)
  = reach_rate ÷ page_baseline_reach_rate
  - penalty: frequency > 2.0
  - bonus: viral coefficient

Save + share (20%)
  = (save% + share%) ÷ baseline

Comment quality (15%)
  = comment_rate × (sentiment bonus) × (avg_length bonus)
```

ทุก component ใช้ **median baseline ของเพจตัวเอง** (rolling 90 วัน)
ไม่นำ industry benchmark มาใช้

## ข้อมูลที่ดึงได้ / ไม่ได้

| Field | Available |
|---|---|
| Impressions, Reach, Frequency | ✅ |
| Reach แยก organic/paid/viral | ✅ |
| Video views (3s/10s/complete) | ✅ วิดีโอเท่านั้น |
| Reactions แยกประเภท | ✅ |
| Shares, Saves | ✅ |
| Comments count | ✅ |
| Comment text (สำหรับ sentiment) | ✅ (optional, rate-limited) |
| Ad spend, CPM, CPE | ✅ ต้องมี ads_read |
| ROAS | ✅ เฉพาะ conversion ads ที่มี pixel |
| Unfollow attribution | ❌ Meta ไม่เปิด |
| Organic reach ของ dark post | ❌ |
| Competitor page data | ❌ |

## Claude Code

แนะนำให้ต่อยอดด้วย Claude Code ใน terminal:
```bash
claude
```
Claude จะอ่านโค้ด, แก้ไขไฟล์, รัน test ได้โดยตรง

## การพัฒนาต่อ

ดูขอบเขตและรูปแบบการตั้งชื่อ branch ใน [BRANCHING.md](BRANCHING.md) ก่อนเริ่มแก้ไข เพื่อแยกงาน backend, frontend, Facebook API, scoring และ AI insight ออกจากกันอย่างชัดเจน

## Data import และ production

- [ARCHITECTURE.md](ARCHITECTURE.md) — โครงสร้าง runtime, storage และแนวทาง deploy จากเครื่องเดียวไป managed production
- [DATA_IMPORT.md](DATA_IMPORT.md) — workflow แบบ gated stages ตั้งแต่เลือกช่วงข้อมูลจนพร้อมให้ AI วิเคราะห์

### Production แบบ container เดียว

```bash
docker compose up --build -d
```

เปิด `http://localhost:8000` โดย FastAPI จะ serve ทั้ง REST API และ React production build ส่วนข้อมูล runtime อยู่ใน `./data` ผ่าน persistent volume

### Validation tests

```bash
python -m unittest discover -s tests -v
```
