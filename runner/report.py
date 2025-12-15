from __future__ import annotations

import csv
import pathlib
from typing import Dict, List


def aggregate_summaries(run_root: str | pathlib.Path) -> List[Dict]:
    root = pathlib.Path(run_root)
    rows: List[Dict] = []
    for csv_path in root.glob("*/summary.csv"):
        with csv_path.open("r", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for row in reader:
                rows.append(row)
    return rows


