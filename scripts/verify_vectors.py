#!/usr/bin/env python3
"""Verify all test vectors in shared/test-vectors/fields_hash.json against system sha256sum.

Per spec Change F:
For EVERY vector, writes the canonical string's exact UTF-8 bytes to a temp file and runs
the system sha256sum binary on it, comparing to the expected hash in fields_hash.json.
This script MUST NOT import the normalizer.
"""

import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile

REPO_ROOT = Path(__file__).resolve().parent.parent
VECTORS_FILE = REPO_ROOT / "shared" / "test-vectors" / "fields_hash.json"


def find_sha256sum() -> str:
    # 1. Look up sha256sum on system PATH first (Linux/macOS or Windows with coreutils on PATH)
    binary = shutil.which("sha256sum")
    if binary:
        return binary

    # 2. Derive from git.exe on PATH (handles any custom drive, Scoop, or custom install folder)
    git_exe = shutil.which("git")
    if git_exe:
        derived = Path(git_exe).resolve().parent.parent / "usr" / "bin" / "sha256sum.exe"
        if derived.exists():
            return str(derived)

    # 3. Fall back to Git usr/bin candidate paths on Windows via environment variables
    for env_var in ("ProgramFiles", "ProgramFiles(x86)", "LOCALAPPDATA"):
        base = os.environ.get(env_var)
        if base:
            for sub in (Path("Git") / "usr" / "bin" / "sha256sum.exe", Path("Programs") / "Git" / "usr" / "bin" / "sha256sum.exe"):
                candidate = Path(base) / sub
                if candidate.exists():
                    return str(candidate)

    raise FileNotFoundError("Could not find system 'sha256sum' executable on PATH or in Git installation")


def main() -> int:
    sha256sum_bin = find_sha256sum()
    print(f"Using sha256sum binary: {sha256sum_bin}")
    print(f"Loading vectors from:   {VECTORS_FILE}\n")

    with open(VECTORS_FILE, "r", encoding="utf-8") as f:
        vectors = json.load(f)

    all_passed = True
    temp_dir = Path(tempfile.mkdtemp(prefix="credenviel_vector_verify_"))

    try:
        for idx, vec in enumerate(vectors, 1):
            vec_id = vec.get("id", f"case_{idx:02d}")
            canonical_json = vec["canonical_json"]
            expected_hash = vec["expected_hash"]

            temp_file = temp_dir / f"{vec_id}.json"
            temp_file.write_bytes(canonical_json.encode("utf-8"))

            proc = subprocess.run(
                [sha256sum_bin, str(temp_file)],
                capture_output=True,
                text=True,
                check=False,
            )

            if proc.returncode != 0:
                print(f"[{idx:02d}/13] FAIL {vec_id}: sha256sum failed with code {proc.returncode}")
                print(proc.stderr)
                all_passed = False
                continue

            # Output is format: "<hash>  <filename>" (or "\<hash>  <escaped_filename>" on Windows paths)
            computed_hash = proc.stdout.strip().lstrip("\\").split()[0].lower()

            if computed_hash == expected_hash.lower():
                print(f"[{idx:02d}/13] PASS {vec_id}")
                print(f"         Expected: {expected_hash}")
                print(f"         Computed: {computed_hash}")
            else:
                print(f"[{idx:02d}/13] FAIL {vec_id}: HASH MISMATCH")
                print(f"         Expected: {expected_hash}")
                print(f"         Computed: {computed_hash}")
                all_passed = False

    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)

    if all_passed:
        print("\nAll 13 test vectors verified independently with system sha256sum!")
        return 0
    else:
        print("\nVector verification failed!")
        return 1


if __name__ == "__main__":
    sys.exit(main())
