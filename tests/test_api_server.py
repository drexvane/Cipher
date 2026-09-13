"""Automated verification suite for the Cipher FastAPI backend and web server.

Tests:
- API status & schema discovery endpoint
- Dynamic prompt generation
- In-memory zero-hallucination OLAP query execution (/api/ask)
- Single and multi-file CSV ingestion (/api/upload)
- Executive reports and data export endpoints (/api/export)
- Reset conversation memory (/api/reset)
"""

from pathlib import Path
import pytest
from fastapi.testclient import TestClient

from dtp.api.server import app, state

client = TestClient(app)
SAMPLE_CSV = Path(__file__).resolve().parents[1] / "data" / "sample_datasets" / "ecommerce_orders.csv"
EDUCATION_CSV = Path(__file__).resolve().parents[1] / "data" / "sample_datasets" / "education_students.csv"


@pytest.fixture(autouse=True)
def clean_catalog():
    yield
    from dtp import metrics as M
    M.set_active_catalog(None)


def test_api_status_endpoint():
    response = client.get("/api/status")
    assert response.status_code == 200
    data = response.json()
    assert "dataset_name" in data
    assert data["row_count"] > 0
    assert data["col_count"] > 0
    assert 0 <= data["quality_score"] <= 100.0
    assert len(data["starter_prompts"]) > 0


def test_api_prompts_endpoint():
    response = client.get("/api/prompts")
    assert response.status_code == 200
    data = response.json()
    assert "prompts" in data
    assert isinstance(data["prompts"], list)
    assert len(data["prompts"]) > 0


def test_api_ask_natural_query():
    # Ask deterministic query
    payload = {"question": "total failed logins by department"}
    response = client.post("/api/ask", json=payload)
    assert response.status_code == 200
    data = response.json()

    assert data["ok"] is True
    assert data["summary"]
    assert len(data["tiles"]) > 0
    assert data["figure"] is not None
    assert "data" in data["figure"]
    assert "layout" in data["figure"]
    assert len(data["columns"]) >= 2
    assert len(data["records"]) > 0
    assert "plan" in data
    assert len(data["follow_ups"]) > 0


def test_api_sessions_endpoint_tracks_and_reset_turns():
    client.post("/api/reset")
    initial = client.get("/api/sessions")
    assert initial.status_code == 200
    assert initial.json()["sessions"] == []

    response = client.post("/api/ask", json={"question": "total failed logins by department"})
    assert response.status_code == 200
    sessions = client.get("/api/sessions").json()["sessions"]
    assert len(sessions) == 1
    assert sessions[0]["subject"] == "Total failed logins by department"
    assert len(sessions[0]["subject"]) <= 56
    assert sessions[0]["time"]
    assert sessions[0]["status"] == "ready"

    client.post("/api/reset")
    assert client.get("/api/sessions").json()["sessions"] == []


def test_api_upload_csv_dataset_persists_to_workspace():
    assert EDUCATION_CSV.exists()
    with open(EDUCATION_CSV, "rb") as f:
        files = [("files", ("education_students.csv", f.read(), "text/csv"))]
        response = client.post("/api/upload", files=files)

    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert data["dataset_name"] == "education_students.csv"
    assert data["file_path"] == "data/raw/education_students.csv"
    assert data["row_count"] == 395
    assert data["col_count"] >= 30
    assert len(data["profile"]["measures"]) > 0
    assert len(data["profile"]["dimensions"]) > 0

    workspace_file = client.get("/api/workspace/file", params={"path": data["file_path"]})
    assert workspace_file.status_code == 200
    assert workspace_file.json()["content"] == EDUCATION_CSV.read_text(encoding="utf-8")


def test_api_export_endpoints_after_query():
    # Execute query first
    client.post("/api/ask", json={"question": "total failures by school"})

    # Markdown report export
    md_res = client.get("/api/export/markdown")
    assert md_res.status_code == 200
    assert "# ✦ Cipher Executive Data Intelligence Report" in md_res.text

    # Standalone HTML report export
    html_res = client.get("/api/export/html")
    assert html_res.status_code == 200
    assert "<!DOCTYPE html>" in html_res.text
    assert "Cipher Intelligence Report" in html_res.text

    # CSV export
    csv_res = client.get("/api/export/csv")
    assert csv_res.status_code == 200
    assert len(csv_res.content) > 0


def test_api_workspace_tree_and_text_file_preview():
    response = client.get("/api/workspace/tree")
    assert response.status_code == 200
    tree = response.json()["tree"]
    assert tree[0]["type"] == "directory"
    assert tree[0]["path"] == "."
    assert tree[0]["children"]
    root_children = tree[0]["children"]
    first_file_index = next(index for index, item in enumerate(root_children) if item["type"] == "file")
    assert all(item["type"] == "directory" for item in root_children[:first_file_index])

    file_response = client.get("/api/workspace/file", params={"path": "pyproject.toml"})
    assert file_response.status_code == 200
    file_data = file_response.json()
    assert file_data["path"] == "pyproject.toml"
    assert file_data["extension"] == ".toml"
    assert file_data["lines_count"] > 0
    assert "project" in file_data["content"]


def test_api_workspace_file_rejects_missing_and_outside_paths():
    missing = client.get("/api/workspace/file", params={"path": "does-not-exist.txt"})
    assert missing.status_code == 404

    outside = client.get("/api/workspace/file", params={"path": "../../outside.txt"})
    assert outside.status_code == 404


def test_api_reset_session():
    response = client.post("/api/reset")
    assert response.status_code == 200
    assert response.json()["ok"] is True
