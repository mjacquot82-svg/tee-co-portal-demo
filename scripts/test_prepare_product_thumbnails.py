"""Offline regression test for the non-destructive thumbnail preparer.

Run: python -m unittest discover -s scripts -p 'test_prepare_product_thumbnails.py'
Requires Pillow.
"""
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

from PIL import Image

MODULE = Path(__file__).with_name("prepare-product-thumbnails.py")
spec = importlib.util.spec_from_file_location("prepare_product_thumbnails", MODULE)
thumbnailer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(thumbnailer)


class ThumbnailPreparationTests(unittest.TestCase):
    def test_original_is_untouched_and_thumbnail_is_small_and_valid(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "original.png"
            Image.new("RGB", (2000, 1200), "red").save(source)
            original_bytes = source.read_bytes()
            manifest = root / "images.json"
            manifest.write_text(json.dumps([{"id": "product-one", "source": str(source)}]))
            output = root / "output"
            thumbnailer.prepare(manifest, output, 480, 78)
            report = json.loads((output / "thumbnail-manifest.json").read_text())
            self.assertEqual(len(report), 1)
            self.assertEqual(source.read_bytes(), original_bytes)
            thumbnail = Path(report[0]["thumbnail"])
            self.assertTrue(thumbnail.exists())
            self.assertLess(thumbnail.stat().st_size, len(original_bytes))
            with Image.open(thumbnail) as image:
                self.assertEqual(image.format, "WEBP")
                self.assertLessEqual(max(image.size), 480)
            with self.assertRaises(FileExistsError):
                thumbnailer.prepare(manifest, output, 480, 78)


if __name__ == "__main__":
    unittest.main()
