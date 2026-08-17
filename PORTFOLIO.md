# Portfolio and report scope

## Level 1 hierarchy

```text
Authenticated workspace
  ├── Brand A
  ├── Brand B
  └── Project
        ├── allowed brand_ids[]
        ├── Report period
        │     ├── date_from / date_to
        │     └── cadence: monthly | custom
        └── Campaign binding
              ├── source: facebook | file
              ├── source_account_id
              ├── source_campaign_id
              └── brand_ids[] ⊆ project.brand_ids[]
```

Project เป็น reporting boundary หลักและรองรับหลายแบรนด์ Campaign binding เก็บ external identity แยกตาม source เพื่อให้ account เดียวมีหลายแบรนด์ได้โดยไม่เดาจากชื่อ campaign ส่วนการ override brand ระดับ ad/content ยังคงอยู่ใน import manifest

## Storage and security

- เก็บที่ `APP_DATA_DIR/portfolio/catalog.json` ภายใน Docker volume เดิม
- เขียนผ่าน temporary file + `fsync` + atomic replace และตั้ง permission `0600`
- API ทุกเส้นทางต้องผ่าน signed workspace session
- mutation ใช้ origin validation และ shared rate limit
- request ไม่รับ `workspace_id`; Level 1 จึงไม่มี client-controlled tenant switch
- Brand, Project และ Campaign ไม่อยู่ใน ENV และไม่เพิ่ม service/database/container

## API boundary

- `GET /api/portfolio`
- `PATCH /api/portfolio/workspace`
- `POST /api/portfolio/brands`
- `POST /api/portfolio/projects`
- `POST /api/portfolio/periods`
- `POST /api/portfolio/campaigns`

ทุก mutation คืน snapshot ล่าสุดเพื่อให้ frontend เปลี่ยน context โดยไม่ต้องรวม state จากหลาย response

## Dependent branches

1. `feature/report-elements-project-scoped` เพิ่ม text/comment/key/next-step element โดยบังคับ `project_id`
2. `feature/import-scope-project-context` เลือก project/date/account/campaign/brand ก่อน mapping
3. `feature/facebook-ads-insights-import` ดึง Ads Insights ตาม scope ที่ผ่าน validation แล้ว

หากระบบเปิดให้หลายบริษัทล็อกอินแยกกัน ต้องเพิ่ม user, workspace membership และ per-resource authorization ก่อนเปลี่ยน Level 1 เป็น multi-tenant

## Project-scoped report elements

Working notes เป็นข้อมูลอีกชุดที่อ้าง `project_id` จาก registry นี้โดยตรง รองรับ `text`, `comment`, `key_takeaway` และ `next_step` และไม่รับ workspace จาก client

- เก็บที่ `APP_DATA_DIR/report_elements/{project_id}.json` ใน volume เดิม
- ตรวจรูปแบบ Project ID ก่อนสร้าง path และตรวจว่า Project มีอยู่จริงก่อนทุก API call
- บันทึกเป็น plain text เท่านั้น; React escape ข้อความก่อนแสดงผล
- update ต้องส่ง `expected_version` เพื่อกันหน้าจอเก่าเขียนทับข้อมูลที่ใหม่กว่า
- ใช้ atomic write และ permission `0600` แบบเดียวกับ portfolio registry
- ทุก endpoint ต้องผ่าน session, origin policy และ write rate limit

API ที่เพิ่มใน branch `feature/report-elements-project-scoped`:

- `GET /api/projects/{project_id}/elements`
- `POST /api/projects/{project_id}/elements`
- `PATCH /api/projects/{project_id}/elements/{element_id}`
- `DELETE /api/projects/{project_id}/elements/{element_id}`

งานนี้ไม่เพิ่ม ENV, container, port หรือ database service ใหม่ การ deploy ยังใช้ Docker Compose คำสั่งเดิมและสำรอง named volume `report-analysis-data` ชุดเดียว
