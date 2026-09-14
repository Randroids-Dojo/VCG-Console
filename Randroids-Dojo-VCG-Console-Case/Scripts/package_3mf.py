"""Package the final manufacturing STL meshes as standards-based 3MF files."""

from __future__ import annotations

import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET

import FreeCAD  # Initializes FreeCAD's bundled module search path.
import Mesh


ROOT = Path(__file__).resolve().parents[1]
MANUFACTURING = ROOT / "Manufacturing"
CORE = "http://schemas.microsoft.com/3dmanufacturing/core/2015/02"
REL = "http://schemas.openxmlformats.org/package/2006/relationships"
CONTENT = "http://schemas.openxmlformats.org/package/2006/content-types"


def package(stl_name: str, output_name: str, title: str, description: str) -> None:
    mesh = Mesh.Mesh(str(MANUFACTURING / stl_name))
    points, facets = mesh.Topology

    ET.register_namespace("", CORE)
    model = ET.Element(f"{{{CORE}}}model", {"unit": "millimeter", "xml:lang": "en-US"})
    for name, value in (
        ("Title", title),
        ("Designer", "WrenchWorks3D; Randroid's Dojo customization"),
        ("Description", description),
        ("License", "CC0 / Creative Commons Public Domain"),
        ("Application", "FreeCAD 1.1.3 and project packaging script"),
    ):
        node = ET.SubElement(model, f"{{{CORE}}}metadata", {"name": name})
        node.text = value
    resources = ET.SubElement(model, f"{{{CORE}}}resources")
    obj = ET.SubElement(resources, f"{{{CORE}}}object", {"id": "1", "type": "model", "name": title})
    mesh_node = ET.SubElement(obj, f"{{{CORE}}}mesh")
    vertices = ET.SubElement(mesh_node, f"{{{CORE}}}vertices")
    for point in points:
        ET.SubElement(
            vertices,
            f"{{{CORE}}}vertex",
            {"x": f"{point.x:.8f}", "y": f"{point.y:.8f}", "z": f"{point.z:.8f}"},
        )
    triangles = ET.SubElement(mesh_node, f"{{{CORE}}}triangles")
    for facet in facets:
        ET.SubElement(
            triangles,
            f"{{{CORE}}}triangle",
            {"v1": str(facet[0]), "v2": str(facet[1]), "v3": str(facet[2])},
        )
    build = ET.SubElement(model, f"{{{CORE}}}build")
    ET.SubElement(build, f"{{{CORE}}}item", {"objectid": "1"})

    ET.register_namespace("", REL)
    relationships = ET.Element(f"{{{REL}}}Relationships")
    ET.SubElement(
        relationships,
        f"{{{REL}}}Relationship",
        {
            "Target": "/3D/3dmodel.model",
            "Id": "rel0",
            "Type": "http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel",
        },
    )

    ET.register_namespace("", CONTENT)
    content_types = ET.Element(f"{{{CONTENT}}}Types")
    ET.SubElement(
        content_types,
        f"{{{CONTENT}}}Default",
        {"Extension": "rels", "ContentType": "application/vnd.openxmlformats-package.relationships+xml"},
    )
    ET.SubElement(
        content_types,
        f"{{{CONTENT}}}Default",
        {"Extension": "model", "ContentType": "application/vnd.ms-package.3dmanufacturing-3dmodel+xml"},
    )

    destination = MANUFACTURING / output_name
    with zipfile.ZipFile(destination, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("[Content_Types].xml", ET.tostring(content_types, encoding="utf-8", xml_declaration=True))
        archive.writestr("_rels/.rels", ET.tostring(relationships, encoding="utf-8", xml_declaration=True))
        archive.writestr("3D/3dmodel.model", ET.tostring(model, encoding="utf-8", xml_declaration=True))
    print(f"{destination.name}: {len(points)} vertices, {len(facets)} triangles, solid={mesh.isSolid()}")


def main() -> None:
    package(
        "VCG-Console-Case-Bottom.stl",
        "VCG-Console-Case-Bottom.3mf",
        "VCG Console Case Bottom",
        "Untouched WrenchWorks3D Raspberry Pi 5 AI HAT case bottom.",
    )
    package(
        "VCG-Console-Case-Lid-Randroids-Dojo.stl",
        "VCG-Console-Case-Lid-Randroids-Dojo.3mf",
        "VCG Console Case Lid - Randroid's Dojo",
        "WrenchWorks3D Raspberry Pi 5 AI HAT lid with a 1.0 mm Randroid's Dojo inlay recess.",
    )
    package(
        "VCG-Console-Randroids-Dojo-Logo-Insert.stl",
        "VCG-Console-Randroids-Dojo-Logo-Insert.3mf",
        "Randroid's Dojo Logo Insert",
        "Contrasting-color PETG inlay with 0.25 mm nominal XY clearance and 0.9 mm thickness.",
    )


if __name__ == "__main__":
    main()
