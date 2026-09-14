"""Report planar lid faces and vertical material intervals in the logo zone."""

from __future__ import annotations

import json
from pathlib import Path

import FreeCAD as App
import Part


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "Source" / "Working" / "WrenchWorks3D-Pi-5-AI-Case-Lid-BRep.FCStd"
OUTPUT = ROOT / "Source" / "Working" / "lid-surface-report.json"


def vector_values(vector: App.Vector) -> list[float]:
    return [vector.x, vector.y, vector.z]


def main() -> None:
    document = App.openDocument(str(SOURCE))
    shape = document.getObject("Original_Lid_BRep").Shape

    faces = []
    for index, face in enumerate(shape.Faces, start=1):
        u_min, u_max, v_min, v_max = face.ParameterRange
        u_mid = (u_min + u_max) / 2.0
        v_mid = (v_min + v_max) / 2.0
        try:
            normal = face.normalAt(u_mid, v_mid)
        except Exception:
            normal = App.Vector()
        surface_type = type(face.Surface).__name__
        if abs(normal.z) > 0.95 or face.Area > 250:
            bounds = face.BoundBox
            faces.append(
                {
                    "index": index,
                    "surface": surface_type,
                    "area_mm2": face.Area,
                    "normal": vector_values(normal),
                    "center": vector_values(face.CenterOfMass),
                    "bounds": {
                        "min": [bounds.XMin, bounds.YMin, bounds.ZMin],
                        "max": [bounds.XMax, bounds.YMax, bounds.ZMax],
                    },
                }
            )

    samples = []
    for x in (-22.0, -11.0, 0.0, 11.0, 22.0):
        for y in (-43.0, -38.0, -33.0, -28.0, -23.0):
            line = Part.makeLine(App.Vector(x, y, -20), App.Vector(x, y, 20))
            section = shape.section(line)
            z_values = sorted({round(vertex.Point.z, 6) for vertex in section.Vertexes})
            samples.append({"x": x, "y": y, "z_intersections": z_values})

    report = {"faces": faces, "logo_zone_vertical_samples": samples}
    with OUTPUT.open("w", encoding="utf-8") as handle:
        json.dump(report, handle, indent=2)
        handle.write("\n")
    print(json.dumps(report, indent=2))
    App.closeDocument(document.Name)


if __name__ == "__main__":
    main()
