"""Render manufacturing previews of the branded case and separate inlay."""

from __future__ import annotations

from pathlib import Path

import FreeCAD as App
import FreeCADGui as Gui


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "Source" / "Working" / "Randroids-Dojo-VCG-Console-Case.FCStd"
PREVIEWS = ROOT / "Previews" / "Final"

BLACK = (0.24, 0.26, 0.30)
RED = (0.83, 0.18, 0.18)
EDGE = (0.32, 0.34, 0.38)


def placement(values: list[float], display_offset_z: float) -> App.Placement:
    matrix = App.Matrix()
    matrix.A11, matrix.A12, matrix.A13, matrix.A14 = values[0:4]
    matrix.A21, matrix.A22, matrix.A23, matrix.A24 = values[4:8]
    matrix.A31, matrix.A32, matrix.A33, matrix.A34 = values[8:12]
    # MakerWorld's separate `offset` field is an assembly-view centroid hint,
    # not an additional part transform; applying it creates a false shell gap.
    return App.Placement(matrix)


def save(view, filename: str, orientation: str, width: int = 1800, height: int = 1300) -> None:
    getattr(view, orientation)()
    Gui.updateGui()
    view.fitAll()
    Gui.updateGui()
    view.saveImage(str(PREVIEWS / filename), width, height, "Current")


def global_rotation(degrees: float) -> App.Placement:
    return App.Placement(App.Vector(), App.Rotation(App.Vector(1, 0, 0), degrees))


def main() -> None:
    PREVIEWS.mkdir(parents=True, exist_ok=True)
    Gui.showMainWindow()
    source = App.openDocument(str(SOURCE))
    render = App.newDocument("Randroids_Dojo_Case_Render")

    lid = render.addObject("PartDesign::Feature", "Lid")
    lid.Shape = source.getObject("Branded_Lid").Shape.copy()
    insert = render.addObject("PartDesign::Feature", "Insert")
    insert.Shape = source.getObject("Logo_Insert").Shape.copy()
    base = render.addObject("Mesh::Feature", "Base")
    base.Mesh = source.getObject("Original_Bottom_Reference").Mesh.copy()

    # Exact MakerWorld assembly transforms from Metadata/model_settings.config.
    lid_placement = placement(
        [-1, 0, 0, 0, 0, -1, 0, 0, 0, 0, 1, 14.130127906799316],
        -3.831997275352478,
    )
    base_placement = placement(
        [
            0.9999952075031329,
            0.0030959603947465874,
            0,
            0,
            0.0030959603947465874,
            -0.9999952075031329,
            0,
            0,
            0,
            0,
            -1.0000000000000004,
            21.793061017990112,
        ],
        3.830935835838318,
    )
    lid.Placement = lid_placement
    insert.Placement = lid_placement
    base.Placement = base_placement
    render.recompute()

    lid.ViewObject.ShapeColor = BLACK
    base.ViewObject.ShapeColor = BLACK
    insert.ViewObject.ShapeColor = RED
    for obj in (lid, base, insert):
        obj.ViewObject.LineColor = EDGE
        obj.ViewObject.DisplayMode = "Shaded"

    view = Gui.getDocument(render.Name).activeView()
    # Normalize each requested physical face toward FreeCAD's +Z camera. The
    # source parts were authored in print orientation with the lid exterior on
    # negative Z, so named viewport directions alone are misleading.
    top_rotation = App.Placement(
        App.Vector(), App.Rotation(App.Vector(0, 0, 1), 180)
    ).multiply(global_rotation(180))
    lid.Placement = top_rotation
    insert.Placement = top_rotation
    # From directly above the assembled case, the lid fully occludes the base.
    # Hiding the dense base mesh avoids coplanar preview z-fighting.
    base.ViewObject.Visibility = False
    save(view, "VCG-Console-Case-Assembled-Top.png", "viewTop")

    base.ViewObject.Visibility = True
    front_rotation = global_rotation(-90)
    lid.Placement = front_rotation.multiply(lid_placement)
    insert.Placement = front_rotation.multiply(lid_placement)
    base.Placement = front_rotation.multiply(base_placement)
    save(view, "VCG-Console-Case-Assembled-Front.png", "viewTop")

    rear_rotation = global_rotation(90)
    lid.Placement = rear_rotation.multiply(lid_placement)
    insert.Placement = rear_rotation.multiply(lid_placement)
    base.Placement = rear_rotation.multiply(base_placement)
    save(view, "VCG-Console-Case-Assembled-Rear-Ports.png", "viewTop")

    # Lid close-ups use the original part coordinates, matching print/service
    # inspection orientation with the wordmark upright from the port edge.
    lid.Placement = top_rotation
    insert.Placement = top_rotation
    base.ViewObject.Visibility = False
    save(view, "VCG-Console-Case-Lid-Logo-Closeup.png", "viewTop", 2000, 1400)

    insert.ViewObject.Visibility = False
    save(view, "VCG-Console-Case-Lid-Recess.png", "viewTop", 2000, 1400)
    insert.ViewObject.Visibility = True

    lid.ViewObject.Visibility = False
    save(view, "VCG-Console-Logo-Insert-Separate.png", "viewTop", 1800, 900)

    # Exploded inspection from above: move the insert beside the lid so both
    # the cavity and the one-piece carrier are visible in the same frame.
    lid.ViewObject.Visibility = True
    insert.Placement = top_rotation.multiply(
        App.Placement(App.Vector(42, 0, -2), App.Rotation())
    )
    save(view, "VCG-Console-Lid-And-Insert-Exploded.png", "viewTop", 2000, 1300)

    App.closeDocument(render.Name)
    App.closeDocument(source.Name)


if __name__ == "__main__":
    main()
