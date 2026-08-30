"""Run non-destructive mesh and 3MF package checks on final deliverables."""

from __future__ import annotations

import hashlib
import json
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path

import FreeCAD  # Initializes the bundled FreeCAD module path.
import Mesh


ROOT = Path(__file__).resolve().parents[1]
MANUFACTURING = ROOT / "Manufacturing"
WORKING = ROOT / "Source" / "Working"
NS = {"m": "http://schemas.microsoft.com/3dmanufacturing/core/2015/02"}


def checksum(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest().upper()


def inspect_stl(path: Path) -> dict:
    mesh = Mesh.Mesh(str(path))
    data = {
        "sha256": checksum(path),
        "bytes": path.stat().st_size,
        "facets": mesh.CountFacets,
        "points": mesh.CountPoints,
        "is_solid": bool(mesh.isSolid()),
    }
    for key, method_name in (
        ("non_manifold_edges", "countNonManifolds"),
        ("self_intersections", "countSelfIntersections"),
        ("degenerate_facets", "countDegenerations"),
    ):
        method = getattr(mesh, method_name, None)
        if callable(method):
            try:
                data[key] = int(method())
            except Exception as exc:
                data[key] = f"unavailable: {exc}"
    return data


def inspect_3mf(path: Path) -> dict:
    with zipfile.ZipFile(path) as archive:
        names = set(archive.namelist())
        required = {"[Content_Types].xml", "_rels/.rels", "3D/3dmodel.model"}
        root = ET.fromstring(archive.read("3D/3dmodel.model"))
        vertices = root.findall(".//m:vertex", NS)
        triangles = root.findall(".//m:triangle", NS)
        build_items = root.findall("m:build/m:item", NS)
    return {
        "sha256": checksum(path),
        "bytes": path.stat().st_size,
        "required_package_parts_present": required <= names,
        "vertices": len(vertices),
        "triangles": len(triangles),
        "build_items": len(build_items),
    }


def main() -> None:
    stls = sorted(MANUFACTURING.glob("*.stl"))
    packages = sorted(MANUFACTURING.glob("*.3mf"))
    report = {
        "stl": {path.name: inspect_stl(path) for path in stls},
        "3mf": {path.name: inspect_3mf(path) for path in packages},
    }
    report["all_stl_solid"] = all(item["is_solid"] for item in report["stl"].values())
    report["all_3mf_packages_valid"] = all(
        item["required_package_parts_present"] and item["build_items"] == 1
        for item in report["3mf"].values()
    )
    output = WORKING / "manufacturing-verification.json"
    output.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2))
    if not report["all_stl_solid"] or not report["all_3mf_packages_valid"]:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
