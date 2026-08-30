"""Derive FDM-safe vector contours from the actual local Dojo wordmark.

This is a trace of the supplied 5120x1440 raster artwork, not a recreated
font treatment. Diagnostic crops and masks are preserved beside the SVG so
the derivation remains auditable and revisable.
"""

from __future__ import annotations

import json
import math
import os
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter


ROOT = Path(__file__).resolve().parents[1]
SOURCE_ENV = "RANDROIDS_DOJO_LOGO_SOURCE"
source_value = os.environ.get(SOURCE_ENV)
if not source_value:
    raise SystemExit(f"Set {SOURCE_ENV} to the owner-supplied logo image path.")
SOURCE = Path(source_value).expanduser().resolve()
WORKING = ROOT / "Source" / "Working" / "Logo-Trace"

# Tight crop around the two-line Randroid's Dojo wordmark in the actual art.
# The bounds were derived from connected-component measurements of the full
# 5120 x 1440 source image, leaving a small margin around every letter and the
# apostrophe while excluding the Raspberry Pi robot on the left.
CROP_BOX = (1760, 160, 4160, 1260)
PIXELS_PER_MM = 20.0
MAX_WIDTH_MM = 44.0
MAX_HEIGHT_MM = 19.0
PLACEMENT_CENTER_X_MM = 0.0
PLACEMENT_CENTER_Y_MM = -35.0
LID_ORIENTATION_TRANSFORM = "mirror_x_for_front_edge_view"


def orient_on_lid(x: float, y: float) -> tuple[float, float]:
    """Orient artwork so it reads upright from the case's port/front edge."""
    if LID_ORIENTATION_TRANSFORM == "mirror_x_for_front_edge_view":
        return (
            2 * PLACEMENT_CENTER_X_MM - x,
            y,
        )
    return x, y


def connected_components(mask: np.ndarray) -> list[list[tuple[int, int]]]:
    height, width = mask.shape
    visited = np.zeros_like(mask, dtype=bool)
    components: list[list[tuple[int, int]]] = []
    for y in range(height):
        for x in range(width):
            if not mask[y, x] or visited[y, x]:
                continue
            queue = deque([(x, y)])
            visited[y, x] = True
            component: list[tuple[int, int]] = []
            while queue:
                px, py = queue.popleft()
                component.append((px, py))
                for nx, ny in ((px - 1, py), (px + 1, py), (px, py - 1), (px, py + 1)):
                    if 0 <= nx < width and 0 <= ny < height and mask[ny, nx] and not visited[ny, nx]:
                        visited[ny, nx] = True
                        queue.append((nx, ny))
            components.append(component)
    return components


def keep_printable_components(mask: np.ndarray, minimum_pixels: int = 80) -> np.ndarray:
    result = np.zeros_like(mask, dtype=bool)
    for component in connected_components(mask):
        if len(component) >= minimum_pixels:
            for x, y in component:
                result[y, x] = True
    return result


def fill_small_holes(mask: np.ndarray, maximum_pixels: int = 80) -> np.ndarray:
    """Fill enclosed raster texture voids, retaining deliberate letter counters."""
    result = mask.copy()
    height, width = mask.shape
    for component in connected_components(~mask):
        touches_border = any(x in (0, width - 1) or y in (0, height - 1) for x, y in component)
        if not touches_border and len(component) <= maximum_pixels:
            for x, y in component:
                result[y, x] = True
    return result


def connect_stacked_components(mask: np.ndarray, bridge_pixels: int = 16) -> tuple[np.ndarray, dict | None]:
    """Join two stacked word lines at their closest vertical approach.

    The 0.8 mm bridge acts as a print carrier inside the source artwork's heavy
    outline area, allowing the contrasting inlay to be installed as one part.
    """
    components = sorted(connected_components(mask), key=lambda component: min(y for _, y in component))
    if len(components) != 2:
        return mask, None
    upper, lower = components
    upper_by_x: dict[int, int] = {}
    lower_by_x: dict[int, int] = {}
    for x, y in upper:
        upper_by_x[x] = max(y, upper_by_x.get(x, y))
    for x, y in lower:
        lower_by_x[x] = min(y, lower_by_x.get(x, y))
    candidates = [
        (lower_by_x[x] - upper_by_x[x], x, upper_by_x[x], lower_by_x[x])
        for x in upper_by_x.keys() & lower_by_x.keys()
        if lower_by_x[x] > upper_by_x[x]
    ]
    if not candidates:
        return mask, None
    gap, x, y1, y2 = min(candidates)
    result = mask.copy()
    half = bridge_pixels // 2
    result[max(0, y1 - 1) : min(mask.shape[0], y2 + 2), max(0, x - half) : min(mask.shape[1], x + half)] = True
    return result, {
        "center_pixel": [x, (y1 + y2) / 2.0],
        "width_mm": bridge_pixels / PIXELS_PER_MM,
        "gap_mm": gap / PIXELS_PER_MM,
    }


def connect_small_component(mask: np.ndarray, bridge_pixels: int = 16) -> tuple[np.ndarray, dict | None]:
    """Attach the small apostrophe carrier to the nearest main word line."""
    components = connected_components(mask)
    if len(components) < 3:
        return mask, None
    small = min(components, key=len)
    others = [component for component in components if component is not small]
    sx = sum(x for x, _ in small) / len(small)
    sy = sum(y for _, y in small) / len(small)
    nearest = min(
        (point for component in others for point in component),
        key=lambda point: (point[0] - sx) ** 2 + (point[1] - sy) ** 2,
    )
    canvas = Image.fromarray((mask * 255).astype(np.uint8), mode="L")
    draw = ImageDraw.Draw(canvas)
    draw.line([(round(sx), round(sy)), nearest], fill=255, width=bridge_pixels)
    result = np.asarray(canvas) > 127
    return result, {
        "kind": "apostrophe carrier",
        "start_pixel": [round(sx), round(sy)],
        "end_pixel": list(nearest),
        "width_mm": bridge_pixels / PIXELS_PER_MM,
    }


def connect_all_components(mask: np.ndarray, bridge_pixels: int = 16) -> tuple[np.ndarray, list[dict]]:
    """Join letter components with minimum-distance, nozzle-width carriers."""
    result = mask.copy()
    bridges: list[dict] = []
    while True:
        components = connected_components(result)
        if len(components) <= 1:
            return result, bridges

        boxes = []
        for component in components:
            xs = [point[0] for point in component]
            ys = [point[1] for point in component]
            boxes.append((min(xs), min(ys), max(xs), max(ys)))

        def box_distance(pair: tuple[int, int]) -> float:
            a = boxes[pair[0]]
            b = boxes[pair[1]]
            dx = max(a[0] - b[2], b[0] - a[2], 0)
            dy = max(a[1] - b[3], b[1] - a[3], 0)
            return dx * dx + dy * dy

        pair = min(
            ((i, j) for i in range(len(components)) for j in range(i + 1, len(components))),
            key=box_distance,
        )
        first, second = components[pair[0]], components[pair[1]]
        cx = sum(x for x, _ in second) / len(second)
        cy = sum(y for _, y in second) / len(second)
        start = min(first, key=lambda point: (point[0] - cx) ** 2 + (point[1] - cy) ** 2)
        end = min(second, key=lambda point: (point[0] - start[0]) ** 2 + (point[1] - start[1]) ** 2)

        canvas = Image.fromarray((result * 255).astype(np.uint8), mode="L")
        ImageDraw.Draw(canvas).line([start, end], fill=255, width=bridge_pixels)
        result = np.asarray(canvas) > 127
        bridges.append(
            {
                "kind": "minimum-distance letter carrier",
                "start_pixel": list(start),
                "end_pixel": list(end),
                "width_mm": bridge_pixels / PIXELS_PER_MM,
            }
        )


def boundary_loops(mask: np.ndarray) -> list[list[tuple[int, int]]]:
    """Trace grid-aligned boundary loops around a four-connected pixel mask."""
    padded = np.pad(mask, 1, constant_values=False)
    edges: dict[tuple[int, int], list[tuple[int, int]]] = {}

    def add_edge(start: tuple[int, int], end: tuple[int, int]) -> None:
        edges.setdefault(start, []).append(end)

    height, width = padded.shape
    for y in range(1, height - 1):
        for x in range(1, width - 1):
            if not padded[y, x]:
                continue
            if not padded[y - 1, x]:
                add_edge((x, y), (x + 1, y))
            if not padded[y, x + 1]:
                add_edge((x + 1, y), (x + 1, y + 1))
            if not padded[y + 1, x]:
                add_edge((x + 1, y + 1), (x, y + 1))
            if not padded[y, x - 1]:
                add_edge((x, y + 1), (x, y))

    unused = {(start, end) for start, ends in edges.items() for end in ends}
    loops: list[list[tuple[int, int]]] = []
    while unused:
        start_edge = min(unused)
        start, current = start_edge
        unused.remove(start_edge)
        loop = [start, current]
        previous = start
        while current != start:
            candidates = [end for end in edges.get(current, []) if (current, end) in unused]
            if not candidates:
                raise RuntimeError(f"Open contour at {current}")
            if len(candidates) > 1:
                # Prefer the tightest clockwise continuation at a rare diagonal junction.
                in_angle = math.atan2(current[1] - previous[1], current[0] - previous[0])
                candidates.sort(
                    key=lambda point: (
                        math.atan2(point[1] - current[1], point[0] - current[0]) - in_angle
                    )
                    % (2 * math.pi)
                )
            next_point = candidates[0]
            unused.remove((current, next_point))
            previous, current = current, next_point
            loop.append(current)
        loops.append(loop)
    return loops


def remove_collinear(points: list[tuple[float, float]]) -> list[tuple[float, float]]:
    if len(points) < 4:
        return points
    ring = points[:-1] if points[0] == points[-1] else points[:]
    changed = True
    while changed and len(ring) > 3:
        changed = False
        output = []
        for index, point in enumerate(ring):
            previous = ring[index - 1]
            following = ring[(index + 1) % len(ring)]
            cross = (point[0] - previous[0]) * (following[1] - point[1]) - (
                point[1] - previous[1]
            ) * (following[0] - point[0])
            if abs(cross) < 1e-9:
                changed = True
            else:
                output.append(point)
        ring = output
    return ring + [ring[0]]


def signed_area(points: list[tuple[float, float]]) -> float:
    return 0.5 * sum(
        x1 * y2 - x2 * y1 for (x1, y1), (x2, y2) in zip(points, points[1:])
    )


def normalize_outer_clockwise(loops: list[list[tuple[float, float]]]) -> list[list[tuple[float, float]]]:
    """Keep the largest/outer loop negative after any reflection transform."""
    largest = max(loops, key=lambda loop: abs(signed_area(loop)))
    if signed_area(largest) > 0:
        return [list(reversed(loop)) for loop in loops]
    return loops


def main() -> None:
    WORKING.mkdir(parents=True, exist_ok=True)
    source = Image.open(SOURCE).convert("RGB")
    crop = source.crop(CROP_BOX)
    crop.save(WORKING / "actual-logo-source-crop.png")

    # Work at a manageable resolution, preserving enough detail for 0.05 mm
    # contour steps in the eventual 44 mm-wide insert.
    analysis_width = int(MAX_WIDTH_MM * PIXELS_PER_MM)
    analysis_height = round(crop.height * analysis_width / crop.width)
    resized = crop.resize((analysis_width, analysis_height), Image.Resampling.LANCZOS)
    rgb = np.asarray(resized).astype(np.int16)
    red, green, blue = rgb[:, :, 0], rgb[:, :, 1], rgb[:, :, 2]

    # Select the cream/gold letter fills from the real wordmark. The measured
    # crop excludes surrounding workshop props, so no invented artwork or font
    # reconstruction enters the trace.
    gold = (
        (red > 145)
        & (green > 90)
        & (blue < 210)
        & ((red - blue) > 28)
        & ((red + green + blue) > 390)
    )
    region = np.zeros_like(gold, dtype=bool)
    h, w = gold.shape
    # The measured line boxes retain all letter fills while excluding the
    # gold-toned props visible at the lower corners of the raster crop.
    region[0 : int(h * 0.50), int(w * 0.01) : int(w * 0.99)] = True
    region[int(h * 0.45) : h, int(w * 0.18) : int(w * 0.84)] = True
    gold &= region
    raw_mask = Image.fromarray((gold * 255).astype(np.uint8), mode="L")
    raw_mask.save(WORKING / "actual-logo-gold-mask-raw.png")

    # Expand the actual letter contours into the heavy connected outline seen
    # in the source art. Net growth is about 0.2 mm, intentionally removing
    # details that a normal 0.4 mm FDM nozzle cannot reproduce reliably.
    printable = raw_mask.filter(ImageFilter.MaxFilter(11)).filter(ImageFilter.MinFilter(3))
    printable_array = np.asarray(printable) > 127
    printable_array = keep_printable_components(printable_array, minimum_pixels=80)

    ys, xs = np.nonzero(printable_array)
    if len(xs) == 0:
        raise RuntimeError("Logo segmentation produced an empty mask")
    printable_array = printable_array[ys.min() : ys.max() + 1, xs.min() : xs.max() + 1]

    # Fit the trace into the verified clear lid band while retaining the source
    # artwork's aspect ratio.
    source_h, source_w = printable_array.shape
    scale = min(
        MAX_WIDTH_MM * PIXELS_PER_MM / source_w,
        MAX_HEIGHT_MM * PIXELS_PER_MM / source_h,
    )
    fitted_w = max(1, round(source_w * scale))
    fitted_h = max(1, round(source_h * scale))
    fitted = Image.fromarray((printable_array * 255).astype(np.uint8), mode="L").resize(
        (fitted_w, fitted_h), Image.Resampling.NEAREST
    )
    fitted_array = np.asarray(fitted) > 127

    # Pad and close once more to eliminate diagonal-only contacts before tracing.
    fitted = Image.fromarray((fitted_array * 255).astype(np.uint8), mode="L")
    fitted = fitted.filter(ImageFilter.MaxFilter(3)).filter(ImageFilter.MinFilter(3))
    fitted_array = keep_printable_components(np.asarray(fitted) > 127, minimum_pixels=150)
    # Voids below 0.625 mm2 are raster texture, not meaningful counters, and
    # would tessellate into sub-nozzle non-manifold detail.
    fitted_array = fill_small_holes(fitted_array, maximum_pixels=250)
    fitted_array, carrier_bridges = connect_all_components(fitted_array, bridge_pixels=16)
    fitted_array = fill_small_holes(fitted_array, maximum_pixels=250)
    Image.fromarray((fitted_array * 255).astype(np.uint8), mode="L").save(
        WORKING / "actual-logo-mask-fdm-fitted.png"
    )

    # Five pixels at 20 px/mm adds the required 0.25 mm clearance on every
    # outer edge while reducing each counter by the same amount.
    cavity_array = np.asarray(
        Image.fromarray((fitted_array * 255).astype(np.uint8), mode="L").filter(
            ImageFilter.MaxFilter(11)
        )
    ) > 127
    cavity_array = fill_small_holes(cavity_array, maximum_pixels=250)
    Image.fromarray((cavity_array * 255).astype(np.uint8), mode="L").save(
        WORKING / "actual-logo-mask-cavity-clearance.png"
    )

    loops_px = boundary_loops(fitted_array)
    width_mm = fitted_array.shape[1] / PIXELS_PER_MM
    height_mm = fitted_array.shape[0] / PIXELS_PER_MM
    origin_x = PLACEMENT_CENTER_X_MM - width_mm / 2.0
    origin_y = PLACEMENT_CENTER_Y_MM + height_mm / 2.0

    loops_mm: list[list[tuple[float, float]]] = []
    for loop in loops_px:
        converted = [
            orient_on_lid(
                origin_x + (x - 1) / PIXELS_PER_MM,
                origin_y - (y - 1) / PIXELS_PER_MM,
            )
            for x, y in loop
        ]
        loops_mm.append(remove_collinear(converted))

    cavity_loops_mm: list[list[tuple[float, float]]] = []
    for loop in boundary_loops(cavity_array):
        converted = [
            orient_on_lid(
                origin_x + (x - 1) / PIXELS_PER_MM,
                origin_y - (y - 1) / PIXELS_PER_MM,
            )
            for x, y in loop
        ]
        cavity_loops_mm.append(remove_collinear(converted))

    loops_mm = normalize_outer_clockwise(loops_mm)
    cavity_loops_mm = normalize_outer_clockwise(cavity_loops_mm)

    svg_paths = []
    for loop in loops_mm:
        commands = [f"M {loop[0][0]:.4f},{-loop[0][1]:.4f}"]
        commands.extend(f"L {x:.4f},{-y:.4f}" for x, y in loop[1:])
        commands.append("Z")
        svg_paths.append(" ".join(commands))
    svg = (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="-31.25 -47.5 62.5 95">\n'
        f'  <path d="{" ".join(svg_paths)}" fill="#d6a43b" fill-rule="evenodd"/>\n'
        "</svg>\n"
    )
    (WORKING / "Randroids-Dojo-Actual-Logo-FDM.svg").write_text(svg, encoding="utf-8")

    report = {
        "source": str(SOURCE),
        "source_crop_pixels": list(CROP_BOX),
        "trace_method": "cream/gold fill threshold from actual artwork, morphologically expanded for 0.4 mm FDM",
        "pixels_per_mm": PIXELS_PER_MM,
        "fitted_size_mm": [width_mm, height_mm],
        "placement_center_mm": [PLACEMENT_CENTER_X_MM, PLACEMENT_CENTER_Y_MM],
        "lid_orientation_transform": LID_ORIENTATION_TRANSFORM,
        "solid_components": len(connected_components(fitted_array)),
        "carrier_bridges": carrier_bridges,
        "contour_loops": len(loops_mm),
        "contour_areas_mm2": [signed_area(loop) for loop in loops_mm],
        "loops_mm": loops_mm,
        "cavity_xy_clearance_mm": 0.25,
        "cavity_contour_areas_mm2": [signed_area(loop) for loop in cavity_loops_mm],
        "cavity_loops_mm": cavity_loops_mm,
    }
    with (WORKING / "Randroids-Dojo-Actual-Logo-FDM.json").open("w", encoding="utf-8") as handle:
        json.dump(report, handle, indent=2)
        handle.write("\n")
    print(json.dumps({key: value for key, value in report.items() if not key.endswith("loops_mm")}, indent=2))


if __name__ == "__main__":
    main()
