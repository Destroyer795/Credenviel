"""Confidence evaluation logic and confidence_json generation."""

from typing import Any


def evaluate_confidence(
    field_confidences: dict[str, float],
    marks_confidences: list[dict[str, Any]],
    threshold: float = 0.85,
) -> tuple[bool, dict[str, Any]]:
    """Evaluate field and marks cell confidences against threshold.

    Returns:
        (all_passed: bool, confidence_json: dict)
        all_passed is True iff every single field and marks cell is >= threshold.
    """
    below_threshold = []

    # Check top-level fields
    for field_name, score in field_confidences.items():
        if score < threshold:
            below_threshold.append({
                "type": "field",
                "name": field_name,
                "score": score,
            })

    # Check marks table cells
    for row in marks_confidences:
        sub_code = row.get("subject_code", "UNKNOWN")
        cells = row.get("cells", {})
        for cell_name, score in cells.items():
            if score < threshold:
                below_threshold.append({
                    "type": "marks_cell",
                    "subject_code": sub_code,
                    "cell": cell_name,
                    "score": score,
                })

    all_passed = len(below_threshold) == 0

    confidence_json = {
        "threshold": threshold,
        "fields": field_confidences,
        "marks": marks_confidences,
        "below_threshold": below_threshold,
    }

    return all_passed, confidence_json
