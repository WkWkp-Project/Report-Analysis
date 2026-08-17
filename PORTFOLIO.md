# Portfolio and report scope

## Level 1 hierarchy

```text
Authenticated workspace
  ├── Brand A
  ├── Brand B
  └── Project
        ├── allowed brand_ids[]
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
- `POST /api/portfolio/campaigns`

ทุก mutation คืน snapshot ล่าสุดเพื่อให้ frontend เปลี่ยน context โดยไม่ต้องรวม state จากหลาย response

## Dependent branches

1. `feature/report-elements-project-scoped` เพิ่ม text/comment/key/next-step element โดยบังคับ `project_id`
2. `feature/import-scope-project-context` เลือก project/date/account/campaign/brand ก่อน mapping
3. `feature/facebook-ads-insights-import` ดึง Ads Insights ตาม scope ที่ผ่าน validation แล้ว

หากระบบเปิดให้หลายบริษัทล็อกอินแยกกัน ต้องเพิ่ม user, workspace membership และ per-resource authorization ก่อนเปลี่ยน Level 1 เป็น multi-tenant
