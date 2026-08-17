# Branch strategy

โครงการนี้ใช้ `main` เป็น branch เสถียรที่ควรรันได้เสมอ และพัฒนางานผ่าน branch อายุสั้นก่อนเปิด Pull Request กลับเข้า `main`

## Branch map

| Branch pattern | ขอบเขตงาน | ไฟล์หลัก |
| --- | --- | --- |
| `feature/backend-api-*` | REST API, validation และการประกอบ payload | `server.py`, `serializer.py` |
| `feature/frontend-dashboard-*` | หน้าจอ React, interaction และ API adapter | `frontend/src/`, `frontend/vite.config.js` |
| `feature/facebook-data-*` | Facebook Graph/Marketing API และ mapping ข้อมูล | `api_client.py` |
| `feature/data-import-*` | import scope, canonical mapping, validation, lineage และ file/API ingestion | `import_pipeline/`, `DATA_IMPORT.md` |
| `feature/workspace-portfolio-*` | Workspace, Brand, Project และ external Campaign registry | `portfolio.py`, portfolio API, tests |
| `feature/report-elements-*` | text, comment, key takeaway และ next-step blocks ที่ผูกกับ project/report | report element model/API และ `frontend/src/` |
| `feature/import-scope-*` | account/date/campaign/project/brand selection ก่อนเข้า import gates | import scope API/UI และ `import_pipeline/` |
| `feature/scoring-analytics-*` | baseline, scoring, correlation, pattern และ schedule | `scoring.py`, `analyzer.py` |
| `feature/ai-insights-*` | topic extraction และ narrative insight | `topic_extractor.py` |
| `feature/streamlit-*` | Streamlit UI เดิม | `app.py` |
| `test/*` | automated tests และ fixtures | `tests/` |
| `fix/*` | bug fix ที่กระทบขอบเขตแคบ | ระบุตามปัญหา |
| `chore/deployment-docs-*` | dependencies, Docker/CI, configuration และเอกสาร | `requirements.txt`, `frontend/package*.json`, `README.md` |

## Workflow

1. อัปเดต `main` ให้ล่าสุดแล้วสร้าง branch ตามตาราง
2. หนึ่ง branch ควรมีเป้าหมายเดียวและไม่ผสมงานคนละส่วนโดยไม่จำเป็น
3. รัน Python syntax check, demo pipeline และ frontend build ก่อน push
4. เปิด Pull Request เข้า `main` และ merge หลังตรวจสอบแล้ว
5. ลบ branch หลัง merge เพื่อป้องกัน branch เก่าค้างและแตกต่างจาก `main`

ไม่สร้าง `develop` หรือ branch แยกตามโมดูลแบบถาวรในช่วงเริ่มต้น เพราะทีมสามารถใช้ `main` กับ short-lived feature branches ได้ง่ายกว่า และลดปัญหา merge conflict ระยะยาว

## Dependency order for reporting workspace work

```text
fix/pre-api-security-hardening
  └── feature/workspace-portfolio-model
        ├── feature/report-elements-project-scoped
        └── feature/import-scope-project-context
              └── feature/facebook-ads-insights-import
```

Portfolio เป็นฐานร่วมเพราะ Report Elements และ import sessions ต้องอ้าง `project_id` เดียวกัน ห้ามใส่ Brand, Project หรือ Campaign ใน ENV; ENV เก็บเฉพาะ runtime configuration และ secret เท่านั้น
