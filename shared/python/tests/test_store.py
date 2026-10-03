"""Unit tests for LocalFileStore."""

import io
from pathlib import Path
import pytest
from credenviel_shared.store import LocalFileStore


@pytest.fixture
def store(tmp_path):
    return LocalFileStore(root=tmp_path)


def test_put_and_exists_and_size_and_open(store):
    data = b"Hello, Credenviel Storage!"
    key = "raw-uploads/job-123/cert.pdf"

    assert not store.exists(key)
    store.put(key, data)

    assert store.exists(key)
    assert store.size(key) == len(data)

    with store.open(key) as f:
        assert f.read() == data


def test_put_stream(store):
    stream = io.BytesIO(b"Streaming data contents")
    key = "folder/stream.bin"

    store.put(key, stream)
    assert store.exists(key)
    with store.open(key) as f:
        assert f.read() == b"Streaming data contents"


def test_put_overwrites_atomically(store):
    key = "atomic/file.txt"
    store.put(key, b"version 1")
    assert store.size(key) == 9

    store.put(key, b"version 2 updated")
    with store.open(key) as f:
        assert f.read() == b"version 2 updated"


def test_missing_key_raises(store):
    assert not store.exists("nonexistent.pdf")
    with pytest.raises(FileNotFoundError):
        store.size("nonexistent.pdf")
    with pytest.raises(FileNotFoundError):
        store.open("nonexistent.pdf")


def test_path_traversal_rejection(store):
    bad_keys = [
        "../outside.txt",
        "../../etc/passwd",
        "..\\..\\windows\\system32",
        "sub/../../outside.txt",
        "/etc/passwd",
        "C:/Windows/System32",
        "",
    ]
    for key in bad_keys:
        with pytest.raises(ValueError):
            store._resolve(key)

        with pytest.raises(ValueError):
            store.put(key, b"bad")

        assert not store.exists(key)


def test_list_keys(store):
    store.put("a/1.pdf", b"1")
    store.put("a/2.pdf", b"2")
    store.put("b/3.pdf", b"3")

    all_keys = store.list_keys()
    assert all_keys == ["a/1.pdf", "a/2.pdf", "b/3.pdf"]

    a_keys = store.list_keys("a")
    assert a_keys == ["a/1.pdf", "a/2.pdf"]

    b_keys = store.list_keys("b")
    assert b_keys == ["b/3.pdf"]

    empty_keys = store.list_keys("nonexistent")
    assert empty_keys == []
