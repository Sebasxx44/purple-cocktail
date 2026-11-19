"""Closed ingredient geometry in bun-diameter units, Y up and front +Z."""

import math

import numpy as np
from PIL import Image, ImageFilter

from export_ingredients import border_distances
from export_products import GLB, scaled, vertex_normals


PITCH = math.radians(12)
CO, SI = math.cos(PITCH), math.sin(PITCH)

# Radius and height of the cross section. The bowl profile travels from the
# outer bottom, up and over its rolled lip, then down the interior to its floor.
RINGS = {
    "crown": [(0.015, 0), (.73, 0), (.94, .018), (.985, .06), (1, .13),
              (.987, .24), (.953, .39), (.89, .53), (.78, .69), (.63, .82),
              (.47, .91), (.31, .973), (.14, .994), (.015, 1)],
    "heel": [(.015, 0), (.77, 0), (.88, .016), (.943, .062), (.978, .14),
             (.995, .25), (1, .48), (.995, .73), (.972, .88), (.934, .96),
             (.84, .994), (.68, 1), (.38, .995), (.015, .992)],
    "bowl": [(.015, 0), (.72, 0), (.759, .012), (.781, .035), (.789, .067),
             (.958, .877), (.968, .913), (.992, .932), (1, .956), (.995, .98),
             (.981, .998), (.963, 1), (.946, .987), (.941, .963), (.946, .936),
             (.938, .905), (.738, .104), (.714, .077), (.67, .067), (.015, .067)],
}

# Section exponent, amount of local surface variation and edge-rounding radius.
SECTIONS = {
    "patty": (3.3, .14, 2.4), "slice": (3.8, .07, 2.3),
    "spread": (3.1, .05, 2.1), "ribbon": (2.3, .19, 2.4),
    "relish": (2.45, .17, 2.1), "bites": (2.0, .18, 2.1),
    "onionNest": (2.15, .21, 1.7), "coins": (3.25, .11, 2.3),
    "drizzle": (2.4, .08, 1.8), "fries": (2.4, .17, 2.0),
}


def centered(points, size):
    minimum = points.min(axis=0)
    maximum = points.max(axis=0)
    return (points - (maximum + minimum) / 2) * (np.asarray(size) / np.maximum(maximum - minimum, 1e-8))


def silhouette_uv(points, image):
    """Project the photographed front onto a rotational body, matching its outline."""
    alpha = np.asarray(image.getchannel("A")) > 80
    h, w = alpha.shape
    live_columns = np.flatnonzero(alpha.any(axis=0))
    first, last = live_columns[[0, -1]]
    tops = np.argmax(alpha, axis=0)
    bottoms = h - 1 - np.argmax(alpha[::-1], axis=0)
    u = (points[:, 0] - points[:, 0].min()) / np.ptp(points[:, 0])
    col = first + np.clip(u, 0, 1) * (last - first)
    image_top = np.interp(col, live_columns, tops[live_columns])
    image_bottom = np.interp(col, live_columns, bottoms[live_columns])
    screen_y = CO * points[:, 1] - SI * points[:, 2]
    bins = 90
    index = np.rint(u * (bins - 1)).astype(int)
    lo = np.full(bins, np.inf)
    hi = np.full(bins, -np.inf)
    np.minimum.at(lo, index, screen_y)
    np.maximum.at(hi, index, screen_y)
    known = np.flatnonzero(np.isfinite(lo))
    projected_min = np.interp(u * (bins - 1), known, lo[known])
    projected_max = np.interp(u * (bins - 1), known, hi[known])
    middle = np.clip((screen_y - projected_min) / np.maximum(projected_max - projected_min, 1e-8), 0, 1)
    row = image_bottom - middle * (image_bottom - image_top)
    return np.stack(((col + .5) / w, (row + .5) / h), axis=1)


def open_bowl_uv(points, image):
    # The convex exterior and concave inside overlap when viewed from above.
    # A single orthographic projection keeps the photographic lip continuous.
    width, height = image.size
    alpha = image.getchannel("A").point(lambda value: 255 if value > 90 else 0)
    x0, y0, x1, y1 = alpha.getbbox()
    x = points[:, 0]
    up = CO * points[:, 1] - SI * points[:, 2]
    u = (x - x.min()) / np.ptp(x)
    v = (up.max() - up) / np.ptp(up)
    return np.stack(((x0 + .5 + u * (x1 - x0 - 1)) / width,
                     (y0 + .5 + v * (y1 - y0 - 1)) / height), axis=1)


def rotational_body(photo, spec):
    rings = RINGS[spec["profile"]]
    segments = 112
    angle = np.arange(segments) * (2 * np.pi / segments)
    ca, sa = np.cos(angle), np.sin(angle)
    natural = 0 if spec["profile"] == "bowl" else .009
    vertices = []
    for r, y in rings:
        radius = r * (1 + natural * (np.sin(3 * angle - .8) + .48 * np.sin(6 * angle + .4)))
        rise = y + natural * .6 * (1 - y) * r * np.sin(2 * angle + .4)
        vertices.extend(np.stack((ca * radius, np.broadcast_to(rise, ca.shape), sa * radius), axis=1))
    faces = []
    for j in range(len(rings) - 1):
        for i in range(segments):
            next_i = (i + 1) % segments
            a, b = j * segments + i, j * segments + next_i
            c, d = a + segments, b + segments
            faces.extend(((a, c, b), (b, c, d)))
    start_center, end_center = len(vertices), len(vertices) + 1
    vertices.extend(((0, rings[0][1], 0), (0, rings[-1][1], 0)))
    final = (len(rings) - 1) * segments
    for i in range(segments):
        nxt = (i + 1) % segments
        faces.append((start_center, i, nxt))
        faces.append((end_center, final + nxt, final + i))
    positions = centered(np.array(vertices), (spec["width"], spec["thickness"], spec["depth"]))
    uv = open_bowl_uv(positions, photo) if spec["profile"] == "bowl" else silhouette_uv(positions, photo)
    return positions, np.asarray(faces), uv


def closed_faces(coverage, ids, count):
    """Trace the silhouette and every interior hole, and close the two surfaces."""
    jj, ii = np.indices((coverage.shape[0] - 1, coverage.shape[1] - 1))
    a, b = ids[jj, ii], ids[jj, ii + 1]
    c, d = ids[jj + 1, ii], ids[jj + 1, ii + 1]
    one, two = np.stack((a, c, b), axis=2), np.stack((c, d, b), axis=2)
    front = np.concatenate((one[(one >= 0).all(axis=2)], two[(two >= 0).all(axis=2)]))
    boundary = {}
    for tri in front:
        for j in range(3):
            i, k = int(tri[j]), int(tri[(j + 1) % 3])
            edge = (min(i, k), max(i, k))
            if edge in boundary:
                del boundary[edge]
            else:
                boundary[edge] = (i, k)
    sides = []
    for i, k in boundary.values():
        sides.extend(((i, k + count, k), (i, i + count, k + count)))
    return np.concatenate((front, front[:, ::-1] + count, np.asarray(sides)))


def ingredient_body(photo, spec):
    # Rays through the source image intersect a superelliptic solid per column.
    # Front and rear lie along the same camera ray. Holes in onion, bacon strips
    # and open sauce drizzles therefore stay open through the solid.
    grid = scaled(photo, 148)
    a_img = grid.getchannel("A")
    core = np.asarray(a_img) > 95
    core[[0, -1], :] = False
    core[:, [0, -1]] = False
    coverage = np.asarray(a_img.filter(ImageFilter.MaxFilter(3))) > 36
    coverage[[0, -1], :] = False
    coverage[:, [0, -1]] = False
    h, w = core.shape
    jj, ii = np.where(coverage)
    ids = np.full((h, w), -1, dtype=int)
    count = len(ii)
    ids[jj, ii] = np.arange(count)
    occ = np.flatnonzero(core.any(axis=0))
    top = np.interp(np.arange(w), occ, np.argmax(core, axis=0)[occ])
    bot = np.interp(np.arange(w), occ, (h - 1 - np.argmax(core[::-1], axis=0))[occ])
    per_col = np.maximum(1, bot - top)
    photo_span = bot.max() - top.min()
    ratio = np.clip(per_col[ii] / photo_span, .01, 1.0)
    exponent, variation, rim = SECTIONS[spec["profile"]]
    q = exponent / (exponent - 1)
    full_a, full_b = spec["thickness"] / 2, spec["depth"] / 2
    full_screen = ((full_a * CO) ** q + (full_b * SI) ** q) ** (1 / q)
    a, b = full_a * ratio ** .36, full_b * ratio ** .84
    col_projection = ((a * CO) ** q + (b * SI) ** q) ** (1 / q)
    correction = full_screen * ratio / np.maximum(col_projection, 1e-6)
    a, b = a * correction, b * correction
    level = np.clip((bot[ii] + top[ii] - 2 * jj) / per_col[ii], -1, 1)
    local = level * full_screen * ratio
    col_shift = (top.min() + bot.max() - top[ii] - bot[ii]) / photo_span * full_screen
    # Sample the two crossings of the viewing ray with the local section.
    samples = np.linspace(-1, 1, 81)
    z = b[:, None] * samples
    y = (local[:, None] + z * SI) / CO
    energy = np.abs(samples) ** exponent + np.abs(y / np.maximum(a[:, None], 1e-7)) ** exponent
    inside = energy <= 1.0001
    near = len(samples) - 1 - np.argmax(inside[:, ::-1], axis=1)
    far = np.argmax(inside, axis=1)
    missed = ~inside.any(axis=1)
    near[missed] = far[missed] = np.argmin(energy[missed], axis=1)
    mid = b * (samples[near] + samples[far]) * .5
    half = b * np.maximum((samples[near] - samples[far]) * .5, .001)
    edge = np.clip(border_distances(core)[jj, ii] / rim, 0, 1)
    rgb = np.asarray(grid.convert("RGB"), dtype=float) / 255
    light = rgb[jj, ii] @ np.array((.2126, .7152, .0722))
    relief = np.clip(light - np.median(light), -.48, .48)
    mid += half * relief * variation
    half *= (.84 + .16 * edge) * np.sqrt(edge) + .001
    x = (ii / (w - 1) - .5) * spec["width"]
    z_shift = -col_shift * .80 / SI
    y_shift = col_shift * .20 / CO
    def surface(z_c):
        return np.stack((x, (local + z_c * SI) / CO + y_shift, z_c + z_shift), axis=1)
    front, rear = surface(mid + half), surface(mid - half)
    vertices = centered(np.concatenate((front, rear)), (spec["width"], spec["thickness"], spec["depth"]))
    uv = np.stack(((ii + .5) / w, (jj + .5) / h), axis=1)
    return vertices, closed_faces(coverage, ids, count), np.concatenate((uv, uv))


def make_mesh(photo, slug, spec, out_path):
    if spec["profile"] in RINGS:
        vertices, faces, uv = rotational_body(photo, spec)
    else:
        vertices, faces, uv = ingredient_body(photo, spec)
    normals = vertex_normals(vertices, faces)
    lengths = np.linalg.norm(normals, axis=1)
    invalid = lengths < 1e-6
    normals[invalid] = (0, 1, 0)
    normals[~invalid] /= lengths[~invalid, None]
    texture = photo.copy()
    texture.thumbnail((660, 660), Image.Resampling.LANCZOS)
    glb = GLB()
    material = glb.material(spec["name"], texture=texture)
    glb.mesh(slug, [glb.primitive(vertices, normals, faces, material, uv=uv)])
    glb.write(out_path)
    return round(float(np.ptp(vertices[:, 1] * CO - vertices[:, 2] * SI)), 5)
