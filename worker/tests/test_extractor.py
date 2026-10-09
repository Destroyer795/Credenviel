"""Unit tests for Extractor implementations and Document Intelligence parsing."""

import io
import pytest

from worker.confidence import evaluate_confidence
from worker.extractor import (
    AzureDocumentIntelligenceExtractor,
    ExtractionResult,
    StubExtractor,
    get_extractor,
)


def test_get_extractor_stub():
    """Verify get_extractor returns StubExtractor when requested."""
    cfg = {"doc_intelligence_endpoint": "https://test.cognitiveservices.azure.com"}
    ext = get_extractor(cfg, use_stub=True, stub_profile="low")
    assert isinstance(ext, StubExtractor)
    assert ext.profile == "low"

    cfg_empty = {"doc_intelligence_endpoint": ""}
    with pytest.raises(RuntimeError, match="DOC_INTELLIGENCE_ENDPOINT"):
        get_extractor(cfg_empty, use_stub=False)


def test_get_extractor_azure():
    """Verify get_extractor returns AzureDocumentIntelligenceExtractor when endpoint is configured."""
    cfg = {
        "doc_intelligence_endpoint": "https://credenviel-docintel.cognitiveservices.azure.com",
        "doc_intelligence_key": "dummy-key",
        "doc_intelligence_model_id": "custom-cert-model",
    }
    ext = get_extractor(cfg, use_stub=False)
    assert isinstance(ext, AzureDocumentIntelligenceExtractor)
    assert ext.endpoint == "https://credenviel-docintel.cognitiveservices.azure.com"
    assert ext.model_id == "custom-cert-model"


def test_doc_intelligence_parse_analyze_result():
    """Verify parsing Document Intelligence analyzeResult with structured fields and marks."""
    extractor = AzureDocumentIntelligenceExtractor(endpoint="https://test.cognitiveservices.azure.com")

    mock_analyze_result = {
        "documents": [
            {
                "fields": {
                    "name": {"valueString": "Jane Doe", "confidence": 0.98},
                    "roll_number": {"valueString": "CS2026-001", "confidence": 0.97},
                    "register_number": {"valueString": "REG-987654", "confidence": 0.95},
                    "degree": {"valueString": "Bachelor of Technology", "confidence": 0.96},
                    "cgpa": {"valueString": "8.85", "confidence": 0.94},
                    "issue_date": {"valueString": "2026-05-15", "confidence": 0.99},
                    "marks": {
                        "valueArray": [
                            {
                                "valueObject": {
                                    "subject_code": {"valueString": "CS101", "confidence": 0.99},
                                    "subject_name": {"valueString": "Data Structures", "confidence": 0.96},
                                    "marks_obtained": {"valueNumber": 88, "confidence": 0.95},
                                    "max_marks": {"valueNumber": 100, "confidence": 0.99},
                                    "grade": {"valueString": "A", "confidence": 0.97},
                                }
                            },
                            {
                                "valueObject": {
                                    "subject_code": {"valueString": "CS102", "confidence": 0.99},
                                    "subject_name": {"valueString": "Algorithms", "confidence": 0.98},
                                    "marks_obtained": {"valueNumber": 92, "confidence": 0.97},
                                    "max_marks": {"valueNumber": 100, "confidence": 0.99},
                                    "grade": {"valueString": "A+", "confidence": 0.96},
                                }
                            },
                        ]
                    },
                }
            }
        ]
    }

    result = extractor.parse_analyze_result(mock_analyze_result)
    assert result.fields["name"] == "Jane Doe"
    assert result.fields["roll_number"] == "CS2026-001"
    assert result.fields["cgpa"] == "8.85"
    assert result.fields["issue_date"] == "2026-05-15"
    assert len(result.fields["marks"]) == 2
    assert result.fields["marks"][0]["subject_code"] == "CS101"
    assert result.fields["marks"][0]["marks_obtained"] == "88"

    passed, conf_json = evaluate_confidence(result.field_confidences, result.marks_confidences, threshold=0.85)
    assert passed is True
    assert len(conf_json["below_threshold"]) == 0


def test_doc_intelligence_normalization_fallback_non_iso_date():
    """Verify Q-009 fallback: non-ISO date retains raw text and marks confidence 0.0 for review routing."""
    extractor = AzureDocumentIntelligenceExtractor(endpoint="https://test.cognitiveservices.azure.com")

    mock_analyze_result = {
        "documents": [
            {
                "fields": {
                    "name": {"valueString": "Bob Martin", "confidence": 0.95},
                    "roll_number": {"valueString": "EE-01", "confidence": 0.92},
                    "register_number": {"valueString": "REG-01", "confidence": 0.93},
                    "degree": {"valueString": "B.Tech Electrical", "confidence": 0.94},
                    "cgpa": {"valueString": "3.80", "confidence": 0.91},
                    "issue_date": {"valueString": "15th May 2026", "confidence": 0.95},  # Non-ISO date!
                }
            }
        ]
    }

    result = extractor.parse_analyze_result(mock_analyze_result)
    assert result.fields["issue_date"] == "15th May 2026"
    assert result.field_confidences["issue_date"] == 0.0  # Flagged 0.0!

    passed, conf_json = evaluate_confidence(result.field_confidences, result.marks_confidences, threshold=0.85)
    assert passed is False  # Routes to needs_review!
    assert any(b["name"] == "issue_date" and b["score"] == 0.0 for b in conf_json["below_threshold"])


def test_doc_intelligence_low_marks_cell_routing():
    """Verify Q-008: a single sub-threshold cell in tabular marks flags job for review."""
    extractor = AzureDocumentIntelligenceExtractor(endpoint="https://test.cognitiveservices.azure.com")

    mock_analyze_result = {
        "documents": [
            {
                "fields": {
                    "name": {"valueString": "Charlie Brown", "confidence": 0.96},
                    "roll_number": {"valueString": "ME-01", "confidence": 0.95},
                    "register_number": {"valueString": "REG-02", "confidence": 0.94},
                    "degree": {"valueString": "Mechanical Engineering", "confidence": 0.97},
                    "cgpa": {"valueString": "3.5", "confidence": 0.92},
                    "issue_date": {"valueString": "2026-06-01", "confidence": 0.98},
                    "marks": {
                        "valueArray": [
                            {
                                "valueObject": {
                                    "subject_code": {"valueString": "ME101", "confidence": 0.99},
                                    "subject_name": {"valueString": "Thermodynamics", "confidence": 0.95},
                                    "marks_obtained": {"valueNumber": 72, "confidence": 0.94},
                                    "max_marks": {"valueNumber": 100, "confidence": 0.99},
                                    "grade": {"valueString": "B", "confidence": 0.42},  # Low cell!
                                }
                            }
                        ]
                    },
                }
            }
        ]
    }

    result = extractor.parse_analyze_result(mock_analyze_result)
    passed, conf_json = evaluate_confidence(result.field_confidences, result.marks_confidences, threshold=0.85)
    assert passed is False
    assert len(conf_json["below_threshold"]) == 1
    assert conf_json["below_threshold"][0]["type"] == "marks_cell"
    assert conf_json["below_threshold"][0]["cell"] == "grade"
    assert conf_json["below_threshold"][0]["score"] == 0.42
