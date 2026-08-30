"""Render inspection views of the untouched WrenchWorks3D meshes."""

from __future__ import annotations

from pathlib import Path

import FreeCAD as App
import FreeCADGui as Gui


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "Source" / "Working" / "WrenchWorks3D-Pi-5-AI-Case-Original-Meshes.FCStd"
PREVIEWS = ROOT / "Previews" / "Original-Inspection"


def save_view(view, filename: str, orientation: str) -> None:
    getattr(view, orientation)()
    view.fitAll()
    view.saveImage(str(PREVIEWS / filename), 1600, 1200, "Current")


def main() -> None:
    PREVIEWS.mkdir(parents=True, exist_ok=True)
    Gui.showMainWindow()
    document = App.openDocument(str(SOURCE))
    gui_document = Gui.getDocument(document.Name)
    view = gui_document.activeView()

    lid = document.getObject("Original_Lid")
    base = document.getObject("Original_Base")
    lid.ViewObject.ShapeColor = (0.82, 0.06, 0.08)
    base.ViewObject.ShapeColor = (0.12, 0.12, 0.12)
    lid.ViewObject.LineColor = (0.12, 0.12, 0.12)
    base.ViewObject.LineColor = (0.12, 0.12, 0.12)

    base.ViewObject.Visibility = False
    lid.ViewObject.Visibility = True
    save_view(view, "original-lid-top.png", "viewTop")
    save_view(view, "original-lid-bottom.png", "viewBottom")
    save_view(view, "original-lid-front.png", "viewFront")
    save_view(view, "original-lid-rear.png", "viewRear")
    save_view(view, "original-lid-isometric.png", "viewAxonometric")

    lid.ViewObject.Visibility = False
    base.ViewObject.Visibility = True
    save_view(view, "original-base-top.png", "viewTop")
    save_view(view, "original-base-front.png", "viewFront")
    save_view(view, "original-base-rear.png", "viewRear")
    save_view(view, "original-base-isometric.png", "viewAxonometric")

    App.closeDocument(document.Name)


if __name__ == "__main__":
    main()
