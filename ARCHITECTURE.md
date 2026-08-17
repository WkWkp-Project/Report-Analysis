# Production architecture

ระบบถูกออกแบบให้เริ่มใช้งานและ deploy ได้ด้วย artifact เดียว โดยไม่ผูก frontend, backend และ data pipeline จนแยกแก้ไม่ได้

## Runtime

```text
Browser
  │
  ▼
FastAPI service
  ├── /api/*              API, import gates และ analysis
  ├── /                    React production build
  └── /app/data            persistent imports, media และ manifests
          │
          ├── raw/         ไฟล์ต้นฉบับ ห้ามแก้
          ├── staged/      ข้อมูลที่ normalize แล้วแต่ยังไม่ยืนยัน
          ├── confirmed/   dataset ที่ผ่าน quality gates
          ├── media/       รูป/metadata ของ content พร้อม checksum
          └── manifests/   scope, mapping, lineage และผล validation
```

Development ยังคงแยก Vite `:5173` และ FastAPI `:8000` เพื่อให้แก้ UI เร็ว ส่วน production ให้ FastAPI serve frontend build จาก container เดียว ลดการตั้งค่า domain, CORS และ deployment

## Deployment levels

### Level 1 — Single machine / small team

- Docker Compose หนึ่ง service
- named volume `report-analysis-data` mount ที่ `/app/data`
- secret และ runtime config อยู่ใน `.env` ไฟล์เดียว
- signed HttpOnly session ป้องกัน API ทุกเส้นทางที่อ่านหรือแก้ข้อมูล
- container รันด้วย non-root user, read-only filesystem และไม่มี Linux capabilities
- เหมาะกับ demo, internal use และข้อมูลขนาดเล็ก

### Level 2 — Managed production

- container เดิมบน Render, Railway, Fly.io, Cloud Run หรือ VM
- object storage สำหรับไฟล์และรูป
- PostgreSQL สำหรับ metadata/import sessions
- background worker สำหรับ API pulls, media enrichment และ AI

การขยับจาก Level 1 ไป Level 2 ต้องเปลี่ยน storage adapter ไม่ใช่เปลี่ยน data contract หรือ UI workflow

## Service boundaries

- `api_client.py` — connector เฉพาะ Facebook เท่านั้น
- `import_pipeline/` — canonical schema, mapping, granularity และ quality gates
- `data/` — runtime state; ไม่ commit เข้า Git
- `scoring.py`, `analyzer.py` — รับเฉพาะ confirmed canonical records
- `topic_extractor.py` — รับเฉพาะ analysis-ready dataset และ media metadata
- `frontend/` — แสดงสถานะของ import session และห้ามข้าม gate

## Non-negotiable rules

1. Raw input เป็น immutable และเก็บ checksum
2. ทุก metric มี source, original column, type, aggregation และ unit
3. ทุก row ต้อง resolve account, campaign, date และ brand ก่อน confirm
4. Blend ได้เมื่อ granularity และ join keys ผ่าน validation เท่านั้น
5. AI อ่านได้เฉพาะ dataset สถานะ `analysis_ready`
6. การ rerun ต้องอ้าง manifest/version เดิมเพื่อ reproduce รายงานได้

## Level 1 data boundary

ระบบยังไม่ต้องใช้ SQL ในช่วงก่อนยื่น Meta API ข้อมูลแยกเป็นสองส่วนชัดเจน:

- `.env` — รหัสผ่านและ encryption keys; สำรองแบบ secret และห้าม commit
- `report-analysis-data` — encrypted Facebook connection และ dataset/runtime files; สำรองเป็น volume

ต้องมีทั้งสองส่วนเมื่อต้อง restore เครื่องใหม่ การลบ container หรือ rebuild image ไม่ลบ named volume แต่ `docker compose down -v` จะลบข้อมูล จึงห้ามใช้คำสั่งนี้กับระบบจริงโดยไม่มี backup

Streamlit (`app.py`) ไม่ถูก copy เข้า production image และไม่อยู่หลัง authentication middleware ใช้ได้เฉพาะการทดลอง local เท่านั้น
