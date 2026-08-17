"""Seed a local-only portfolio so the brand-first workspace can be previewed."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT))

from portfolio import (  # noqa: E402
    BrandCreate,
    CampaignCreate,
    PortfolioStore,
    ProjectCreate,
    ReportPeriodCreate,
    WorkspaceUpdate,
)


def seed(data_dir: Path) -> bool:
    store = PortfolioStore(data_dir)
    current = store.snapshot()
    if current.brands or current.projects or current.periods or current.campaigns:
        return False

    store.update_workspace(WorkspaceUpdate(name="WkWkp Marketing Workspace"))
    brand_ids: dict[str, str] = {}
    for name, code in [
        ("Bangkok Bites", "BB"),
        ("Northwind Living", "NW"),
        ("Mellow Daily", "MD"),
    ]:
        snapshot = store.create_brand(BrandCreate(name=name, code=code))
        brand_ids[name] = next(brand.id for brand in snapshot.brands if brand.name == name)

    project_specs = [
        (
            "Bangkok Bites · Monthly Performance",
            [brand_ids["Bangkok Bites"]],
            "รายงาน Organic และ Paid ประจำเดือนสำหรับทีมคอนเทนต์",
            "monthly",
        ),
        (
            "Home & Table Launch",
            [brand_ids["Northwind Living"], brand_ids["Mellow Daily"]],
            "โปรเจกต์ร่วมสองแบรนด์ ใช้หลายบัญชีโฆษณา",
            "campaign",
        ),
        (
            "Mellow Always-on",
            [brand_ids["Mellow Daily"]],
            "ติดตาม performance ต่อเนื่องและสรุปเป็นรายเดือน",
            "continuous",
        ),
    ]
    project_ids: dict[str, str] = {}
    for name, assigned_brands, description, mode in project_specs:
        snapshot = store.create_project(
            ProjectCreate(
                name=name,
                brand_ids=assigned_brands,
                description=description,
                reporting_mode=mode,
            )
        )
        project_ids[name] = next(
            project.id for project in snapshot.projects if project.name == name
        )

    for project_name, label, date_from, date_to, cadence in [
        ("Bangkok Bites · Monthly Performance", "มิถุนายน 2026", "2026-06-01", "2026-06-30", "monthly"),
        ("Bangkok Bites · Monthly Performance", "กรกฎาคม 2026", "2026-07-01", "2026-07-31", "monthly"),
        ("Bangkok Bites · Monthly Performance", "สิงหาคม 2026", "2026-08-01", "2026-08-31", "monthly"),
        ("Home & Table Launch", "Launch phase", "2026-07-15", "2026-09-15", "custom"),
        ("Mellow Always-on", "สิงหาคม 2026", "2026-08-01", "2026-08-31", "monthly"),
    ]:
        store.create_period(
            ReportPeriodCreate(
                project_id=project_ids[project_name],
                label=label,
                date_from=date_from,
                date_to=date_to,
                cadence=cadence,
            )
        )

    campaign_specs = [
        ("Bangkok Bites · Monthly Performance", "facebook", "act_10012001", "cmp_awareness_2026", "Always-on Awareness", [brand_ids["Bangkok Bites"]]),
        ("Bangkok Bites · Monthly Performance", "facebook", "act_10012002", "cmp_store_visits_2026", "Store Visits", [brand_ids["Bangkok Bites"]]),
        ("Home & Table Launch", "facebook", "act_20021001", "cmp_launch_prospect", "Launch · Prospecting", [brand_ids["Northwind Living"], brand_ids["Mellow Daily"]]),
        ("Home & Table Launch", "facebook", "act_20021002", "cmp_launch_retarget", "Launch · Retargeting", [brand_ids["Northwind Living"], brand_ids["Mellow Daily"]]),
        ("Home & Table Launch", "file", "crm_offline_sales", "offline_launch_sales", "Offline conversion import", [brand_ids["Northwind Living"]]),
        ("Mellow Always-on", "facebook", "act_30031001", "cmp_mellow_engagement", "Mellow Engagement", [brand_ids["Mellow Daily"]]),
    ]
    for project_name, source, account_id, campaign_id, name, assigned_brands in campaign_specs:
        store.create_campaign(
            CampaignCreate(
                project_id=project_ids[project_name],
                source=source,
                source_account_id=account_id,
                source_campaign_id=campaign_id,
                name=name,
                brand_ids=assigned_brands,
            )
        )
    return True


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data-dir", default=str(PROJECT_ROOT / "data"))
    args = parser.parse_args()
    data_dir = Path(args.data_dir).resolve()
    changed = seed(data_dir)
    if changed:
        print(f"Demo portfolio created in {data_dir}")
    else:
        print(f"Portfolio already contains data; no changes made in {data_dir}")


if __name__ == "__main__":
    main()
