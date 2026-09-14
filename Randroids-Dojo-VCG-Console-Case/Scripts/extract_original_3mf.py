"""Extract the untouched WrenchWorks3D lid/base meshes from the MakerWorld 3MF.

Run with FreeCADCmd so the exported STL files and FCStd source use FreeCAD's
mesh implementation rather than a hand-written file converter.
"""

from __future__ import annotations

import json
import sys
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path

import FreeCAD as App
import Mesh
import Part


ROOT = Path(__file__).resolve().parents[1]
ORIGINAL_3MF = ROOT / "Source" / "Original" / "WrenchWorks3D-Pi-5-AI-Case-Original.3mf"
WORKING = ROOT / "Source" / "Working"
MANUFACTURING = ROOT / "Manufacturing"
NS = {"m": "http://schemas.microsoft.com/3dmanufacturing/core/2015/02"}


def mesh_from_object(model_root: ET.Element, object_id: str) -> Mesh.Mesh:
    object_node = model_root.find(f".//m:object[@id='{object_id}']", NS)
    if object_node is None:
        raise RuntimeError(f"3MF object {object_id} not found")

    vertices_node = object_node.find("m:mesh/m:vertices", NS)
    triangles_node = object_node.find("m:mesh/m:triangles", NS)
    if vertices_node is None or triangles_node is None:
        raise RuntimeError(f"3MF object {object_id} has no direct mesh")

    vertices = [
        App.Vector(float(v.get("x")), float(v.get("y")), float(v.get("z")))
        for v in vertices_node.findall("m:vertex", NS)
    ]
    facets = []
    for triangle in triangles_node.findall("m:triangle", NS):
        facets.append(
            (
                vertices[int(triangle.get("v1"))],
                vertices[int(triangle.get("v2"))],
                vertices[int(triangle.get("v3"))],
            )
        )
    return Mesh.Mesh(facets)


def mesh_stats(mesh: Mesh.Mesh) -> dict[str, object]:
    bounds = mesh.BoundBox
    stats: dict[str, object] = {
        "facets": mesh.CountFacets,
        "points": mesh.CountPoints,
        "is_solid": bool(mesh.isSolid()),
        "bounds_mm": {
            "min": [bounds.XMin, bounds.YMin, bounds.ZMin],
            "max": [bounds.XMax, bounds.YMax, bounds.ZMax],
            "size": [bounds.XLength, bounds.YLength, bounds.ZLength],
        },
    }
    for label, method_name in (
        ("non_manifold_edges", "countNonManifolds"),
        ("self_intersections", "countSelfIntersections"),
        ("degenerate_facets", "countDegenerations"),
    ):
        method = getattr(mesh, method_name, None)
        if callable(method):
            try:
                stats[label] = int(method())
            except Exception as exc:  # FreeCAD APIs vary by build.
                stats[label] = f"unavailable: {exc}"
    return stats


def main() -> None:
    WORKING.mkdir(parents=True, exist_ok=True)
    MANUFACTURING.mkdir(parents=True, exist_ok=True)

    with zipfile.ZipFile(ORIGINAL_3MF) as archive:
        model_root = ET.fromstring(archive.read("3D/3dmodel.model"))

    # The Bambu model settings identify component object 4 as LID (mesh 1)
    # and component object 8 as BASE (mesh 5). Objects 2/3/6/7 are slicer-only
    # ironing modifiers and are intentionally not exported as geometry.
    lid_mesh = mesh_from_object(model_root, "1")
    base_mesh = mesh_from_object(model_root, "5")

    lid_stl = MANUFACTURING / "VCG-Console-Case-Lid-Original-Unbranded.stl"
    base_stl = MANUFACTURING / "VCG-Console-Case-Bottom.stl"
    lid_mesh.write(str(lid_stl))
    base_mesh.write(str(base_stl))

    doc = App.newDocument("WrenchWorks3D_Pi5_AI_Case_Original_Meshes")
    lid_object = doc.addObject("Mesh::Feature", "Original_Lid")
    lid_object.Label = "WrenchWorks3D Original Lid (Untouched)"
    lid_object.Mesh = lid_mesh
    base_object = doc.addObject("Mesh::Feature", "Original_Base")
    base_object.Label = "WrenchWorks3D Original Base (Untouched)"
    base_object.Mesh = base_mesh
    doc.recompute()
    doc.saveAs(str(WORKING / "WrenchWorks3D-Pi-5-AI-Case-Original-Meshes.FCStd"))

    # A BRep copy of the lid is useful for exact booleans while keeping the
    # original triangle mesh in the same document for comparison.
    lid_shell = Part.Shape()
    lid_shell.makeShapeFromMesh(lid_mesh.Topology, 0.03)
    if not lid_shell.isClosed():
        raise RuntimeError("The extracted lid mesh did not convert to a closed shell")
    lid_solid = Part.makeSolid(lid_shell).removeSplitter()
    lid_brep_doc = App.newDocument("WrenchWorks3D_Pi5_AI_Case_Lid_BRep")
    lid_brep = lid_brep_doc.addObject("PartDesign::Feature", "Original_Lid_BRep")
    lid_brep.Label = "WrenchWorks3D Original Lid BRep"
    lid_brep.Shape = lid_solid
    lid_brep.addProperty("App::PropertyString", "SourceLicense", "Provenance")
    lid_brep.SourceLicense = "CC0 / Creative Commons Public Domain"
    lid_brep.addProperty("App::PropertyString", "SourceURL", "Provenance")
    lid_brep.SourceURL = "https://makerworld.com/en/models/1876242-pi-5-ai-case"
    lid_brep_doc.recompute()
    lid_brep_doc.saveAs(str(WORKING / "WrenchWorks3D-Pi-5-AI-Case-Lid-BRep.FCStd"))

    stats = {
        "source": str(ORIGINAL_3MF),
        "source_sha256": "A2034E3A17823A7FBB460F96349D8554EFC17A57A0AB9F70B75931A0724384F4",
        "lid": mesh_stats(lid_mesh),
        "base": mesh_stats(base_mesh),
        "lid_brep": {
            "is_valid": bool(lid_solid.isValid()),
            "is_closed": bool(lid_solid.isClosed()),
            "solids": len(lid_solid.Solids),
            "volume_mm3": lid_solid.Volume,
        },
    }
    with (WORKING / "original-geometry-report.json").open("w", encoding="utf-8") as handle:
        json.dump(stats, handle, indent=2)
        handle.write("\n")

    print(json.dumps(stats, indent=2))


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        raise
