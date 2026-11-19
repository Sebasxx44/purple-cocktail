"""Prepare intact, photo-registered packs for the two Purple galleries.

Run with --photos pointing to full, untouched Treinta JPGs named {slug}.jpg.
The three existing burger hero models and all configurable drink models are
reused. Only new photographic silhouettes acquire another mesh.
"""

import argparse
import json
from pathlib import Path

import cv2
import numpy as np
from export_configurations import GROUPS, original_cup, photo, silhouette
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


def cardboard_bowl_edge(alpha):
    # The hand supporting the takeaway bowl in the American Purple photograph
    # casts a brown shadow close to the color of the cardboard. Trace the smooth
    # lower bowl wall across that contact patch, preserving the actual pixels.
    points = np.array(
        [
            (35, 506),
            (41, 521),
            (50, 540),
            (59, 560),
            (70, 580),
            (82, 600),
            (90, 620),
            (100, 640),
            (111, 660),
            (125, 680),
            (143, 700),
            (161, 720),
            (182, 740),
            (207, 760),
            (246, 780),
            (270, 790),
            (297, 795),
            (328, 798),
            (347, 798),
            (383, 795),
            (413, 790),
            (440, 780),
            (479, 760),
            (503, 740),
            (527, 720),
            (546, 700),
            (562, 680),
            (578, 660),
            (592, 640),
            (604, 620),
            (619, 600),
            (632, 580),
            (644, 560),
            (652, 540),
            (659, 520),
            (663, 504),
        ],
        dtype=float,
    )
    padded = np.concatenate(([points[0]], points, [points[-1]]))
    steps = np.linspace(0.0, 1.0, 9, endpoint=False)[:, None]
    path = []
    for index in range(len(points) - 1):
        a, b, c, d = padded[index : index + 4]
        path.extend(
            0.5
            * (
                2 * b
                + (-a + c) * steps
                + (2 * a - 5 * b + 4 * c - d) * steps**2
                + (-a + 3 * b - 3 * c + d) * steps**3
            )
        )
    path.append(points[-1])
    supersample = 3
    height, width = alpha.shape
    trace = np.zeros((height * supersample, width * supersample), np.uint8)
    cv2.fillPoly(trace, [np.int32(np.rint(np.asarray(path) * supersample))], 255)
    smooth = cv2.resize(trace, (width, height), interpolation=cv2.INTER_AREA)
    weight = np.clip((np.arange(height)[:, None] - 510) / 12, 0, 1)
    return np.uint8(np.rint(alpha * (1 - weight) + smooth * weight))


def clean_outline(raw, outline, slug):
    alpha = silhouette(raw, [outline])
    if slug == "american-purple":
        alpha = cardboard_bowl_edge(alpha)
    _, regions, stats, _ = cv2.connectedComponentsWithStats((alpha > 85).astype(np.uint8))
    food_region = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
    # Exclude background specks while keeping the antialiased food silhouette.
    selection = cv2.dilate(np.uint8(regions == food_region), np.ones((5, 5), np.uint8))
    alpha *= selection
    return isolated(Image.fromarray(np.dstack((raw, alpha))))


def output_master(photo_image, key):
    path = FOOD / (key + "-4k.png")
    # Premultiplied resampling avoids a dark or bright fringe on a new backdrop.
    master = scaled(photo_image.convert("RGBa"), 3840).convert("RGBA")
    master.save(path, "PNG", compress_level=8)
    return URL + path.name


def new_dish(source, slug, outline):
    image = clean_outline(photo(source, slug), outline, slug)
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
    for slug, outline in read_json(INPUTS / "contornos.json").items():
        if mode in {"all", "dishes"}:
            output[slug] = new_dish(source, slug, outline)
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
    parser.add_argument("--photos", required=True, type=Path)
    parser.add_argument("--mode", choices=("all", "dishes", "drinks"), default="all")
    args = parser.parse_args()
    items = gallery_media(args.photos, args.mode)
    print(f"Registered {len(items)} food and drink cutouts.")
