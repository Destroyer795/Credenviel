"""Extractor interfaces and stub implementation."""

from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Any


@dataclass
class ExtractionResult:
    """Output of document extraction."""
    fields: dict[str, Any]
    field_confidences: dict[str, float]
    marks_confidences: list[dict[str, Any]]


class Extractor(ABC):
    @abstractmethod
    def extract(self, stream, filename: str) -> ExtractionResult:
        """Extract structured fields and confidences from document stream."""
        pass


class StubExtractor(Extractor):
    """Stub extractor producing deterministic mock fields with tunable confidence profiles."""

    def __init__(self, profile: str = "high", single_low_marks: bool = False):
        self.profile = profile
        self.single_low_marks = single_low_marks

    def extract(self, stream, filename: str) -> ExtractionResult:
        # Read stream to simulate consuming input
        _ = stream.read()

        # Fixed canonical fields per spec § 5.7 and change B (5 cell keys)
        fields = {
            "name": "Jane Doe",
            "roll_number": "CS2026-001",
            "register_number": "REG-987654",
            "degree": "Bachelor of Technology in Computer Science",
            "marks": [
                {
                    "subject_code": "CS101",
                    "subject_name": "Data Structures",
                    "marks_obtained": "88",
                    "max_marks": "100",
                    "grade": "A",
                },
                {
                    "subject_code": "CS102",
                    "subject_name": "Algorithms",
                    "marks_obtained": "92",
                    "max_marks": "100",
                    "grade": "A+",
                },
                {
                    "subject_code": "CS103",
                    "subject_name": "Operating Systems",
                    "marks_obtained": "85",
                    "max_marks": "100",
                    "grade": "A",
                },
            ],
            "cgpa": "8.85",
            "issue_date": "2026-05-15",
        }

        if self.single_low_marks:
            # Everything high except one marks cell
            field_confidences = {
                "name": 0.98,
                "roll_number": 0.96,
                "register_number": 0.95,
                "degree": 0.97,
                "cgpa": 0.94,
                "issue_date": 0.99,
            }
            marks_confidences = [
                {
                    "subject_code": "CS101",
                    "cells": {
                        "subject_code": 0.99,
                        "subject_name": 0.95,
                        "marks_obtained": 0.94,
                        "max_marks": 0.99,
                        "grade": 0.45,  # Single low marks cell!
                    },
                },
                {
                    "subject_code": "CS102",
                    "cells": {
                        "subject_code": 0.99,
                        "subject_name": 0.98,
                        "marks_obtained": 0.97,
                        "max_marks": 0.99,
                        "grade": 0.95,
                    },
                },
                {
                    "subject_code": "CS103",
                    "cells": {
                        "subject_code": 0.99,
                        "subject_name": 0.96,
                        "marks_obtained": 0.93,
                        "max_marks": 0.99,
                        "grade": 0.94,
                    },
                },
            ]
        elif self.profile == "low":
            # Profile low: name at 0.62 and one grade at 0.41 per spec § 5.7
            field_confidences = {
                "name": 0.62,
                "roll_number": 0.96,
                "register_number": 0.95,
                "degree": 0.97,
                "cgpa": 0.94,
                "issue_date": 0.99,
            }
            marks_confidences = [
                {
                    "subject_code": "CS101",
                    "cells": {
                        "subject_code": 0.99,
                        "subject_name": 0.95,
                        "marks_obtained": 0.94,
                        "max_marks": 0.99,
                        "grade": 0.41,  # Low cell
                    },
                },
                {
                    "subject_code": "CS102",
                    "cells": {
                        "subject_code": 0.99,
                        "subject_name": 0.98,
                        "marks_obtained": 0.97,
                        "max_marks": 0.99,
                        "grade": 0.95,
                    },
                },
                {
                    "subject_code": "CS103",
                    "cells": {
                        "subject_code": 0.99,
                        "subject_name": 0.96,
                        "marks_obtained": 0.93,
                        "max_marks": 0.99,
                        "grade": 0.94,
                    },
                },
            ]
        else:
            # Profile high: everything above 0.85
            field_confidences = {
                "name": 0.98,
                "roll_number": 0.96,
                "register_number": 0.95,
                "degree": 0.97,
                "cgpa": 0.94,
                "issue_date": 0.99,
            }
            marks_confidences = [
                {
                    "subject_code": "CS101",
                    "cells": {
                        "subject_code": 0.99,
                        "subject_name": 0.95,
                        "marks_obtained": 0.94,
                        "max_marks": 0.99,
                        "grade": 0.96,
                    },
                },
                {
                    "subject_code": "CS102",
                    "cells": {
                        "subject_code": 0.99,
                        "subject_name": 0.98,
                        "marks_obtained": 0.97,
                        "max_marks": 0.99,
                        "grade": 0.95,
                    },
                },
                {
                    "subject_code": "CS103",
                    "cells": {
                        "subject_code": 0.99,
                        "subject_name": 0.96,
                        "marks_obtained": 0.93,
                        "max_marks": 0.99,
                        "grade": 0.94,
                    },
                },
            ]

        return ExtractionResult(
            fields=fields,
            field_confidences=field_confidences,
            marks_confidences=marks_confidences,
        )
