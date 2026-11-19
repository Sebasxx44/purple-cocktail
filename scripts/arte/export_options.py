"""Export the eight single-ingredient product configurator illustrations.

Supply original generated cutouts with --native and the two existing studio
ingredients with --shared. Without sources, the published masters regenerate
the responsive images, meshes and download bundle.
"""

import argparse
import hashlib
import json
import zipfile
from pathlib import Path

from PIL import Image

from export_ingredients import PROFILES, relief_model
from export_products import OUT, isolated, scaled


HERE = Path(__file__).resolve().parent
SOURCE_NOTES = HERE / "opciones-procedencia.json"
OPTIONS = OUT / "options"
ROUTE = "/showcase/options"


def write_json(path, data):
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def digest(path):
    with path.open("rb") as file:
        return hashlib.file_digest(file, "sha256").hexdigest()


def read_piece(slug, definition, native, shared, master):
    source = None
    ingredient = definition.get("reuseIngredient")
    if ingredient and shared:
        source = shared / f"{ingredient}.png"
    elif native and not ingredient:
        source = native / f"{slug}.png"
    if source and source.is_file():
        with Image.open(source) as original:
            size = list(original.size)
            piece = isolated(original)
        # Generated masks sometimes stop at 254, including on opaque material.
        piece.putalpha(piece.getchannel("A").point(lambda a: 255 if a >= 250 else a))
        scaled(piece, 3840).save(master, "PNG", compress_level=7)
        return piece, size, digest(source)
    if not master.is_file():
        raise FileNotFoundError(f"Provide a native cutout for {slug}, or its published 4K master.")
    with Image.open(master) as existing:
        piece = existing.copy()
    measured = definition.get("export", {})
    return piece, measured.get("sourceSize"), measured.get("sourceSha256")


def verify_alpha(path, expected_edge):
    with Image.open(path) as image:
        if image.mode != "RGBA" or max(image.size) != expected_edge:
            raise ValueError(f"Incorrect format or resolution in {path}: {image.mode}, {image.size}")
        alpha = image.getchannel("A")
        if alpha.getextrema() != (0, 255):
            raise ValueError(f"Incorrect alpha range in {path}")
        bounds = alpha.point(lambda a: 255 if a > 60 else 0).getbbox()
        if not bounds or min(bounds[:2]) < 1 or bounds[2] >= image.width or bounds[3] >= image.height:
            raise ValueError(f"Cut-off silhouette in {path}: {bounds}")
        return list(image.size)


def make_entry(slug, definition, native, shared):
    master = OPTIONS / "masters" / f"{slug}.png"
    image = OPTIONS / f"{slug}.webp"
    small = OPTIONS / f"{slug}-sm.webp"
    piece, source_size, source_hash = read_piece(slug, definition, native, shared, master)
    big = scaled(piece, 1040)
    big.save(image, "WEBP", quality=91, method=5)
    scaled(piece, 240).save(small, "WEBP", quality=87, method=5)
    reused = definition.get("reuseIngredient")
    if reused:
        model_route = f"/showcase/ingredients/{reused}.glb"
        if not (OUT / "ingredients" / f"{reused}.glb").is_file():
            raise FileNotFoundError(model_route)
    else:
        PROFILES[slug] = (definition["depth"], definition["fold"], definition["color"])
        relief_model(piece, slug, OPTIONS / f"{slug}.glb")
        model_route = f"{ROUTE}/{slug}.glb"
    exported = {
        "sourceSize": source_size,
        "sourceSha256": source_hash,
        "masterSize": verify_alpha(master, 3840),
        "imageSize": verify_alpha(image, 1040),
        "smallSize": verify_alpha(small, 240),
    }
    definition["export"] = exported
    fields = ("name", "kind", "catalogLabel", "maxYaw", "maxPitch", "color", "palette", "anchor", "displayWidth")
    entry = {key: definition[key] for key in fields if key in definition}
    entry.update(
        image=f"{ROUTE}/{slug}.webp",
        imageSmall=f"{ROUTE}/{slug}-sm.webp",
        master=f"{ROUTE}/masters/{slug}.png",
        model=model_route,
        masterSize=exported["masterSize"],
        imageSize=exported["imageSize"],
        smallSize=exported["smallSize"],
        sourceSize=source_size,
    )
    return entry


def write_bundle(path, manifest, provenance):
    path.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(path, "w", compression=zipfile.ZIP_STORED, allowZip64=True) as archive:
        for slug in manifest:
            archive.write(OPTIONS / "masters" / f"{slug}.png", f"{slug}.png")
        archive.writestr("procedencia.json", json.dumps(provenance, ensure_ascii=False, indent=2))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--native", type=Path, help="Six new ImageGen cutouts, named by option slug")
    parser.add_argument("--shared", type=Path, help="Original margarita.png and perlas.png from the showcase")
    parser.add_argument("--bundle", type=Path, help="Optional destination for an eight-PNG ZIP")
    parser.add_argument("--only", nargs="+", help="Build a subset while retaining other existing entries")
    args = parser.parse_args()
    provenance = json.loads(SOURCE_NOTES.read_text(encoding="utf-8"))
    (OPTIONS / "masters").mkdir(parents=True, exist_ok=True)
    manifest_path = OPTIONS / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8")) if manifest_path.is_file() else {}
    for slug, definition in provenance["options"].items():
        if args.only and slug not in args.only:
            continue
        manifest[slug] = make_entry(slug, definition, args.native, args.shared)
        print(slug, manifest[slug]["masterSize"], flush=True)
    manifest = {slug: manifest[slug] for slug in provenance["options"] if slug in manifest}
    write_json(manifest_path, manifest)
    write_json(SOURCE_NOTES, provenance)
    if args.bundle:
        if set(manifest) != set(provenance["options"]):
            raise ValueError("All eight PNGs are required for the download.")
        write_bundle(args.bundle, manifest, provenance)


if __name__ == "__main__":
    main()
