"""Prepare intact, photo-registered packs for the two Purple galleries.

Run with --photos pointing to full, untouched Treinta JPGs named {slug}.jpg.
Burgers and fries use original studio renders under gallery-inputs/platos.
Their transparent masters, responsive images and textured meshes share one silhouette.
"""

import argparse
import json
from pathlib import Path

from export_configurations import GROUPS, original_cup
from export_products import isolated, profile_model, scaled
from PIL import Image

SCRIPTS = Path(__file__).resolve().parent
PUBLIC = SCRIPTS.parents[1] / "public"
GALLERY = PUBLIC / "showcase/gallery"
FOOD = GALLERY / "food"
INPUTS = SCRIPTS / "gallery-inputs"
URL = "/showcase/gallery/food/"
ALCOHOL_FREE_22 = "granizado-sin-licor-22-onzas"


def read_json(path):
    return json.loads(path.read_text(encoding="utf8"))


def output_master(photo_image, key):
    path = FOOD / (key + "-4k.png")
    # Premultiplied resampling avoids a dark or bright fringe on a new backdrop.
    master = scaled(photo_image.convert("RGBa"), 3840).convert("RGBA")
    master.save(path, "PNG", compress_level=8)
    return URL + path.name


def new_dish(slug):
    with Image.open(INPUTS / "platos" / (slug + ".png")) as render:
        image = isolated(render)
    main = scaled(image, min(1080, max(image.size)))
    small = scaled(image, min(510, max(image.size)))
    main.save(FOOD / (slug + ".webp"), "WEBP", quality=92, method=5, exact=True)
    small.save(FOOD / (slug + "-small.webp"), "WEBP", quality=84, method=5, exact=True)
    profile_model(image, slug, FOOD / (slug + ".glb"))
    return {
        "image": URL + slug + ".webp",
        "imageSmall": URL + slug + "-small.webp",
        "master": output_master(image, slug),
        "model": URL + slug + ".glb",
    }


def gallery_media(source, mode):
    FOOD.mkdir(parents=True, exist_ok=True)
    studio = read_json(PUBLIC / "showcase/manifest.json")
    studio = studio if isinstance(studio, list) else studio["products"]
    output = {p["slug"]: {k: p[k] for k in ("image", "imageSmall", "master", "model")} for p in studio}
    configs = read_json(PUBLIC / "showcase/configurations/manifest.json")
    for key, aliases in GROUPS.items():
        if key in output:
            master = output[key]["master"]
        else:
            master = URL + key + "-4k.png"
            if mode in {"all", "drinks"}:
                image, _, _ = original_cup(source, key)
                output_master(image, key)
        for sku in aliases:
            output[sku] = {k: configs[sku][k] for k in ("image", "imageSmall", "model")}
            output[sku]["master"] = master
    alc = ALCOHOL_FREE_22
    free_master = "/catalog/masters/" + alc + ".png"
    if mode in {"all", "drinks"}:
        with Image.open(PUBLIC / free_master.lstrip("/")) as img:
            profile_model(img.convert("RGBA"), alc, FOOD / (alc + ".glb"))
    output[alc] = {
        "image": "/catalog/images/" + alc + "-recorte-1050.webp",
        "imageSmall": "/catalog/images/" + alc + "-recorte-620.webp",
        "master": free_master,
        "model": URL + alc + ".glb",
    }
    for slug in read_json(INPUTS / "platos" / "generacion.json"):
        if mode in {"all", "dishes"}:
            output[slug] = new_dish(slug)
        else:
            output[slug] = {
                "image": URL + slug + ".webp",
                "imageSmall": URL + slug + "-small.webp",
                "master": URL + slug + "-4k.png",
                "model": URL + slug + ".glb",
            }
    return output


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--photos", type=Path)
    parser.add_argument("--mode", choices=("all", "dishes", "drinks"), default="all")
    args = parser.parse_args()
    if args.mode != "dishes" and args.photos is None:
        parser.error("--photos is required for the drink photographs")
    items = gallery_media(args.photos, args.mode)
    print(f"Registered {len(items)} product images and models.")
