import json
import logging
import re
import time
from datetime import datetime
from typing import Any
import urllib.error
import urllib.request
from abc import ABC, abstractmethod
from dataclasses import dataclass

logger = logging.getLogger("worker.extractor")


@dataclass
class ExtractionResult:
    """Output of document extraction."""
    fields: dict[str, Any]
    field_confidences: dict[str, float]
    marks_confidences: list[dict[str, Any]]
    document_type: str = "grade_sheet"
    attributes: dict[str, Any] = None

    def __post_init__(self):
        if self.attributes is None:
            self.attributes = {}
        if "document_type" not in self.fields:
            self.fields["document_type"] = self.document_type
        if "attributes_json" not in self.fields:
            self.fields["attributes_json"] = self.attributes


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

        lower_fn = (filename or "").lower()
        if "transfer" in lower_fn or "tc" in lower_fn:
            doc_type = "transfer_certificate"
            attrs = {
                "father_name": "Robert Doe",
                "date_of_admission": "2022-08-01",
                "date_of_leaving": "2026-05-30",
                "conduct": "Good",
                "reason_for_leaving": "Course Completed",
            }
            fields = {
                "name": "Jane DOE",
                "roll_number": "CS2026-001",
                "register_number": "REG-987654",
                "degree": "",
                "marks": [],
                "cgpa": "",
                "issue_date": "2026-05-30",
                "document_type": doc_type,
                "attributes_json": attrs,
            }
        elif "bonafide" in lower_fn:
            doc_type = "bonafide_certificate"
            attrs = {
                "department": "Computer Science & Engineering",
                "academic_year": "2025-2026",
                "purpose": "Passport Application",
            }
            fields = {
                "name": "Jane DOE",
                "roll_number": "CS2026-001",
                "register_number": "REG-987654",
                "degree": "Bachelor of Technology",
                "marks": [],
                "cgpa": "",
                "issue_date": "2026-05-15",
                "document_type": doc_type,
                "attributes_json": attrs,
            }
        elif "conduct" in lower_fn or "character" in lower_fn:
            doc_type = "conduct_certificate"
            attrs = {
                "character": "Exemplary",
                "academic_period": "2022-2026",
            }
            fields = {
                "name": "Jane DOE",
                "roll_number": "CS2026-001",
                "register_number": "REG-987654",
                "degree": "Bachelor of Technology",
                "marks": [],
                "cgpa": "",
                "issue_date": "2026-05-15",
                "document_type": doc_type,
                "attributes_json": attrs,
            }
        else:
            doc_type = "grade_sheet"
            attrs = {}
            # Realistic mixed-case and irregularly spaced fields that normalize to the canonical baseline
            fields = {
                "name": "  Jane   DOE ",
                "roll_number": " CS2026-001 ",
                "register_number": " REG-987654 ",
                "degree": "  Bachelor   of Technology  in Computer Science ",
                "marks": [
                    {
                        "subject_code": " CS101 ",
                        "subject_name": "  Data   Structures ",
                        "marks_obtained": " 88 ",
                        "max_marks": " 100 ",
                        "grade": " A ",
                    },
                    {
                        "subject_code": " cs102 ",
                        "subject_name": " Algorithms ",
                        "marks_obtained": "92",
                        "max_marks": "100",
                        "grade": " A+ ",
                    },
                    {
                        "subject_code": "CS103",
                        "subject_name": " Operating   Systems ",
                        "marks_obtained": "85",
                        "max_marks": "100",
                        "grade": "A",
                    },
                ],
                "cgpa": "8.85",
                "issue_date": "2026-05-15",
                "document_type": doc_type,
                "attributes_json": attrs,
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


class AzureDocumentIntelligenceExtractor(Extractor):
    """Azure Document Intelligence custom model extractor with confidence parsing and fallback."""

    def __init__(
        self,
        endpoint: str,
        api_key: str = "",
        model_id: str = "prebuilt-layout",
        api_version: str = "2024-11-30",
        client_id: str = "",
    ):
        self.endpoint = endpoint.rstrip("/")
        self.api_key = api_key
        self.model_id = model_id or "prebuilt-layout"
        self.api_version = api_version
        self.client_id = client_id

    def _get_auth_headers(self) -> dict[str, str]:
        if self.api_key:
            return {"Ocp-Apim-Subscription-Key": self.api_key}
        try:
            from azure.identity import DefaultAzureCredential
            cred = DefaultAzureCredential(managed_identity_client_id=self.client_id or None)
            token = cred.get_token("https://cognitiveservices.azure.com/.default")
            return {"Authorization": f"Bearer {token.token}"}
        except Exception as e:
            logger.warning("Could not acquire Entra token for Document Intelligence: %s", e)
            return {}

    def extract(self, stream, filename: str) -> ExtractionResult:
        content = stream.read()
        headers = self._get_auth_headers()
        ext = filename.lower().split('.')[-1] if '.' in filename else ''
        ct_map = {
            'pdf': 'application/pdf',
            'png': 'image/png',
            'jpg': 'image/jpeg',
            'jpeg': 'image/jpeg',
            'webp': 'image/webp',
            'bmp': 'image/bmp',
            'tiff': 'image/tiff',
            'tif': 'image/tiff',
        }
        content_type = ct_map.get(ext, 'application/pdf' if ext == 'pdf' else 'application/octet-stream')
        headers["Content-Type"] = content_type

        url = f"{self.endpoint}/documentintelligence/documentModels/{self.model_id}:analyze?api-version={self.api_version}"
        req = urllib.request.Request(url, data=content, headers=headers, method="POST")

        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                operation_url = resp.headers.get("Operation-Location")

            if not operation_url:
                raise RuntimeError("Document Intelligence did not return Operation-Location header")

            # Poll operation
            poll_headers = self._get_auth_headers()
            poll_req = urllib.request.Request(operation_url, headers=poll_headers, method="GET")

            for _ in range(30):
                time.sleep(1.0)
                try:
                    with urllib.request.urlopen(poll_req, timeout=15) as poll_resp:
                        res_body = json.loads(poll_resp.read().decode("utf-8"))
                except Exception as e:
                    logger.warning("Polling Document Intelligence error: %s", e)
                    continue

                status = res_body.get("status")
                if status == "succeeded":
                    return self.parse_analyze_result(res_body.get("analyzeResult", {}), filename=filename)
                elif status == "failed":
                    raise RuntimeError(f"Document Intelligence analysis failed: {res_body.get('error')}")

            raise TimeoutError("Document Intelligence analysis timed out after 30 seconds")
        except Exception as e:
            logger.warning("Document Intelligence API call failed (%s); routing document to review queue with 0.0 confidence", e)
            return ExtractionResult(
                fields={
                    "name": "",
                    "roll_number": "",
                    "register_number": "",
                    "degree": "",
                    "marks": [],
                    "cgpa": "",
                    "issue_date": "",
                    "document_type": "grade_sheet" if filename.lower().endswith(".pdf") else "other",
                    "attributes_json": {"notice": f"Flagged for manual review: {e}"},
                },
                field_confidences={
                    "name": 0.0,
                    "roll_number": 0.0,
                    "register_number": 0.0,
                    "degree": 0.0,
                    "cgpa": 0.0,
                    "issue_date": 0.0,
                },
                marks_confidences=[],
                document_type="grade_sheet" if filename.lower().endswith(".pdf") else "other",
                attributes={"notice": f"Flagged for manual review: {e}"},
            )

    def parse_analyze_result(self, analyze_result: dict[str, Any], filename: str = "") -> ExtractionResult:
        docs = analyze_result.get("documents", [])
        doc = docs[0] if docs else {}
        extracted_fields = doc.get("fields", {})
        content_text = analyze_result.get("content", "")

        # 1. Parse Key-Value Pairs from analyzeResult
        kv_pairs = analyze_result.get("keyValuePairs", [])
        kv_dict = {}
        kv_conf = {}
        for kv in kv_pairs:
            k_obj = kv.get("key", {})
            v_obj = kv.get("value", {})
            k_raw = (k_obj.get("content") or "").strip()
            v_raw = (v_obj.get("content") or "").strip() if v_obj else ""
            conf = float(kv.get("confidence", 0.85))
            if k_raw and v_raw:
                clean_k = k_raw.rstrip(":").strip()
                kv_dict[clean_k.lower()] = (clean_k, v_raw)
                kv_conf[clean_k.lower()] = conf

        def find_kv(aliases: list[str]) -> tuple[str, float]:
            for a in aliases:
                for k_low, (orig_k, val) in kv_dict.items():
                    if a in k_low:
                        return val, kv_conf.get(k_low, 0.85)
            return "", 0.0

        def match_re_field(patterns: list[str]) -> tuple[str, float]:
            if not content_text:
                return "", 0.0
            for p in patterns:
                m = re.search(p, content_text, re.IGNORECASE)
                if m:
                    val = m.group(1).split("\n")[0].strip(" :-\t")
                    if val and len(val) < 100:
                        return val, 0.90
            return "", 0.0

        def unwrap_doc_field(field: Any) -> Any:
            if not isinstance(field, dict):
                return field
            for value_key in ("valueString", "valueNumber", "valueDate", "valueInteger", "valueBoolean", "content"):
                if field.get(value_key) is not None:
                    return field[value_key]
            if field.get("valueArray") is not None:
                return field["valueArray"]
            if field.get("valueObject") is not None:
                return field["valueObject"]
            return ""

        def find_doc_field(aliases: list[str]) -> tuple[Any, float]:
            for alias in aliases:
                for key, field in extracted_fields.items():
                    if alias in re.sub(r"[^a-z0-9]", "", key.lower()):
                        value = unwrap_doc_field(field)
                        if value not in (None, "", []):
                            confidence = float(field.get("confidence", 0.85)) if isinstance(field, dict) else 0.85
                            return value, confidence
            return "", 0.0

        # Extract Name
        name, conf_name = find_kv(["student name", "candidate name", "name of candidate"])
        if not name:
            name, conf_name = find_doc_field(["name", "candidate"])
        if not name:
            re_name, re_c = match_re_field([
                r'(?:Candidate\s+Name|Student\s+Name|Name(?:\s+of\s+Candidate)?)\s*[:\-]\s*([^\n\r]+)',
                r'\bName\s*[:\-]\s*([A-Za-z\s\.]+)'
            ])
            if re_name:
                name, conf_name = re_name, re_c

        # Extract Roll Number (support dots, dashes, slashes, No .:)
        roll_number, conf_roll = find_kv(["roll no", "roll number", "hall ticket", "enrollment no", "roll"])
        if not roll_number:
            roll_number, conf_roll = find_doc_field(["rollnumber", "roll", "hallticket", "enrollment"])
        if not roll_number:
            re_roll, re_c = match_re_field([
                r'(?:Roll\s*(?:No\.?|Number)|Hall\s*Ticket|Enrollment\s*No\.?)\s*[\.:\-]*\s*([A-Za-z0-9\.\-\/]+)'
            ])
            if re_roll:
                roll_number, conf_roll = re_roll, re_c

        # Extract Register Number
        register_number, conf_reg = find_kv(["register no", "registration no", "reg no", "reg. no."])
        if not register_number:
            register_number, conf_reg = find_doc_field(["registernumber", "registrationnumber", "regnumber"])
        if not register_number:
            re_reg, re_c = match_re_field([
                r'(?:Reg(?:ister)?\s*(?:No\.?|Number)|Registration\s*(?:No\.?|Number))\s*[\.:\-]*\s*([A-Za-z0-9\.\-\/]+)',
            ])
            if re_reg:
                register_number, conf_reg = re_reg, re_c
        if (not register_number or len(register_number) < 4) and roll_number:
            register_number = roll_number
            conf_reg = conf_roll

        # Extract Branch / Discipline
        re_branch, _ = match_re_field([
            r'(?:Branch|Discipline|Department)\s*[:\-]\s*([^\n\r]+)'
        ])

        # Extract Degree
        degree, conf_degree = find_kv(["degree", "programme", "course", "qualification"])
        if not degree:
            degree, conf_degree = find_doc_field(["degree", "programme", "course", "qualification"])
        if not degree:
            re_deg, re_c = match_re_field([
                r'\b(Bachelor\s+of\s+Technology|Bachelor\s+of\s+Engineering|Bachelor\s+of\s+Science|Master\s+of\s+Technology|Master\s+of\s+Science|Master\s+of\s+Engineering|Bachelor\s+of\s+[A-Za-z]+|Master\s+of\s+[A-Za-z]+|Doctor\s+of\s+[A-Za-z]+)\b',
                r'\b(B\.?Tech|M\.?Tech|B\.E\.|B\.Sc|M\.Sc|B\.?C\.?A|M\.?C\.?A|B\.?Com|M\.?Com|B\.?B\.?A|M\.?B\.?A)\b',
                r'(?:Degree|Program(?:me)?)\s*[:\-]\s*([^\n\r]+)'
            ])
            if re_deg:
                degree, conf_degree = re_deg, re_c

        # Clean Degree and append Branch if applicable
        if degree:
            degree = re.sub(r'\s+Degree\s+Examinations.*', '', degree, flags=re.IGNORECASE)
            degree = re.sub(r'\s+Examinations.*', '', degree, flags=re.IGNORECASE)
            degree = degree.strip()
            if re_branch and re_branch.lower() not in degree.lower():
                degree = f"{degree} in {re_branch.strip()}"

        # Extract CGPA and SGPA (from tables and text)
        cgpa_val, conf_cgpa = "", 0.0
        sgpa_val, conf_sgpa = "", 0.0

        tables = analyze_result.get("tables", [])
        doc_cgpa, doc_cgpa_conf = find_doc_field(["cgpa", "cumulativegradepointaverage"])
        if doc_cgpa:
            cgpa_val = str(doc_cgpa)
            conf_cgpa = doc_cgpa_conf
        for t in tables:
            rows = t.get("rowCount", 0)
            cols = t.get("columnCount", 0)
            grid = {}
            for c in t.get("cells", []):
                grid[(c.get("rowIndex", 0), c.get("columnIndex", 0))] = c.get("content", "").strip()

            for r in range(rows):
                for c in range(cols):
                    txt = grid.get((r, c), "")
                    if re.fullmatch(r'CGPA', txt, re.IGNORECASE):
                        val_below = grid.get((r + 1, c), "")
                        val_next = grid.get((r, c + 1), "")
                        for v in [val_below, val_next]:
                            m = re.search(r'([0-9]+\.[0-9]+|[0-9]+)', v)
                            if m and not cgpa_val:
                                cgpa_val = m.group(1)
                                conf_cgpa = 0.95
                    if re.fullmatch(r'SGPA', txt, re.IGNORECASE):
                        val_below = grid.get((r + 1, c), "")
                        val_next = grid.get((r, c + 1), "")
                        for v in [val_below, val_next]:
                            m = re.search(r'([0-9]+\.[0-9]+|[0-9]+)', v)
                            if m and not sgpa_val:
                                sgpa_val = m.group(1)
                                conf_sgpa = 0.95

        if not cgpa_val:
            m_cgpa = re.search(r'\bCGPA\b[^\d\n]*\n*[\s:\-]*([0-9]+\.[0-9]+)', content_text, re.IGNORECASE)
            if m_cgpa:
                cgpa_val = m_cgpa.group(1)
                conf_cgpa = 0.90
            else:
                m_cgpa_alt = re.search(r'(?:Cumulative\s*Grade\s*Point\s*Average)[^\d\n]*\n*[\s:\-]*([0-9]+\.[0-9]+)', content_text, re.IGNORECASE)
                if m_cgpa_alt:
                    cgpa_val = m_cgpa_alt.group(1)
                    conf_cgpa = 0.90

        if not sgpa_val:
            m_sgpa = re.search(r'\bSGPA\b[^\d\n]*\n*[\s:\-]*([0-9]+\.[0-9]+)', content_text, re.IGNORECASE)
            if m_sgpa:
                sgpa_val = m_sgpa.group(1)
                conf_sgpa = 0.90

        # Extract Date and normalize to ISO YYYY-MM-DD
        issue_date_val = ""
        conf_date = 0.0

        doc_issue_date, doc_issue_conf = find_doc_field(["issuedate", "dateofissue"])
        if doc_issue_date:
            issue_date_val = str(doc_issue_date)
            conf_date = doc_issue_conf if re.fullmatch(r"\d{4}-\d{2}-\d{2}", issue_date_val) else 0.0

        m_date_text = re.search(r'(?:Date\s+of\s+Issue|Issue\s+Date|Date|Dated)\s*[:\-]\s*([A-Za-z0-9\s,\.\-\/]+)', content_text, re.IGNORECASE)
        if not issue_date_val and m_date_text:
            raw_date_str = m_date_text.group(1).split('\n')[0].strip(' :-\t')
            clean_d = re.sub(r'\s*,\s*', ', ', raw_date_str).strip()
            clean_d = re.sub(r'\s+', ' ', clean_d)

            parsed_iso = None
            for fmt in (
                "%B %d, %Y", "%B %d %Y", "%d %B %Y", "%d %B, %Y",
                "%b %d, %Y", "%b %d %Y", "%d %b %Y", "%d %b, %Y",
                "%Y-%m-%d", "%d-%m-%Y", "%d/%m/%Y", "%m/%d/%Y", "%d.%m.%Y"
            ):
                try:
                    dt = datetime.strptime(clean_d.replace(" ,", ","), fmt)
                    parsed_iso = dt.strftime("%Y-%m-%d")
                    break
                except ValueError:
                    continue

            if parsed_iso:
                issue_date_val = parsed_iso
                conf_date = 0.95
            elif re.match(r'^\d{4}-\d{2}-\d{2}$', raw_date_str):
                issue_date_val = raw_date_str
                conf_date = 0.90

        # Parse Courses / Marks Table dynamically
        marks = []
        marks_confidences = []

        doc_marks, doc_marks_conf = find_doc_field(["marks", "courses", "subjects"])
        if isinstance(doc_marks, list):
            for item in doc_marks:
                values = unwrap_doc_field(item)
                if not isinstance(values, dict):
                    continue

                def nested_value(aliases: list[str]) -> str:
                    for key, field in values.items():
                        normalized_key = re.sub(r"[^a-z0-9]", "", key.lower())
                        if any(alias in normalized_key for alias in aliases):
                            value = unwrap_doc_field(field)
                            if value not in (None, ""):
                                return str(value)
                    return ""

                def nested_confidence(aliases: list[str]) -> float:
                    for key, field in values.items():
                        normalized_key = re.sub(r"[^a-z0-9]", "", key.lower())
                        if any(alias in normalized_key for alias in aliases) and isinstance(field, dict):
                            return float(field.get("confidence", doc_marks_conf))
                    return doc_marks_conf

                marks.append({
                    "subject_code": nested_value(["subjectcode", "coursecode", "code"]),
                    "subject_name": nested_value(["subjectname", "coursename", "title", "name"]),
                    "marks_obtained": nested_value(["marksobtained", "mark", "point"]),
                    "max_marks": nested_value(["maxmarks", "maximum"]),
                    "grade": nested_value(["grade"]),
                })
                marks_confidences.append({
                    "subject_code": marks[-1]["subject_code"],
                    "cells": {
                        "subject_code": doc_marks_conf,
                        "subject_name": nested_confidence(["subjectname", "coursename", "title", "name"]),
                        "marks_obtained": nested_confidence(["marksobtained", "mark", "point"]),
                        "max_marks": nested_confidence(["maxmarks", "maximum"]),
                        "grade": nested_confidence(["grade"]),
                    },
                })

        for t in tables:
            rows = t.get("rowCount", 0)
            cols = t.get("columnCount", 0)
            grid = {}
            for c in t.get("cells", []):
                grid[(c.get("rowIndex", 0), c.get("columnIndex", 0))] = c.get("content", "").strip()

            h_row = 0
            headers = [grid.get((h_row, c), "").lower() for c in range(cols)]
            if not any("code" in h or "course" in h or "subject" in h for h in headers) and rows > 1:
                h_row = 1
                headers = [grid.get((h_row, c), "").lower() for c in range(cols)]

            is_course_table = any("course" in h or "subject" in h or "code" in h for h in headers)
            if any("ratings" in h or "letter grade" in h for h in headers):
                is_course_table = False
            if any("sgpa" in h or "cgpa" in h for h in headers):
                is_course_table = False

            if is_course_table and rows > 1:
                code_col = -1
                title_col = -1
                credit_col = -1
                grade_col = -1
                points_col = -1

                for c_idx, h in enumerate(headers):
                    if "code" in h:
                        code_col = c_idx
                    elif "title" in h or "name" in h or "subject" in h or "course" in h:
                        if title_col == -1: title_col = c_idx
                    elif "credit" in h:
                        credit_col = c_idx
                    elif "grade obtained" in h or (("grade" in h) and "point" not in h):
                        grade_col = c_idx
                    elif "point" in h or "mark" in h:
                        points_col = c_idx

                if code_col == -1: code_col = 0
                if title_col == -1 and cols > 1: title_col = 1
                if grade_col == -1 and cols > 3: grade_col = 3
                if points_col == -1 and cols > 4: points_col = 4
                elif points_col == -1 and cols > 2: points_col = 2

                for r in range(h_row + 1, rows):
                    c_code = grid.get((r, code_col), "")
                    c_title = grid.get((r, title_col), "")
                    c_grade = grid.get((r, grade_col), "") if grade_col >= 0 else ""
                    c_points = grid.get((r, points_col), "") if points_col >= 0 else ""
                    c_credits = grid.get((r, credit_col), "") if credit_col >= 0 else ""

                    if c_code or c_title:
                        marks.append({
                            "subject_code": c_code,
                            "subject_name": c_title,
                            "marks_obtained": c_points or "0",
                            "max_marks": c_credits or "100",
                            "grade": c_grade,
                        })
                        marks_confidences.append({
                            "subject_code": c_code,
                            "cells": {
                                "subject_code": 0.95,
                                "subject_name": 0.95,
                                "marks_obtained": 0.95,
                                "max_marks": 0.95,
                                "grade": 0.95,
                            }
                        })

        # Determine Document Type
        search_blob = f"{content_text} {filename}".lower()
        if "transfer certificate" in search_blob or "college leaving" in search_blob or "transfer" in filename.lower() or "tc" in filename.lower():
            doc_type = "transfer_certificate"
        elif "bonafide certificate" in search_blob or "bonafide" in search_blob:
            doc_type = "bonafide_certificate"
        elif "conduct certificate" in search_blob or "character certificate" in search_blob:
            doc_type = "conduct_certificate"
        elif "provisional" in search_blob:
            doc_type = "provisional_certificate"
        elif "diploma" in search_blob or "degree" in search_blob:
            doc_type = "degree_certificate"
        elif "marks" in search_blob or "grade" in search_blob or "transcript" in search_blob or len(marks) > 0:
            doc_type = "grade_sheet"
        else:
            doc_type = "grade_sheet" if ("cs101" in search_blob or "marks" in extracted_fields) else "general_document"

        # Additional verified attributes
        attributes = {}
        if sgpa_val: attributes["sgpa"] = sgpa_val
        if re_branch: attributes["branch"] = re_branch.strip()
        m_sem = re.search(r'Grade\s*Sheet\s*[:\-]\s*([^\n\r]+)', content_text, re.IGNORECASE)
        if m_sem: attributes["semester"] = m_sem.group(1).strip()
        m_sess = re.search(r'Month\s*&\s*Year\s*of\s*Examinations\s*[:\-]\s*([^\n\r]+)', content_text, re.IGNORECASE)
        if m_sess: attributes["exam_session"] = m_sess.group(1).strip()
        m_sl = re.search(r'(?:S[lI]\.?\s*No\.?)\s*[\.:\-]*\s*([A-Za-z0-9]+)', content_text, re.IGNORECASE)
        m_num = re.search(r'\b(\d{5,8})\b', content_text)
        if m_sl and m_num:
            attributes["serial_no"] = f"{m_sl.group(1)} {m_num.group(1)}"
        elif m_sl:
            attributes["serial_no"] = m_sl.group(1)
        elif m_num:
            attributes["serial_no"] = m_num.group(1)
        field_confidences = {
            "name": conf_name if conf_name > 0 else (0.85 if name else 0.0),
            "roll_number": conf_roll if conf_roll > 0 else (0.85 if roll_number else 0.0),
            "register_number": conf_reg if conf_reg > 0 else (0.85 if register_number else 0.0),
            "degree": conf_degree if conf_degree > 0 else (0.85 if degree else 0.0),
            "cgpa": conf_cgpa if conf_cgpa > 0 else (0.85 if cgpa_val else 0.0),
            "issue_date": conf_date if issue_date_val else 0.0,
        }

        # For non-academic certificates, CGPA/degree are not required
        if doc_type in ("transfer_certificate", "bonafide_certificate", "conduct_certificate"):
            if not degree:
                field_confidences["degree"] = 1.0
            if not cgpa_val:
                field_confidences["cgpa"] = 1.0

        fields = {
            "name": name,
            "roll_number": roll_number,
            "register_number": register_number,
            "degree": degree,
            "marks": marks,
            "cgpa": cgpa_val or None,
            "issue_date": issue_date_val or None,
            "document_type": doc_type,
            "attributes_json": attributes,
        }

        return ExtractionResult(
            fields=fields,
            field_confidences=field_confidences,
            marks_confidences=marks_confidences,
            document_type=doc_type,
            attributes=attributes,
        )


def get_extractor(config: dict[str, Any], use_stub: bool = False, stub_profile: str = "high") -> Extractor:
    """Factory creating Extractor based on config and flags."""
    if use_stub:
        return StubExtractor(profile=stub_profile)

    endpoint = config.get("doc_intelligence_endpoint", "").strip()
    if not endpoint:
        raise RuntimeError(
            "DOC_INTELLIGENCE_ENDPOINT must be configured when the stub extractor is not enabled"
        )

    if endpoint:
        logger.info("Using AzureDocumentIntelligenceExtractor at %s", endpoint)
        return AzureDocumentIntelligenceExtractor(
            endpoint=endpoint,
            api_key=config.get("doc_intelligence_key", ""),
            model_id=config.get("doc_intelligence_model_id", "prebuilt-layout"),
            client_id=config.get("azure_client_id", ""),
        )

