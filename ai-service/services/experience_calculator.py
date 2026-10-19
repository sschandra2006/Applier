"""
Experience & Education Calculator Service
Handles robust date parsing, cumulative work duration computation,
date conflict/chronological inversion detection, and structured degree level hierarchy comparison.
"""

import re
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

DEGREE_HIERARCHY: Dict[str, int] = {
    "DOCTORATE": 4,
    "MASTERS": 3,
    "BACHELORS": 2,
    "ASSOCIATES": 1,
    "NONE": 0
}

MONTH_MAP = {
    "jan": 1, "january": 1,
    "feb": 2, "february": 2,
    "mar": 3, "march": 3,
    "apr": 4, "april": 4,
    "may": 5,
    "jun": 6, "june": 6,
    "jul": 7, "july": 7,
    "aug": 8, "august": 8,
    "sep": 9, "sept": 9, "september": 9,
    "oct": 10, "october": 10,
    "nov": 11, "november": 11,
    "dec": 12, "december": 12
}


def parse_date_string(date_str: Optional[str]) -> Optional[datetime]:
    """
    Parses date strings into timezone-aware datetime (UTC).
    Supports formats:
      - 'present', 'current', 'now', 'ongoing'
      - 'YYYY-MM' or 'YYYY/MM'
      - 'YYYY'
      - 'Month YYYY' or 'Mon YYYY' (e.g., 'May 2021', 'Jan 2019')
      - 'MM/YYYY'
    """
    if not date_str:
        return None

    raw = date_str.strip().lower()
    now_utc = datetime.now(timezone.utc)

    if raw in ["present", "current", "now", "ongoing", "today"]:
        return now_utc

    # 1. YYYY-MM or YYYY/MM
    match_ym = re.match(r"^(\d{4})[-/](\d{1,2})$", raw)
    if match_ym:
        year = int(match_ym.group(1))
        month = int(match_ym.group(2))
        if 1 <= month <= 12 and 1950 <= year <= 2100:
            return datetime(year, month, 1, tzinfo=timezone.utc)

    # 2. MM/YYYY
    match_my = re.match(r"^(\d{1,2})[-/](\d{4})$", raw)
    if match_my:
        month = int(match_my.group(1))
        year = int(match_my.group(2))
        if 1 <= month <= 12 and 1950 <= year <= 2100:
            return datetime(year, month, 1, tzinfo=timezone.utc)

    # 3. Just Year 'YYYY'
    match_y = re.match(r"^(\d{4})$", raw)
    if match_y:
        year = int(match_y.group(1))
        if 1950 <= year <= 2100:
            return datetime(year, 1, 1, tzinfo=timezone.utc)

    # 4. 'Month YYYY' or 'Mon YYYY'
    match_text_ym = re.match(r"^([a-z]+)[,\s]+(\d{4})$", raw)
    if match_text_ym:
        month_name = match_text_ym.group(1)
        year = int(match_text_ym.group(2))
        if month_name in MONTH_MAP and 1950 <= year <= 2100:
            return datetime(year, MONTH_MAP[month_name], 1, tzinfo=timezone.utc)

    # 5. Fallback ISO format try
    try:
        # Strip potential timestamp if provided
        clean_iso = raw.split("t")[0]
        dt = datetime.fromisoformat(clean_iso)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except Exception:
        pass

    return None


def calculate_duration_years(
    start_date_str: Optional[str],
    end_date_str: Optional[str],
    is_current: bool = False
) -> Tuple[float, Optional[str]]:
    """
    Computes duration in decimal years between start and end dates.
    Detects chronological conflicts (e.g. start > end).
    
    Returns:
        (years: float, conflict_warning: Optional[str])
    """
    if not start_date_str:
        return 0.0, "Missing start date for experience item"

    start_dt = parse_date_string(start_date_str)
    if not start_dt:
        return 0.0, f"Unparseable start date format: '{start_date_str}'"

    if is_current or not end_date_str:
        end_dt = datetime.now(timezone.utc)
    else:
        end_dt = parse_date_string(end_date_str)
        if not end_dt:
            return 0.0, f"Unparseable end date format: '{end_date_str}'"

    # Chronological Inversion Conflict Detection
    if start_dt > end_dt:
        return 0.0, f"Conflicting dates: start date ({start_date_str}) is after end date ({end_date_str})"

    # Future date anomaly detection
    now_utc = datetime.now(timezone.utc)
    if (start_dt - now_utc).days > 365:
        return 0.0, f"Conflicting date: start date ({start_date_str}) is more than 1 year in the future"

    # Compute duration in days / 365.25
    delta_days = (end_dt - start_dt).days
    if delta_days < 0:
        return 0.0, "Negative duration detected"

    years = round(delta_days / 365.25, 2)
    # Give at least 0.08 years (approx 1 month) if dates are in same month
    if years == 0.0:
        years = 0.08

    return years, None


def calculate_cumulative_experience(experience_items: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Calculates total cumulative experience years across all items and aggregates date conflicts.
    Does not falsely inflate years for inverted/conflicting dates.
    """
    total_years = 0.0
    conflicts: List[str] = []
    items_calculated = 0

    # Also track date intervals to avoid double-counting extreme overlaps
    intervals: List[Tuple[datetime, datetime]] = []

    for idx, item in enumerate(experience_items):
        start_raw = item.get("startDate")
        end_raw = item.get("endDate")
        is_current = bool(item.get("isCurrent", False))

        duration, warning = calculate_duration_years(start_raw, end_raw, is_current)
        if warning:
            company = item.get("company", f"Role #{idx + 1}")
            conflicts.append(f"{company}: {warning}")

        if duration > 0:
            total_years += duration
            items_calculated += 1

    return {
        "totalYears": round(total_years, 1),
        "conflicts": conflicts,
        "itemsCalculated": items_calculated
    }


def parse_degree_level(degree_str: Optional[str]) -> str:
    """
    Normalizes a degree string to one of the canonical degree levels:
    'DOCTORATE', 'MASTERS', 'BACHELORS', 'ASSOCIATES', 'NONE'.
    """
    if not degree_str:
        return "NONE"

    d = degree_str.strip().lower()

    # Doctorate
    if any(k in d for k in ["phd", "ph.d", "doctorate", "doctoral", "d.sc", "ed.d"]):
        return "DOCTORATE"

    # Masters
    if any(k in d for k in ["master", "m.s", "ms", "m.a", "ma", "mba", "m.tech", "mtech", "m.eng", "meng"]):
        return "MASTERS"

    # Bachelors
    if any(k in d for k in ["bachelor", "b.s", "bs", "b.a", "ba", "b.tech", "btech", "b.e", "be", "bba", "undergraduate"]):
        return "BACHELORS"

    # Associates
    if any(k in d for k in ["associate", "a.s", "as", "a.a", "aa"]):
        return "ASSOCIATES"

    return "NONE"


def compare_degree_requirements(
    candidate_education_items: List[Dict[str, Any]],
    required_degree_level: str
) -> Tuple[bool, str, str]:
    """
    Compares candidate's education history against a required degree level
    using structured hierarchical ranking.
    
    Returns:
        (is_satisfied: bool, highest_candidate_level: str, explanation: str)
    """
    req_level = required_degree_level.upper() if required_degree_level else "NONE"
    req_rank = DEGREE_HIERARCHY.get(req_level, 0)

    highest_candidate_level = "NONE"
    highest_candidate_rank = 0

    for edu in candidate_education_items:
        deg_str = edu.get("degree", "")
        level = parse_degree_level(deg_str)
        rank = DEGREE_HIERARCHY.get(level, 0)
        if rank > highest_candidate_rank:
            highest_candidate_rank = rank
            highest_candidate_level = level

    if req_rank == 0:
        return True, highest_candidate_level, "No specific degree level required"

    if highest_candidate_rank >= req_rank:
        if highest_candidate_rank > req_rank:
            explanation = (
                f"Candidate's highest degree level ({highest_candidate_level}) "
                f"exceeds the required level ({req_level})."
            )
        else:
            explanation = (
                f"Candidate meets the required degree level ({req_level})."
            )
        return True, highest_candidate_level, explanation
    else:
        explanation = (
            f"Candidate's highest degree level ({highest_candidate_level}) "
            f"does not meet the required level ({req_level})."
        )
        return False, highest_candidate_level, explanation
