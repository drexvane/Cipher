"""NVIDIA NIM adapter tests use a mocked stdlib HTTP boundary only."""

from __future__ import annotations

import json

import pytest

from dtp.agent import client


class _Response:
    def __init__(self, payload: dict):
        self.payload = payload

    def read(self) -> bytes:
        return json.dumps(self.payload).encode("utf-8")

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False


def test_nvidia_defaults_and_explicit_selection(monkeypatch):
    monkeypatch.setenv("DTP_AGENT_PROVIDER", "nvidia")
    monkeypatch.setenv("NVIDIA_API_KEY", "test-key")
    monkeypatch.delenv("NVIDIA_MODEL", raising=False)
    monkeypatch.delenv("NVIDIA_BASE_URL", raising=False)

    model = client.select_model()

    assert isinstance(model, client.NvidiaNimModel)
    assert model.model == "nvidia/nemotron-3-ultra-550b-a55b"
    assert model.name == "nvidia-nvidia/nemotron-3-ultra-550b-a55b"


def test_nvidia_requires_local_key(monkeypatch):
    monkeypatch.setenv("DTP_AGENT_PROVIDER", "nvidia")
    monkeypatch.delenv("NVIDIA_API_KEY", raising=False)

    with pytest.raises(RuntimeError, match="NVIDIA_API_KEY"):
        client.select_model()


def test_unknown_provider_is_rejected(monkeypatch):
    monkeypatch.setenv("DTP_AGENT_PROVIDER", "not-a-provider")

    with pytest.raises(RuntimeError, match="DTP_AGENT_PROVIDER"):
        client.select_model()


def test_nvidia_translates_openai_compatible_tool_call(monkeypatch):
    captured: dict = {}

    def fake_urlopen(request, timeout):
        captured["url"] = request.full_url
        captured["timeout"] = timeout
        captured["body"] = json.loads(request.data.decode("utf-8"))
        return _Response({"choices": [{"message": {"content": "", "tool_calls": [{"function": {"name": "query_data", "arguments": '{"metrics":["row_count"]}'}}]}}]})

    monkeypatch.setattr("urllib.request.urlopen", fake_urlopen)
    model = client.NvidiaNimModel(key="test-key", base_url="https://nim.example/v1", model="test-model")
    reply = model.respond(
        "system instructions", "count rows",
        tools=[{"name": "query_data", "description": "Run a checked query", "input_schema": {"type": "object", "properties": {"metrics": {"type": "array"}}}}],
    )

    assert captured["url"] == "https://nim.example/v1/chat/completions"
    assert captured["timeout"] == 60
    assert captured["body"]["model"] == "test-model"
    assert captured["body"]["tools"][0]["function"]["name"] == "query_data"
    assert captured["body"]["tool_choice"] == "auto"
    assert reply.tool_call == client.ToolCall(name="query_data", input={"metrics": ["row_count"]})
    assert all("test-key" not in str(value) for value in captured.values())


def test_nvidia_returns_plain_text_and_handles_bad_payload(monkeypatch):
    model = client.NvidiaNimModel(key="test-key", base_url="https://nim.example/v1")

    monkeypatch.setattr(
        "urllib.request.urlopen",
        lambda *_args, **_kwargs: _Response({"choices": [{"message": {"content": "A grounded summary."}}]}),
    )
    assert model.respond("system", "question").text == "A grounded summary."

    monkeypatch.setattr("urllib.request.urlopen", lambda *_args, **_kwargs: _Response({"choices": []}))
    assert model.respond("system", "question").text == ""
