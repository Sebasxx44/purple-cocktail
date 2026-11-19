"""Build photographic cup textures and registered UV meshes for the menu configurator.

Inputs: --photos is the directory of untouched, full-resolution Treinta photos,
named with the slugs in public/catalog/catalog.json. Requires Pillow, NumPy and
OpenCV. Product meshes use the glTF writer from export_products.py.
"""

import argparse
import hashlib
import json
from pathlib import Path

import cv2
import numpy as np
from export_products import GLB, vertex_normals
from PIL import Image, ImageOps

PUBLIC = Path(__file__).resolve().parents[2] / "public"
SHOWCASE = PUBLIC / "showcase"
OUTPUT = SHOWCASE / "configurations"
URL = "/showcase/configurations/"
CAP = Path(__file__).with_name("configuration-inputs") / "plunger-tip.png"

# The published photographs for each of these groupings are pixel-identical.
# The catalog entries keep their own price, volume, alcohol declaration and options.
GROUPS = {
    "fresa-vodka": (
        "fresa-vodka",
        "granizado-con-licor-fresa-vodka-16-onz",
        "granizado-sin-licor-16-onz",
    ),
    "margarita-tequila": ("margarita-tequila", "granizado-margarita-con-licor-16-onz"),
    "frutos-silvestres": (
        "granizado-licor-frutos-silvestres-brandy-vodka-22-onz",
        "granizado-con-licor-frutos-silvestres-16-onz",
    ),
    "smirnoff-vodka": (
        "granizado-licor-smirnoff-vodka-22-onz",
        "granizado-smirnoff-vodka-con-licor-16-onz",
    ),
    "mora-azul-tequila": ("granizado-mora-azul-con-licor-16-onz",),
    "margarita-tradicional": ("granizado-margarita-tradicional-con-licor-22onz",),
    "arandanos-perlas": ("arandanos-perlas",),
    "todos-los-toppings": ("granizado-con-licor-todos-los-toping-22-onz",),
    "margarita-con-jeringa": ("granizado-con-licor-margarita-22-onz",),
}
FLAVORS = {
    "arandanos-perlas": [
        "fresa-vodka",
        "mora-azul-tequila",
        "frutos-silvestres",
        "margarita-tequila",
        "smirnoff-vodka",
    ],
    "todos-los-toppings": ["fresa-vodka", "frutos-silvestres", "margarita-tequila"],
}
# Shadow, middle and lit ice sampled from Purple's own published flavor photos.
PALETTES = {
    "fresa-vodka": ["AA0C0F", "C0292C", "D35052"],
    "mora-azul-tequila": ["076EA3", "2E91C2", "60AAD3"],
    "frutos-silvestres": ["8307A3", "AD27C9", "C847DE"],
    "margarita-tequila": ["5DA104", "8EC50F", "B2DA3D"],
    "smirnoff-vodka": ["C7C5C0", "DFDEDA", "E9E8E6"],
}
# Silhouette landmarks in the full original pixels are seeds for the edge matte.
# fmt: off
REGULAR = [
    (270,236),(318,238),(392,239),(416,249),(444,271),(466,302),(480,336),(488,374),
    (505,379),(506,398),(514,410),(508,415),(488,419),(457,668),(426,930),(420,945),
    (402,956),(374,964),(343,968),(311,969),(274,966),(240,959),(218,948),(210,936),
    (204,898),(164,418),(139,413),(138,407),(146,398),(146,382),(152,377),(166,375),
    (169,349),(179,312),(194,287),(215,265),(239,250),(254,242),
]
TRADITIONAL = [
    (280,181),(333,176),(453,176),(476,180),(500,193),(525,212),(549,242),(564,279),
    (570,315),(570,338),(588,344),(595,352),(595,367),(600,379),(604,391),(591,398),
    (570,403),(518,858),(513,881),(505,897),(482,908),(449,916),(402,920),(356,920),
    (312,915),(275,907),(249,899),(235,886),(231,870),(181,403),(150,396),(147,389),
    (155,375),(157,354),(163,345),(180,340),(182,317),(189,279),(203,247),(226,217),
    (250,196),(264,188),
]
# A loose union of polygons follows the original photograph, including the small
# disconnected gaps between the wooden stick, gummies and the clear syringe.
ALL_CUP = [
    (101,392),(117,385),(120,370),(141,360),(170,358),(181,360),(192,356),(210,355),
    (212,331),(229,316),(248,303),(254,296),(273,298),(287,309),(300,328),(309,342),
    (328,344),(335,334),(350,332),(361,339),(366,350),(386,356),(397,370),(406,361),
    (418,362),(425,371),(426,391),(431,406),(420,417),(415,425),(378,835),(375,871),
    (370,891),(354,901),(324,907),(284,911),(239,911),(210,906),(186,898),(174,887),
    (170,872),(165,831),(112,429),(103,419),(98,409),
]
ALL_BITS = [
    [(373,0),(416,0),(361,166),(354,176),(359,182),(351,210),(377,219),(379,223),(374,228),
     (350,222),(323,345),(304,359),(283,351),(271,342),(303,209),(283,197),(283,190),
     (288,189),(314,198),(321,174),(330,167),(326,159)],
    [(248,138),(261,137),(261,308),(247,311)],
    [(134,249),(140,242),(146,241),(153,248),(167,280),(180,326),(193,359),(188,368),
     (170,373),(157,345),(144,305),(137,276)],
    [(166,247),(170,240),(178,237),(187,239),(197,251),(207,276),(219,310),(224,334),
     (213,359),(196,359),(186,328),(176,296),(170,269)],
]
MARGARITA_OPEN = [
    [(142,426),(154,418),(178,412),(207,408),(222,405),(270,402),(295,403),(379,404),
     (400,413),(420,418),(429,427),(428,439),(415,448),(410,501),(378,803),(373,848),
     (366,860),(351,867),(332,874),(309,879),(280,881),(250,880),(223,873),(205,862),
     (196,851),(193,829),(151,454),(147,445),(140,438)],
    [(180,35),(187,29),(215,23),(239,22),(248,24),(250,29),(244,35),(236,38),
     (264,243),(263,248),(254,255),(254,259),(264,260),(268,269),(270,277),(294,274),
     (298,277),(296,282),(275,286),(281,316),(286,388),(290,432),(282,447),(238,448),
     (232,388),(226,332),(224,307),(222,288),(198,294),(195,291),(196,286),(225,280),
     (225,267),(229,259),(221,253),(220,245),(197,40),(185,42),(180,40)],
    [(281,425),(285,397),(292,372),(301,359),(312,348),(319,346),(338,350),(359,359),
     (376,372),(387,386),(396,405),(403,439),(388,448),(320,455),(290,452)],
]
# fmt: on


def photo(source, slug):
    with Image.open(source / (slug + ".jpg")) as im:
        return np.array(ImageOps.exif_transpose(im).convert("RGB"))


def kernel(size):
    return cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (size, size))


def silhouette(rgb, outlines):
    rough = np.zeros(rgb.shape[:2], np.uint8)
    for ring in outlines:
        cv2.fillPoly(rough, [np.array(ring, np.int32)], 255)
    possible = cv2.dilate(rough, kernel(27)) > 0
    certain = cv2.erode(rough, kernel(19)) > 0
    labels = np.zeros_like(rough)
    labels[possible] = cv2.GC_PR_BGD
    labels[rough > 0] = cv2.GC_PR_FGD
    labels[certain] = cv2.GC_FGD
    # Keep the photographed edge identical when a single asset is rebuilt.
    cv2.setRNGSeed(511)
    cv2.grabCut(
        cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR),
        labels,
        None,
        np.zeros((1, 65), np.float64),
        np.zeros((1, 65), np.float64),
        4,
        cv2.GC_INIT_WITH_MASK,
    )
    fg = np.uint8((labels == cv2.GC_FGD) | (labels == cv2.GC_PR_FGD)) * 255
    return cv2.GaussianBlur(fg, (3, 3), 0.55)


def lid_transmission(rgb, alpha, traditional):
    # A clear lid photographed against charcoal must also work on lavender or
    # white. Estimate transmission only above the rim, keeping food and print opaque.
    image = rgb.astype(np.float32)
    y = np.arange(alpha.shape[0])[:, None]
    end = 344 if traditional else 374
    matte = np.ones(alpha.shape, np.float32)
    background = np.zeros_like(image)
    for row in range(end + 1):
        xs = np.flatnonzero(alpha[row] > 100)
        if len(xs) < 8:
            continue
        l, r = xs[[0, -1]]
        left = image[row, max(0, l - 25) : max(1, l - 7)].mean(axis=0)
        right = image[row, min(r + 8, image.shape[1] - 2) : min(r + 27, image.shape[1])].mean(axis=0)
        line = np.clip((np.arange(image.shape[1]) - l) / max(r - l, 1), 0, 1)[:, None]
        background[row] = left * (1 - line) + right * line
    peak = np.max(np.clip((image - background) / (255 - background + 1), 0, 1), axis=2)
    transmission = 0.08 if traditional else 0.27
    lid = np.clip(transmission + (1 - transmission) * peak, 0.08, 1)
    if traditional:
        # The dark dried citrus wheel is solid, even where its apparent color
        # is close to that of the studio backdrop.
        wheel = np.zeros(alpha.shape, np.uint8)
        cv2.fillPoly(
            wheel,
            [
                np.array(
                    [
                        (215, 332),
                        (222, 294),
                        (237, 258),
                        (259, 236),
                        (283, 225),
                        (308, 218),
                        (336, 222),
                        (361, 235),
                        (385, 254),
                        (401, 282),
                        (412, 309),
                        (413, 331),
                        (390, 339),
                        (233, 342),
                    ],
                    np.int32,
                )
            ],
            255,
        )
        wheel = cv2.GaussianBlur(wheel, (13, 13), 3).astype(np.float32) / 255
        lid = lid * (1 - wheel) + wheel
    weight = np.clip((end + 1 - y) / 9, 0, 1) * (alpha > 0)
    matte = matte * (1 - weight) + lid * weight
    clear = (image - (1 - matte[:, :, None]) * background) / np.maximum(matte[:, :, None], 0.06)
    rgb = np.uint8(np.round(np.clip(clear, 0, 255)))
    return np.dstack((rgb, np.uint8(np.round(alpha * matte))))


def frame(rgba, anchor):
    img = Image.fromarray(rgba)
    x, y, r, b = img.getchannel("A").point(lambda v: 255 if v > 24 else 0).getbbox()
    pad = round(max(r - x, b - y) * 0.017)
    bounds = (x - pad, y - pad, r + pad, b + pad)
    cropped = img.crop(bounds)
    ax, ay, span = anchor
    return (
        cropped,
        {
            "x": round((ax - bounds[0]) / cropped.width, 5),
            "y": round((ay - bounds[1]) / cropped.height, 5),
            "width": round(span / cropped.width, 5),
        },
        bounds,
    )


def original_cup(source, key):
    raw = photo(source, GROUPS[key][0])
    if key == "margarita-con-jeringa":
        alpha = silhouette(raw, MARGARITA_OPEN)
        return frame(np.dstack((raw, alpha)), (178, 425, 285))
    if key == "todos-los-toppings":
        # The original is used down to its labels, condensation, lip, candy and
        # stem. Only the small plunger cap beyond its top crop is reconstructed.
        old = silhouette(raw, [ALL_CUP, *ALL_BITS])
        source_image = Image.fromarray(np.dstack((raw, old)))
        padded = Image.new("RGBA", (raw.shape[1], raw.shape[0] + 100))
        padded.alpha_composite(Image.open(CAP).convert("RGBA"), (352, 0))
        padded.paste(source_image, (0, 100))
        return frame(np.asarray(padded), (263, 500, 329))
    traditional = key == "margarita-tradicional"
    outline = TRADITIONAL if traditional else REGULAR
    a = silhouette(raw, [outline])
    corrected = lid_transmission(raw, a, traditional)
    anchor = (377, 342, 447) if traditional else (326, 377, 370)
    return frame(corrected, anchor)


def save_web(image, basename, edge=1000, small_edge=440):
    def save(max_edge, label, quality):
        clone = image.copy()
        clone.thumbnail((max_edge, max_edge), Image.Resampling.LANCZOS)
        name = basename + label + ".webp"
        clone.save(OUTPUT / name, "WEBP", quality=quality, method=5, exact=True)
        return URL + name

    return {"image": save(edge, "", 92), "imageSmall": save(small_edge, "-sm", 84)}


def profile_mesh(image, name, special_top=None):
    # Horizontal sections turn the camera-facing silhouette into a rounded shell.
    # For the loose sweets and syringe above the rim, each separate span receives
    # its own depth instead of joining the empty spaces between the garnishes.
    tex = image.copy()
    tex.thumbnail((560, 850), Image.Resampling.LANCZOS)
    a = np.asarray(tex.getchannel("A"))
    h, w = a.shape
    mask = (a > 18).astype("uint8")
    if special_top is None:
        # Fill the interior of clear plastic even when its transmission is high.
        for row in mask:
            solid = np.flatnonzero(row)
            if len(solid):
                row[solid[0] : solid[-1] + 1] = 1
    scale = max(w, h) / 2
    xs = np.unique(np.append(np.arange(0, w, 4), w - 1))
    ys = np.unique(np.append(np.arange(0, h, 4), h - 1))
    depth = np.zeros((len(ys), len(xs)), np.float32)
    for k, y in enumerate(ys):
        row = np.flatnonzero(mask[y])
        parts = [] if len(row) == 0 else [row]
        if len(row) and special_top is not None and y / h < special_top:
            parts = np.split(row, np.flatnonzero(np.diff(row) > 2) + 1)
        for span in parts:
            radius = max(1, (span[-1] - span[0]) / 2 + 0.5)
            center = (span[-1] + span[0]) / 2
            depth[k] = np.maximum(
                depth[k], 0.88 * np.sqrt(np.maximum(radius * radius - (xs - center) ** 2, 0))
            )
    safe = cv2.dilate(mask, kernel(11))[np.ix_(ys, xs)]
    faces = []
    front_indices = []
    order = {}
    for iy in range(len(ys) - 1):
        for ix in range(len(xs) - 1):
            if not safe[iy : iy + 2, ix : ix + 2].any():
                continue
            corners = [(iy, ix), (iy, ix + 1), (iy + 1, ix + 1), (iy + 1, ix)]
            for key in corners:
                if key not in order:
                    order[key] = len(order)
                    front_indices.append(key)
            j0, j1, j2, j3 = [order[k] for k in corners]
            faces.extend(((j0, j2, j1), (j0, j3, j2)))
    yy = np.array([v[0] for v in front_indices])
    xx = np.array([v[1] for v in front_indices])
    x = xs[xx]
    y = ys[yy]
    front = np.stack(((x - (w - 1) / 2) / scale, ((h - 1) / 2 - y) / scale, depth[yy, xx] / scale), axis=1)
    uv = np.stack(((x + 0.5) / w, (y + 0.5) / h), axis=1)
    n = len(front)
    front_faces = np.asarray(faces)
    back_faces = front_faces[:, ::-1] + n
    # Boundary triangles join front and back into one drawable, textured object.
    edges = {}
    for t in faces:
        for i, j in ((t[0], t[1]), (t[1], t[2]), (t[2], t[0])):
            pair = (min(i, j), max(i, j))
            if pair in edges:
                edges.pop(pair)
            else:
                edges[pair] = (i, j)
    walls = []
    for i, j in edges.values():
        walls.extend(((i, j + n, j), (i, i + n, j + n)))
    idx = np.concatenate((front_faces, back_faces, np.asarray(walls)), axis=0)
    verts = np.concatenate((front, front * np.array([1, 1, -1.0])), axis=0)
    writer = GLB()
    mat = writer.material("Fotografía frontal · textura de configuración", texture=tex)
    writer.mesh(
        name, [writer.primitive(verts, vertex_normals(verts, idx), idx, mat, uv=np.concatenate((uv, uv)))]
    )
    writer.write(OUTPUT / (name + ".glb"))
    return URL + name + ".glb"


def smoothstep(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def flavor_texture(image, flavor, body_top, print_box):
    # Transfer ice reflectance through its photographic UV material. No logo,
    # garnish, rim or outer alpha is regenerated when the user changes a flavor.
    px = np.array(image.convert("RGBA"))
    rgb = px[:, :, :3].astype(np.float32)
    h, w = px.shape[:2]
    y, x = np.indices((h, w))
    ny = (y + 0.5) / h
    nx = (x + 0.5) / w
    value = rgb.max(axis=2)
    low = rgb.min(axis=2)
    x0, y0, x1, y1 = print_box
    logo_area = (nx > x0) & (nx < x1) & (ny > y0) & (ny < y1)
    local = cv2.dilate(value, kernel(max(5, (round(w * 0.055) // 2) * 2 + 1)))
    contrast = (local - value) / np.maximum(local, 1)
    chroma = (value - low) / np.maximum(value, 1)
    ink = (1 - smoothstep(55.0, 112.0, value)) * smoothstep(0.16, 0.48, contrast)
    ink = np.maximum(ink, (1 - smoothstep(39.0, 81.0, value)) * (1 - smoothstep(0.26, 0.75, chroma)))
    ink = ink * logo_area
    material = (ny > body_top + 0.015) & (ny < 0.96) & (px[:, :, 3] > 180) & (ink < 0.3)
    q = np.quantile(value[material], [0.045, 0.46, 0.90]).tolist()
    shadows, core, light = (np.array(list(bytes.fromhex(c)), dtype=float) for c in PALETTES[flavor])
    knots = [0, *q, 255]
    colors = np.stack((shadows * 0.26, shadows, core, light, light + (255 - light) * 0.83))
    target = np.stack([np.interp(value, knots, colors[:, k]) for k in range(3)], axis=2)
    specular = smoothstep(155, 239, value) * (1 - smoothstep(0.06, 0.35, chroma)) * 0.78
    darkness = smoothstep(0.842, 0.973, ny) * 0.19
    target = target * (1 - darkness[:, :, None])
    weight = smoothstep(body_top - 0.0015, body_top + 0.010, ny) * (1 - ink) * (1 - specular)
    out = rgb + (target - rgb) * weight[:, :, None]
    px[:, :, :3] = np.uint8(np.round(np.clip(out, 0, 255)))
    return Image.fromarray(px)


def run(source):
    OUTPUT.mkdir(parents=True, exist_ok=True)
    products = json.loads((PUBLIC / "catalog/catalog.json").read_text(encoding="utf8"))["products"]
    configurable = {p["slug"] for p in products if p["variants"]}
    if configurable | {"granizado-con-licor-margarita-22-onz"} != {
        slug for group in GROUPS.values() for slug in group
    }:
        raise ValueError("The published configurable SKU list has changed.")
    existing = json.loads((SHOWCASE / "manifest.json").read_text(encoding="utf8"))
    studio_products = existing if isinstance(existing, list) else existing["products"]
    by_slug = {p["slug"]: p for p in studio_products}
    output = {}
    for key, slugs in GROUPS.items():
        small_edge = 480
        if len(slugs) > 1:
            fingerprints = {hashlib.sha256(photo(source, s).tobytes()).digest() for s in slugs}
            if len(fingerprints) != 1:
                raise ValueError("Different source photos need separate models: " + key)
        if key in by_slug:
            studio = by_slug[key]
            small_edge = max(studio["smallSize"])
            entry = {f: studio[f] for f in ("image", "imageSmall", "model")}
            geometry = {
                "fresa-vodka": (0.5, 0.227, 0.901),
                "margarita-tequila": (0.5, 0.225, 0.896),
                "arandanos-perlas": (0.494, 0.187, 0.91),
            }
            ax, ay, aw = geometry[key]
            entry["anchor"] = {"x": ax, "y": ay, "width": aw}
            if key in FLAVORS:
                with Image.open(PUBLIC / studio["master"].lstrip("/")) as master:
                    image = master.convert("RGBA")
                image.thumbnail((1200, 1200), Image.Resampling.LANCZOS)
                body_top = 0.198
                print_box = (0.258, 0.341, 0.771, 0.866)
        else:
            image, anchor, bounds = original_cup(source, key)
            entry = save_web(image, key, 1200, small_edge) if key in FLAVORS else save_web(image, key)
            special = None
            if key == "todos-los-toppings":
                # Use the lower edge of the topping layer so the colored pearls,
                # their reflections and the clear rim keep their original pixels.
                body_top = (100 + 477 - bounds[1]) / image.height
                print_box = (
                    (194 - bounds[0]) / image.width,
                    (100 + 503 - bounds[1]) / image.height,
                    (357 - bounds[0]) / image.width,
                    (100 + 842 - bounds[1]) / image.height,
                )
                special = (100 + 390 - bounds[1]) / image.height
            elif key == "margarita-con-jeringa":
                special = (415 - bounds[1]) / image.height
            entry.update(model=profile_mesh(image, key, special), anchor=anchor)
        if key in FLAVORS:
            variants = {}
            for flavor in FLAVORS[key]:
                if key == "todos-los-toppings" and flavor == "fresa-vodka":
                    variants[flavor] = {field: entry[field] for field in ("image", "imageSmall")}
                else:
                    colored = flavor_texture(image, flavor, body_top, print_box)
                    variants[flavor] = save_web(colored, key + "--" + flavor, 1200, small_edge)
            entry["flavors"] = variants
        for slug in slugs:
            output[slug] = entry
    (OUTPUT / "manifest.json").write_text(
        json.dumps(output, ensure_ascii=False, indent=2) + "\n", encoding="utf8"
    )
    for key, entry in output.items():
        print(key, entry["image"], entry["anchor"])


if __name__ == "__main__":
    args = argparse.ArgumentParser(description=__doc__)
    args.add_argument("--photos", required=True, type=Path)
    run(args.parse_args().photos)
