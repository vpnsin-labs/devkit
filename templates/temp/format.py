"""Scratch — edit freely. `temp/` is git-ignored.

Run: python temp/format.py   (or: uv run temp/format.py)
"""

import json
import os
import urllib.request

BASE = os.environ.get("BASE_URL", "http://localhost:8000")

with urllib.request.urlopen(f"{BASE}/health") as res:
    print(json.dumps(json.load(res), indent=2))
