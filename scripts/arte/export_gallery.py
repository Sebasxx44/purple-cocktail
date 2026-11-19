"""Build responsive art direction and a medium manifest for the 24 gallery SKUs.

Run export_gallery_food.py before this script when the product cutouts change.
The backdrop photographs, prompts, catalog-size assignments and source cutout
landmarks live in gallery-inputs. No API or remote image is used at runtime.
"""

import argparse
import json
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import numpy as np
from export_gallery_food import GALLERY, INPUTS, PUBLIC, gallery_media, read_json
from PIL import Image, ImageColor, ImageOps

BACKGROUNDS = GALLERY / "backgrounds"
OBJECTS = GALLERY / "objects"
HIRES = GALLERY / "hires"
GALLERY_URL = "/showcase/gallery/"
FILES = {"ing": "ingredients", "opt": "options", "layer": "burger-layers"}
LAYOUTS = {
    "a": [(29, 28, 10, -16, 20, 26, 18), (69, 61, 8, 15, 81, 54, 13)],
    "b": [(70, 27, 11, 14, 80, 25, 19), (30, 63, 8, -16, 19, 56, 14)],
    "c": [(29, 33, 10, 11, 18, 28, 18), (68, 59, 8, -14, 83, 52, 14)],
    "d": [(70, 32, 10, -14, 81, 27, 19), (32, 61, 8, 12, 17, 55, 15)],
}
PARAMETERS = ("x", "y", "width", "rotate", "xMobile", "yMobile", "widthMobile")


def backdrop_source(source, layout):
    if source.startswith("@"):
        return PUBLIC / "showcase/backgrounds" / (source[1:] + "-" + layout + ".webp")
    return INPUTS / (source + ".webp")


def formatted_crop(image, size, zoom, focus):
    width, height = image.size
    aspect = size[0] / size[1]
    crop_height = min(height, width / aspect) / zoom
    crop_width = crop_height * aspect
    left = round((width - crop_width) * focus)
    top = round((height - crop_height) * 0.49)
    return image.crop((left, top, round(left + crop_width), round(top + crop_height))).resize(
        size, Image.Resampling.LANCZOS
    )


def color_grade(image, tone, native_tone, portrait):
    # The center of the photographic paper follows the SKU color. Glazed food,
    # candy and ice at the edges retain more of their original hue and highlights.
    rgb = np.asarray(image.convert("RGB"))
    target = np.array(ImageColor.getrgb(tone), dtype=np.float32)
    source = np.clip(np.asarray(native_tone), 1, 254)
    values = np.arange(256)
    mapped = np.stack(
        [np.interp(values, (0, source[i], 255), (0, target[i], 255))[rgb[:, :, i]] for i in range(3)], axis=2
    ).astype(np.float32)
    delta = np.linalg.norm(rgb.astype(np.float32) - source, axis=2)
    strength = np.clip(0.96 - np.maximum(delta - 30.0, 0) / 360.0, 0.40, 0.96)
    graded = rgb + strength[:, :, None] * (mapped - rgb)
    y = np.linspace(0.0, 1.0, image.height, dtype=np.float32)[:, None]
    # Keep the information strip at the bottom readable at narrow viewport sizes.
    washout = 0.035 + (0.22 if portrait else 0.07) * np.clip((y - 0.63) / 0.37, 0, 1)
    color = graded * (1 - washout[:, :, None]) + target * washout[:, :, None]
    return Image.fromarray(np.uint8(np.clip(np.rint(color), 0, 255)))


def linear_light(srgb):
    srgb = np.asarray(srgb, dtype=np.float32) / 255.0
    return np.where(srgb <= 0.04045, srgb / 12.92, ((srgb + 0.055) / 1.055) ** 2.4)


def type_contrast(image, ink, paper):
    # A localized photographic fill lifts deep shadows beneath the menu heading,
    # price and controls on each card. It leaves the food around the model intact.
    weights = np.array((0.2126, 0.7152, 0.0722), dtype=np.float32)
    pixels = linear_light(np.asarray(image))
    original = pixels @ weights
    color = linear_light(ImageColor.getrgb(paper))
    minimum = 5.35 * (float(linear_light(ImageColor.getrgb(ink)) @ weights) + 0.05) - 0.05
    mix = np.clip((minimum - original) / np.maximum(float(color @ weights) - original, 0.0001), 0, 0.98)
    y = np.linspace(0.0, 1.0, image.height, dtype=np.float32)[:, None]
    fade = np.maximum(np.clip((y - 0.63) / 0.14, 0, 1), np.clip((0.27 - y) / 0.09, 0, 1))
    fade = fade * fade * (3 - 2 * fade)
    fill = (mix * fade)[:, :, None]
    lit = pixels + (color - pixels) * fill
    srgb = np.where(lit <= 0.0031308, lit * 12.92, 1.055 * np.power(lit, 1 / 2.4) - 0.055)
    return Image.fromarray(np.uint8(np.clip(np.rint(255 * srgb), 0, 255)))


def responsive_backdrop(slug, direction):
    source = direction["source"]
    with Image.open(backdrop_source(source, "wide")) as wide:
        w, h = wide.size
        middle = np.asarray(
            wide.convert("RGB").crop((int(w * 0.27), int(h * 0.3), int(w * 0.54), int(h * 0.66)))
        )
        original_tone = np.median(middle.reshape(-1, 3), axis=0)
    urls = {}
    for portrait in (False, True):
        layout = "mobile" if portrait else "wide"
        path = backdrop_source(source, layout)
        with Image.open(path) as image:
            focus = direction["portraitFocus"] if portrait else 0.69
            crop = formatted_crop(
                image.convert("RGB"), (780, 1386) if portrait else (1600, 900), direction["zoom"], focus
            )
        output = (
            crop
            if source == "@" + slug
            else color_grade(crop, direction["colors"][0], original_tone, portrait)
        )
        output = type_contrast(output, direction["colors"][2], direction["colors"][1])
        name = f"{slug}-{layout}.webp"
        output.save(BACKGROUNDS / name, "WEBP", quality=84, method=5)
        urls["backgroundMobile" if portrait else "background"] = GALLERY_URL + "backgrounds/" + name
    return urls


def secondary(ref):
    kind, name = ref.split("/")
    if kind == "obj":
        return GALLERY_URL + "objects/" + name + ".webp"
    if kind == "layer":
        return "/showcase/burger-layers/" + name + "-sm.webp"
    source = PUBLIC / "showcase" / FILES[kind] / (name + ".webp")
    # The isolated ice represents its color even on alcohol-free SKU scenes.
    # Decorative files are light enough for a 2x or 3x mobile display.
    result = kind + "-" + name.replace("-vodka", "").replace("-tequila", "") + ".webp"
    destination = OBJECTS / result
    if not destination.is_file() or source.stat().st_mtime > destination.stat().st_mtime:
        with Image.open(source) as original:
            image = ImageOps.exif_transpose(original).convert("RGBA")
            image.thumbnail((360, 360), Image.Resampling.LANCZOS)
            image.save(destination, "WEBP", quality=85, method=5)
    return GALLERY_URL + "objects/" + result


def display_texture(master):
    source = PUBLIC / master.lstrip("/")
    if source.suffix.lower() == ".webp":
        return master, master
    name = source.stem.removesuffix("-4k") + ".webp"
    destination = HIRES / name
    if not destination.is_file() or source.stat().st_mtime > destination.stat().st_mtime:
        with Image.open(source) as photograph:
            if max(photograph.size) != 3840 or "A" not in photograph.getbands():
                raise ValueError("Expected 3840-pixel transparent studio master: " + master)
            photograph.save(destination, "WEBP", quality=82, method=4, exact=True)
    return master, GALLERY_URL + "hires/" + name


def run(photos, media_only=False):
    BACKGROUNDS.mkdir(parents=True, exist_ok=True)
    OBJECTS.mkdir(parents=True, exist_ok=True)
    HIRES.mkdir(parents=True, exist_ok=True)
    product_media = gallery_media(photos, "existing")
    masters = {media["master"] for media in product_media.values()}
    with ThreadPoolExecutor(max_workers=2) as pool:
        display_textures = dict(pool.map(display_texture, masters))
    directions = read_json(INPUTS / "escenas.json")
    products = read_json(PUBLIC / "catalog/catalog.json")["products"]
    expected = {
        p["slug"]
        for p in products
        if p["category"] == "HAMBURGUESAS"
        or (p["name"].startswith("GRANIZADO") and p["category"] != "COMBOS")
    }
    if expected != set(directions) or expected != set(product_media):
        raise ValueError("The registered gallery membership does not match Treinta.")
    result = {}
    for slug, direction in directions.items():
        item = {key: direction[key] for key in ("name", "eyebrow")}
        item.update(dict(zip(("tone", "light", "ink", "button"), direction["colors"], strict=True)))
        if media_only:
            item["background"] = GALLERY_URL + "backgrounds/" + slug + "-wide.webp"
            item["backgroundMobile"] = GALLERY_URL + "backgrounds/" + slug + "-mobile.webp"
        else:
            item.update(responsive_backdrop(slug, direction))
        item["objects"] = [
            {"image": secondary(ref), **dict(zip(PARAMETERS, placement, strict=True))}
            for ref, placement in zip(direction["objects"], LAYOUTS[direction["layout"]], strict=True)
        ]
        media = product_media[slug]
        result[slug] = {**item, **media, "image4k": display_textures[media["master"]]}
    (GALLERY / "manifest.json").write_text(
        json.dumps(result, indent=2, ensure_ascii=False) + "\n", encoding="utf8"
    )
    print(f"Registered {len(result)} scenes.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--photos", type=Path, required=True)
    parser.add_argument("--reuse-backgrounds", action="store_true")
    args = parser.parse_args()
    run(args.photos, args.reuse_backgrounds)
