"""Build the branded lid and FDM-toleranced contrasting logo insert.

The original WrenchWorks3D dimensions remain untouched outside the verified
clear lower-lid band.  The actual local Randroid's Dojo wordmark trace is cut
1.0 mm into the 2.5 mm panel, and a 0.9 mm insert is given 0.25 mm clearance
per side plus 0.1 mm total depth clearance.
"""

from __future__ import annotations

import json
from pathlib import Path

import FreeCAD as App
import Mesh
import MeshPart
import Part


ROOT = Path(__file__).resolve().parents[1]
WORKING = ROOT / "Source" / "Working"
MANUFACTURING = ROOT / "Manufacturing"
LOGO_REPORT = WORKING / "Logo-Trace" / "Randroids-Dojo-Actual-Logo-FDM.json"
LID_BREP = WORKING / "WrenchWorks3D-Pi-5-AI-Case-Lid-BRep.FCStd"
ORIGINAL_MESHES = WORKING / "WrenchWorks3D-Pi-5-AI-Case-Original-Meshes.FCStd"

OUTSIDE_Z_MM = -14.130133
RECESS_DEPTH_MM = 1.0
INSERT_THICKNESS_MM = 0.9
INSERT_TOP_RECESS_MM = 0.05
XY_CLEARANCE_MM = 0.25
TESSELLATION_LINEAR_MM = 0.05
TESSELLATION_ANGULAR_RAD = 0.35


def polygon_face(loop: list[list[float]], z: float) -> Part.Shape:
    points = [App.Vector(float(x), float(y), z) for x, y in loop]
    if not points[0].isEqual(points[-1], 1e-8):
        points.append(points[0])
    wire = Part.makePolygon(points)
    face = Part.Face(wire)
    if face.isNull() or not face.isValid():
        raise RuntimeError("Logo contour did not produce a valid planar face")
    return face


def make_logo_face(report: dict, z: float, loops_key: str, areas_key: str) -> Part.Shape:
    loops = report[loops_key]
    areas = report[areas_key]
    outer_faces = [polygon_face(loop, z) for loop, area in zip(loops, areas) if area < 0]
    hole_faces = [polygon_face(loop, z) for loop, area in zip(loops, areas) if area > 0]
    if len(outer_faces) != 1:
        raise RuntimeError(f"Expected one connected logo carrier, found {len(outer_faces)}")
    face = outer_faces[0]
    for hole in hole_faces:
        face = face.cut(hole)
    if face.isNull() or not face.isValid():
        raise RuntimeError("Logo face became invalid after preserving letter counters")
    return face.removeSplitter()


def mesh_from_shape(shape: Part.Shape) -> Mesh.Mesh:
    return MeshPart.meshFromShape(
        Shape=shape,
        LinearDeflection=TESSELLATION_LINEAR_MM,
        AngularDeflection=TESSELLATION_ANGULAR_RAD,
        Relative=False,
    )


def shape_stats(shape: Part.Shape) -> dict:
    bounds = shape.BoundBox
    return {
        "is_valid": bool(shape.isValid()),
        "is_closed": bool(shape.isClosed()),
        "solids": len(shape.Solids),
        "volume_mm3": shape.Volume,
        "bounds_mm": {
            "min": [bounds.XMin, bounds.YMin, bounds.ZMin],
            "max": [bounds.XMax, bounds.YMax, bounds.ZMax],
            "size": [bounds.XLength, bounds.YLength, bounds.ZLength],
        },
    }


def mesh_stats(mesh: Mesh.Mesh) -> dict:
    bounds = mesh.BoundBox
    return {
        "facets": mesh.CountFacets,
        "points": mesh.CountPoints,
        "is_solid": bool(mesh.isSolid()),
        "bounds_mm": {
            "min": [bounds.XMin, bounds.YMin, bounds.ZMin],
            "max": [bounds.XMax, bounds.YMax, bounds.ZMax],
            "size": [bounds.XLength, bounds.YLength, bounds.ZLength],
        },
    }


def main() -> None:
    MANUFACTURING.mkdir(parents=True, exist_ok=True)
    report = json.loads(LOGO_REPORT.read_text(encoding="utf-8"))
    if report["solid_components"] != 1:
        raise RuntimeError("Logo trace is not a single printable carrier")

    source_doc = App.openDocument(str(LID_BREP))
    original_lid = source_doc.getObject("Original_Lid_BRep").Shape.copy()
    if not original_lid.isValid() or not original_lid.isClosed():
        raise RuntimeError("Source lid BRep is not a valid closed solid")

    logo_face = make_logo_face(
        report,
        OUTSIDE_Z_MM + INSERT_TOP_RECESS_MM,
        "loops_mm",
        "contour_areas_mm2",
    )
    # The trace script grows the raster carrier by exactly 0.25 mm before
    # contouring, avoiding fragile offsets on the complex letter outline.
    cavity_face = make_logo_face(
        report,
        OUTSIDE_Z_MM - 0.01,
        "cavity_loops_mm",
        "cavity_contour_areas_mm2",
    )
    cavity_tool = cavity_face.extrude(App.Vector(0, 0, RECESS_DEPTH_MM + 0.02))
    branded_lid = original_lid.cut(cavity_tool).removeSplitter()
    insert = logo_face.extrude(App.Vector(0, 0, INSERT_THICKNESS_MM)).removeSplitter()

    for name, shape in (("branded lid", branded_lid), ("logo insert", insert)):
        if shape.isNull() or not shape.isValid() or not shape.isClosed() or len(shape.Solids) != 1:
            raise RuntimeError(f"Final {name} is not one valid closed solid")

    final_doc = App.newDocument("Randroids_Dojo_VCG_Console_Case")
    source = final_doc.addObject("PartDesign::Feature", "Original_Lid_Reference")
    source.Label = "WrenchWorks3D Original Lid Reference"
    source.Shape = original_lid
    source.Visibility = False

    lid_obj = final_doc.addObject("PartDesign::Feature", "Branded_Lid")
    lid_obj.Label = "VCG Console Lid - Randroid's Dojo"
    lid_obj.Shape = branded_lid
    insert_obj = final_doc.addObject("PartDesign::Feature", "Logo_Insert")
    insert_obj.Label = "Randroid's Dojo Contrasting Logo Insert"
    insert_obj.Shape = insert
    tool_obj = final_doc.addObject("PartDesign::Feature", "Logo_Cavity_Tool")
    tool_obj.Label = "Logo Cavity Tool (0.25 mm XY clearance)"
    tool_obj.Shape = cavity_tool
    tool_obj.Visibility = False

    original_doc = App.openDocument(str(ORIGINAL_MESHES))
    bottom_ref = final_doc.addObject("Mesh::Feature", "Original_Bottom_Reference")
    bottom_ref.Label = "WrenchWorks3D Original Bottom (Untouched)"
    bottom_ref.Mesh = original_doc.getObject("Original_Base").Mesh.copy()
    bottom_ref.Visibility = False

    for obj in (lid_obj, insert_obj):
        obj.addProperty("App::PropertyString", "SourceDesign", "Provenance")
        obj.SourceDesign = "WrenchWorks3D Pi 5 AI Case"
        obj.addProperty("App::PropertyString", "SourceURL", "Provenance")
        obj.SourceURL = "https://makerworld.com/en/models/1876242-pi-5-ai-case"
        obj.addProperty("App::PropertyString", "SourceLicense", "Provenance")
        obj.SourceLicense = "CC0 / Creative Commons Public Domain"
        obj.addProperty("App::PropertyString", "LogoSource", "Provenance")
        obj.LogoSource = "owner-supplied:randroids-dojo-raspberry-pi.png"
        obj.addProperty("App::PropertyLength", "RecessDepth", "Manufacturing")
        obj.RecessDepth = RECESS_DEPTH_MM
        obj.addProperty("App::PropertyLength", "XYClearancePerSide", "Manufacturing")
        obj.XYClearancePerSide = XY_CLEARANCE_MM

    final_doc.recompute()
    fcstd_path = WORKING / "Randroids-Dojo-VCG-Console-Case.FCStd"
    final_doc.saveAs(str(fcstd_path))

    lid_step = WORKING / "VCG-Console-Case-Lid-Randroids-Dojo.step"
    insert_step = WORKING / "VCG-Console-Randroids-Dojo-Logo-Insert.step"
    Part.export([lid_obj], str(lid_step))
    Part.export([insert_obj], str(insert_step))

    lid_mesh = mesh_from_shape(branded_lid)
    insert_mesh = mesh_from_shape(insert)
    lid_stl = MANUFACTURING / "VCG-Console-Case-Lid-Randroids-Dojo.stl"
    insert_stl = MANUFACTURING / "VCG-Console-Randroids-Dojo-Logo-Insert.stl"
    lid_mesh.write(str(lid_stl))
    insert_mesh.write(str(insert_stl))

    final_report = {
        "design": {
            "recess_depth_mm": RECESS_DEPTH_MM,
            "insert_thickness_mm": INSERT_THICKNESS_MM,
            "insert_top_recess_mm": INSERT_TOP_RECESS_MM,
            "xy_clearance_per_side_mm": XY_CLEARANCE_MM,
            "verified_original_panel_thickness_mm": 2.5,
            "remaining_wall_below_recess_mm": 1.5,
            "logo_size_mm": report["fitted_size_mm"],
            "logo_center_mm": report["placement_center_mm"],
            "logo_carrier_bridges": report["carrier_bridges"],
        },
        "branded_lid_brep": shape_stats(branded_lid),
        "logo_insert_brep": shape_stats(insert),
        "branded_lid_mesh": mesh_stats(lid_mesh),
        "logo_insert_mesh": mesh_stats(insert_mesh),
        "files": {
            "editable_fcstd": str(fcstd_path),
            "lid_step": str(lid_step),
            "insert_step": str(insert_step),
            "lid_stl": str(lid_stl),
            "insert_stl": str(insert_stl),
        },
    }
    report_path = WORKING / "final-geometry-report.json"
    report_path.write_text(json.dumps(final_report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(final_report, indent=2))


if __name__ == "__main__":
    main()
