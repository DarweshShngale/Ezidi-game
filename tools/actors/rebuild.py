"""Download pinned CC0 source art into a temporary directory and build both GLBs."""

from hashlib import sha256
import os
from pathlib import Path
import subprocess
import sys
from tempfile import TemporaryDirectory
from urllib.request import urlopen

REVISION = "a8bc2d54ff0ac92e78ff71431b1023eda42bf482"
BASE = f"https://raw.githubusercontent.com/makehumancommunity/makehuman/{REVISION}/makehuman/data/"
TARGET = "targets/macrodetails/"
SOURCES = {
    "base.obj": (
        "3dobjs/base.obj",
        "8e761e6624b8f54536409135d1636da63b32486a90d4897f84e121d144f6fb4c",
    ),
    "male.target": (
        TARGET + "caucasian-male-young.target",
        "70e228ba7164737dae664454394536fc5935fa48d333c1a97d77e2dc6eacc5f5",
    ),
    "female.target": (
        TARGET + "caucasian-female-young.target",
        "118379f6e8ba9266247fdb8788a20e1df40a239f97ced0b9905bcbcc74f6e820",
    ),
    "detail.target": (
        TARGET + "universal-male-young-averagemuscle-averageweight.target",
        "4ba5396ddabda448ece15650a566fbebfbb10239256ccb201e8f883429e12249",
    ),
    "femaledetail.target": (
        TARGET + "universal-female-young-averagemuscle-averageweight.target",
        "4ba5396ddabda448ece15650a566fbebfbb10239256ccb201e8f883429e12249",
    ),
}


def main():
    with TemporaryDirectory(prefix="sinjar-actors-") as temp:
        for name, (path, expected) in SOURCES.items():
            with urlopen(BASE + path, timeout=30) as response:
                data = response.read()
            if sha256(data).hexdigest() != expected:
                raise ValueError(f"Unexpected MakeHuman source checksum for {name}")
            (Path(temp) / name).write_bytes(data)
        for gender in ("male", "female"):
            subprocess.run(
                [sys.executable, str(Path(__file__).resolve().with_name("generate.py"))],
                cwd=temp,
                env={**os.environ, "ACTOR": gender, "PYTHONDONTWRITEBYTECODE": "1"},
                check=True,
            )


if __name__ == "__main__":
    main()
