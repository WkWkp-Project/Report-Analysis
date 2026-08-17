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

## เริ่มใช้งาน

### Production / NAS — แนะนำ

ถ้ามี Python อยู่แล้ว รัน:

```bash
python scripts/generate_env.py
docker compose up --build -d
```

ถ้าเครื่องปลายทางมีเพียง Docker ให้สร้าง `.env` ผ่าน container ชั่วคราวแทน:

```bash
docker run --rm -v "${PWD}:/workspace" -w /workspace python:3.12.13-slim-bookworm python scripts/generate_env.py
docker compose up --build -d
```

เปิด `http://localhost:8000` และใช้รหัสผ่าน workspace ที่ generator แสดง ระบบ build React และรัน FastAPI ใน container เดียว ข้อมูล runtime แยกอยู่ใน Docker volume `report-analysis-data` โดยไม่ต้องติดตั้ง Node, Python หรือฐานข้อมูลบนเครื่องปลายทาง

ค่าเริ่มต้น bind เฉพาะ `127.0.0.1` เพื่อไม่เปิดพอร์ตสู่ LAN โดยไม่ตั้งใจ หากใช้ reverse proxy บน NAS ให้ชี้ proxy มาที่ `127.0.0.1:8000` และรัน generator ด้วย public HTTPS URL:

```bash
python scripts/generate_env.py --base-url https://reports.example.com
```

ก่อนย้ายเครื่องต้องสำรองทั้ง `.env` และ Docker volume เพราะ token ที่เข้ารหัสจะถอดได้ด้วย `TOKEN_ENCRYPTION_KEY` ใน `.env` เท่านั้น

### Development

```bash
python -m pip install -r requirements.txt
python -m uvicorn server:app --reload --port 8000
```

อีก terminal:

```bash
cd frontend
npm ci
npm run dev
```

เปิด `http://localhost:5173` หากยังไม่สร้าง `.env` ระบบ development จะใช้ demo data และอนุญาตเฉพาะการใช้งาน local; `APP_ENV=production` จะไม่ยอมเริ่มหากยังไม่มีรหัสผ่านและ session secret

### Streamlit เดิม

ติดตั้ง `python -m pip install -r requirements-dev.txt` แล้วใช้ `streamlit run app.py` เพื่ออ้างอิงหน้าจอเดิมและทดลองภายในเครื่องเท่านั้น ห้าม publish พอร์ต `8501` เพราะเส้นทางนี้ไม่มี authentication layer ของ production app และ dependency ชุดนี้ไม่ถูกติดตั้งใน production image

การสร้าง Meta App และเชื่อม OAuth ทำหลัง security gate ผ่านแล้ว ดู [FACEBOOK_CONNECTION.md](FACEBOOK_CONNECTION.md)

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
- [FACEBOOK_CONNECTION.md](FACEBOOK_CONNECTION.md) — ตั้งค่า Meta OAuth, การเก็บ token และ production callback

### Production แบบ container เดียว

```bash
docker compose up --build -d
```

เปิด `http://localhost:8000` โดย FastAPI จะ serve ทั้ง REST API และ React production build ส่วนข้อมูล runtime อยู่ใน `./data` ผ่าน persistent volume

### Validation tests

```bash
python -m unittest discover -s tests -v
```
