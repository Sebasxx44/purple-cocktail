"""Build the transparent photograph and dimensioned glTF for each burger layer.

Initial export: pass the seven ImageGen PNG sheets using --sheets. Subsequent
geometry builds use the committed 4K masters. Requires NumPy and Pillow.
"""

import argparse
import json
from pathlib import Path

import numpy as np
from PIL import Image

from export_products import OUT, isolated, scaled


HERE = Path(__file__).resolve().parent
PROVENANCE = HERE / "capas-hamburguesa-procedencia.json"
DEST = OUT / "burger-layers"
URL = "/showcase/burger-layers"


def portions(path, count):
    with Image.open(path) as sheet:
        rgba = sheet.convert("RGBA")
    active = (np.asarray(rgba.getchannel("A")) > 100).any(axis=1)
    edges = np.flatnonzero(np.diff(np.r_[False, active, False]))
    runs = [(int(a), int(b)) for a, b in zip(edges[::2], edges[1::2]) if b - a > 20]
    if len(runs) != count:
        raise ValueError(f"{path}: expected {count} separate rows, found {runs}")
    for top, bottom in runs:
        window = rgba.crop((0, max(top - 10, 0), rgba.width, min(bottom + 10, rgba.height)))
        piece = isolated(window)
        piece.putalpha(piece.getchannel("A").point(lambda value: 255 if value >= 250 else value))
        yield piece


def responsive(slug, photo):
    scaled(photo, 3840).save(DEST / "masters" / f"{slug}.webp", "WEBP", quality=87, method=4)
    scaled(photo, 900).save(DEST / f"{slug}.webp", "WEBP", quality=92, method=5)
    scaled(photo, 240).save(DEST / f"{slug}-sm.webp", "WEBP", quality=88, method=5)


def generate(spec, sheets, mode, only):
    if mode != "photos":
        from burger_layer_models import make_mesh
    path = DEST / "manifest.json"
    manifest = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}
    for group, sheet in spec["sheets"].items():
        slugs = sheet["pieces"]
        if only and not any(slug in only for slug in slugs):
            continue
        crops = list(portions(sheets / f"{group}.png", len(slugs))) if sheets else [None] * len(slugs)
        for slug, photo in zip(slugs, crops):
            if only and slug not in only:
                continue
            notes = spec["pieces"][slug]
            if mode != "models" and photo is not None:
                responsive(slug, photo)
            if photo is None:
                with Image.open(DEST / "masters" / f"{slug}.webp") as shipped:
                    photo = scaled(shipped.convert("RGBA"), 1000)
            entry = dict(notes)
            entry.update(image=f"{URL}/{slug}.webp", imageSmall=f"{URL}/{slug}-sm.webp",
                         model=f"{URL}/{slug}.glb", master=f"{URL}/masters/{slug}.webp",
                         modelCentered=True, viewPitch=12, maxYaw=26, maxPitch=12)
            if mode == "photos":
                entry["height"] = manifest.get(slug, {}).get("height", round(notes["width"] * photo.height / photo.width, 5))
            else:
                entry["height"] = make_mesh(photo, slug, notes, DEST / f"{slug}.glb")
            if slug == "serving-bowl":
                entry["edible"] = False
            manifest[slug] = entry
            print(slug, f'{entry["width"]} × {entry["height"]} × {entry["depth"]}', flush=True)
    manifest = {slug: manifest[slug] for slug in spec["pieces"] if slug in manifest}
    path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--sheets", type=Path, help="The seven original three-row RGBA sheets")
    parser.add_argument("--mode", choices=("all", "photos", "models"), default="all")
    parser.add_argument("--only", nargs="+", help="Regenerate selected layer keys")
    args = parser.parse_args()
    (DEST / "masters").mkdir(parents=True, exist_ok=True)
    generate(json.loads(PROVENANCE.read_text(encoding="utf-8")), args.sheets, args.mode, args.only)


if __name__ == "__main__":
    main()
