#!/usr/bin/env python3
"""Prepare small WebP storefront thumbnails from locally exported product images.

Read-only with respect to Supabase. Does not upload, update product records, or
remove originals. Requires Pillow: python -m pip install Pillow

Input manifest JSON: [{"id":"product-uuid","source":"/path/to/original.png"}, ...]
Usage: python scripts/prepare-product-thumbnails.py --manifest images.json --output-dir thumbnails
"""
import argparse
import hashlib
import json
from pathlib import Path
from PIL import Image, ImageOps

def prepare(manifest_path: Path, output_dir: Path, max_edge: int, quality: int):
    records = json.loads(manifest_path.read_text(encoding="utf-8"))
    if not isinstance(records, list):
        raise ValueError("Manifest must be an array")
    output_dir.mkdir(parents=True, exist_ok=True)
    report = []
    for record in records:
        product_id = str(record["id"])
        source = Path(record["source"]).resolve()
        if not source.is_file():
            raise FileNotFoundError(source)
        with Image.open(source) as original:
            original.verify()
        with Image.open(source) as original:
            image = ImageOps.exif_transpose(original)
            image.thumbnail((max_edge, max_edge), Image.Resampling.LANCZOS)
            if image.mode not in ("RGB", "RGBA"):
                image = image.convert("RGBA" if "A" in image.getbands() else "RGB")
            digest = hashlib.sha256(source.read_bytes()).hexdigest()[:16]
            safe_id = "".join(c for c in product_id if c.isalnum() or c in "-_")[:80]
            target = output_dir / f"{safe_id}-{digest}.webp"
            if target.exists():
                raise FileExistsError(f"Refusing to overwrite {target}")
            image.save(target, format="WEBP", quality=quality, method=6)
            with Image.open(target) as check:
                check.verify()
            report.append({
                "id": product_id, "source": str(source), "thumbnail": str(target),
                "original_bytes": source.stat().st_size, "thumbnail_bytes": target.stat().st_size,
                "width": image.width, "height": image.height,
                "sha256_original": hashlib.sha256(source.read_bytes()).hexdigest(),
                "sha256_thumbnail": hashlib.sha256(target.read_bytes()).hexdigest(),
            })
    report_path = output_dir / "thumbnail-manifest.json"
    if report_path.exists():
        raise FileExistsError(f"Refusing to overwrite {report_path}")
    report_path.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps({"processed": len(report), "manifest": str(report_path),
        "original_bytes": sum(x["original_bytes"] for x in report),
        "thumbnail_bytes": sum(x["thumbnail_bytes"] for x in report)}, indent=2))

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--max-edge", type=int, default=480)
    parser.add_argument("--quality", type=int, default=78)
    args = parser.parse_args()
    if not 100 <= args.max_edge <= 1600 or not 1 <= args.quality <= 100:
        parser.error("max-edge must be 100..1600 and quality must be 1..100")
    prepare(args.manifest, args.output_dir, args.max_edge, args.quality)
