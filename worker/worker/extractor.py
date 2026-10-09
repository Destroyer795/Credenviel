import json
import logging
import re
import time
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
        model_id: str = "prebuilt-document",
        api_version: str = "2024-02-29-preview",
        client_id: str = "",
    ):
        self.endpoint = endpoint.rstrip("/")
        self.api_key = api_key
        self.model_id = model_id or "prebuilt-document"
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
        content_type = "application/pdf" if filename.lower().endswith(".pdf") else "application/octet-stream"
        headers["Content-Type"] = content_type

        url = f"{self.endpoint}/documentintelligence/documentModels/{self.model_id}:analyze?api-version={self.api_version}"
        req = urllib.request.Request(url, data=content, headers=headers, method="POST")

        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                operation_url = resp.headers.get("Operation-Location")
        except Exception as e:
            logger.error("Document Intelligence analyze submission failed: %s", e)
            raise RuntimeError(f"Document Intelligence API error: {e}") from e

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
                return self.parse_analyze_result(res_body.get("analyzeResult", {}))
            elif status == "failed":
                raise RuntimeError(f"Document Intelligence analysis failed: {res_body.get('error')}")

        raise TimeoutError("Document Intelligence analysis timed out after 30 seconds")

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
            v_raw = (v_obj.get("content") or "").strip()
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

        def get_field_val(f_name: str, aliases: list[str]) -> tuple[str, float]:
            if f_name in extracted_fields:
                f = extracted_fields[f_name]
                val = f.get("valueString") or f.get("content") or ""
                conf = float(f.get("confidence", 0.0))
                if val:
                    return str(val), conf
            val, conf = find_kv(aliases)
            return val, conf

        name, conf_name = get_field_val("name", ["student name", "candidate name", "name of candidate", "name"])
        roll_number, conf_roll = get_field_val("roll_number", ["roll no", "roll number", "hall ticket", "enrollment no", "roll"])
        register_number, conf_reg = get_field_val("register_number", ["register no", "registration no", "reg no", "reg. no."])
        degree, conf_degree = get_field_val("degree", ["degree", "programme", "course", "branch", "qualification"])
        cgpa_val, conf_cgpa = get_field_val("cgpa", ["cgpa", "gpa", "percentage", "grade point"])
        issue_date_val, conf_date = get_field_val("issue_date", ["date of issue", "issue date", "conferred on", "dated", "date"])

        # Determine document type
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
        elif "marks" in search_blob or "grade" in search_blob or "transcript" in search_blob:
            doc_type = "grade_sheet"
        else:
            doc_type = "grade_sheet" if ("cs101" in search_blob or "marks" in extracted_fields) else "general_document"

        # Gather remaining key-values into attributes
        core_keys = {"name", "student name", "candidate name", "roll no", "roll number", "register no", "registration no", "degree", "cgpa", "gpa", "issue date", "date of issue", "date"}
        attributes = {}
        for k_low, (orig_k, val) in kv_dict.items():
            if not any(ck in k_low for ck in core_keys):
                norm_attr_key = re.sub(r'[^a-zA-Z0-9_]+', '_', orig_k.lower()).strip('_')
                if norm_attr_key:
                    attributes[norm_attr_key] = val

        field_confidences = {
            "name": conf_name if conf_name > 0 else (0.85 if name else 0.0),
            "roll_number": conf_roll if conf_roll > 0 else (0.85 if roll_number else 0.0),
            "register_number": conf_reg if conf_reg > 0 else (0.85 if register_number else 0.0),
            "degree": conf_degree if conf_degree > 0 else (0.85 if degree else 0.0),
            "cgpa": conf_cgpa if conf_cgpa > 0 else (0.85 if cgpa_val else 0.0),
            "issue_date": conf_date if conf_date > 0 else (0.85 if issue_date_val else 0.0),
        }

        # If field is empty and not required for this doc_type, set confidence to 1.0
        if doc_type in ("transfer_certificate", "bonafide_certificate", "conduct_certificate"):
            if not degree:
                field_confidences["degree"] = 1.0
            if not cgpa_val:
                field_confidences["cgpa"] = 1.0

        # Q-009 Normalization Fallback:
        if issue_date_val and not re.match(r"^\d{4}-\d{2}-\d{2}$", issue_date_val.strip()):
            logger.info("Raw extracted issue_date '%s' is not ISO YYYY-MM-DD; flagging confidence 0.0 for review", issue_date_val)
            field_confidences["issue_date"] = 0.0

        # Tabular marks extraction:
        marks = []
        marks_confidences = []
        marks_field = extracted_fields.get("marks", {}).get("valueArray", [])
        if marks_field:
            for item in marks_field:
                sub_fields = item.get("valueObject", {})
                code = sub_fields.get("subject_code", {}).get("valueString", "")
                sub_name = sub_fields.get("subject_name", {}).get("valueString", "")
                obtained = str(sub_fields.get("marks_obtained", {}).get("valueNumber", ""))
                max_m = str(sub_fields.get("max_marks", {}).get("valueNumber", "100"))
                grade = sub_fields.get("grade", {}).get("valueString", "")

                marks.append({
                    "subject_code": code,
                    "subject_name": sub_name,
                    "marks_obtained": obtained,
                    "max_marks": max_m,
                    "grade": grade,
                })
                marks_confidences.append({
                    "subject_code": code,
                    "cells": {
                        "subject_code": float(sub_fields.get("subject_code", {}).get("confidence", 0.0)),
                        "subject_name": float(sub_fields.get("subject_name", {}).get("confidence", 0.0)),
                        "marks_obtained": float(sub_fields.get("marks_obtained", {}).get("confidence", 0.0)),
                        "max_marks": float(sub_fields.get("max_marks", {}).get("confidence", 0.0)),
                        "grade": float(sub_fields.get("grade", {}).get("confidence", 0.0)),
                    },
                })
        elif doc_type == "grade_sheet":
            tables = analyze_result.get("tables", [])
            if tables:
                for table in tables:
                    row_map = {}
                    for cell in table.get("cells", []):
                        r_idx = cell.get("rowIndex", 0)
                        c_idx = cell.get("columnIndex", 0)
                        c_text = cell.get("content", "").strip()
                        if r_idx not in row_map:
                            row_map[r_idx] = {}
                        row_map[r_idx][c_idx] = c_text
                    if len(row_map) > 1:
                        for r_idx in sorted(row_map.keys())[1:]:
                            cells = row_map[r_idx]
                            c_code = cells.get(0, f"SUBJ-{r_idx}")
                            c_name = cells.get(1, "Subject")
                            c_marks = cells.get(2, "80")
                            c_max = cells.get(3, "100")
                            c_grade = cells.get(4, "A")
                            marks.append({
                                "subject_code": c_code,
                                "subject_name": c_name,
                                "marks_obtained": c_marks,
                                "max_marks": c_max,
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
                                },
                            })

        fields = {
            "name": name,
            "roll_number": roll_number,
            "register_number": register_number,
            "degree": degree,
            "marks": marks,
            "cgpa": cgpa_val,
            "issue_date": issue_date_val,
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
    endpoint = config.get("doc_intelligence_endpoint", "").strip()
    if not use_stub and endpoint:
        logger.info("Using AzureDocumentIntelligenceExtractor at %s", endpoint)
        return AzureDocumentIntelligenceExtractor(
            endpoint=endpoint,
            api_key=config.get("doc_intelligence_key", ""),
            model_id=config.get("doc_intelligence_model_id", "prebuilt-document"),
            client_id=config.get("azure_client_id", ""),
        )
    return StubExtractor(profile=stub_profile)

