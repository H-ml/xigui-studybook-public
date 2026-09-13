#!/usr/bin/env python3
"""Render a textbook PDF into small WebP page assets for the study viewer."""

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import subprocess
import tempfile
from datetime import datetime, timezone
from pathlib import Path

from PIL import Image


def file_sha256(source: Path) -> str:
    digest = hashlib.sha256()
    with source.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def main() -> None:
    parser = argparse.ArgumentParser(description="把一本通 PDF 渲染为按页 WebP 资源")
    parser.add_argument("source", type=Path, help="源 PDF")
    parser.add_argument("output", type=Path, help="页面输出目录")
    parser.add_argument("--dpi", type=int, default=120)
    parser.add_argument("--quality", type=int, default=84)
    args = parser.parse_args()

    source = args.source.expanduser().resolve()
    output = args.output.expanduser().resolve()
    if not source.is_file():
        raise SystemExit(f"找不到源 PDF：{source}")
    renderer = shutil.which("pdftoppm")
    if not renderer:
        raise SystemExit("找不到 pdftoppm，请先安装 Poppler")
    output.mkdir(parents=True, exist_ok=True)

    with tempfile.TemporaryDirectory(prefix="xigui-textbook-") as temporary:
        prefix = Path(temporary) / "page"
        completed = subprocess.run(
            [renderer, "-jpeg", "-r", str(args.dpi), "-jpegopt", "quality=90", str(source), str(prefix)],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.PIPE,
            text=True,
        )
        if completed.returncode:
            raise SystemExit(completed.stderr.strip() or f"pdftoppm 退出码：{completed.returncode}")
        rendered = sorted(Path(temporary).glob("page-*.jpg"))
        if not rendered:
            raise SystemExit("PDF 未生成任何页面")

        total_bytes = 0
        dimensions: tuple[int, int] | None = None
        for index, jpeg in enumerate(rendered, start=1):
            destination = output / f"page-{index:04d}.webp"
            temporary_destination = destination.with_suffix(".webp.tmp")
            with Image.open(jpeg) as image:
                rgb = image.convert("RGB")
                dimensions = dimensions or rgb.size
                rgb.save(temporary_destination, format="WEBP", quality=args.quality, method=6)
            temporary_destination.replace(destination)
            total_bytes += destination.stat().st_size
            if index == 1 or index % 25 == 0 or index == len(rendered):
                print(f"已生成 {index}/{len(rendered)} 页")

    manifest = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "sourceFilename": source.name,
        "sourceSize": source.stat().st_size,
        "sourceSha256": file_sha256(source),
        "pages": len(rendered),
        "dpi": args.dpi,
        "quality": args.quality,
        "format": "webp",
        "dimensions": {"width": dimensions[0], "height": dimensions[1]} if dimensions else None,
        "totalBytes": total_bytes,
    }
    (output / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(manifest, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
