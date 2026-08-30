from pathlib import Path

import Mesh


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "Manufacturing" / "VCG-Console-Case-Bottom.stl"
OUTPUT_DIR = ROOT / "Quotes" / "Service-Uploads"
OUTPUT = OUTPUT_DIR / "VCG-Console-Case-Bottom-Quote-Optimized.stl"


OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
mesh = Mesh.Mesh(str(SOURCE))
before = mesh.CountFacets

# Print a Thing timed out on the original 98k-facet STL.  This derivative is
# only for its price estimator: the 0.02 mm maximum-error bound is one tenth of
# a 0.2 mm production layer and leaves the manufacturing master untouched.
mesh.decimate(0.02, 0.70)
mesh.write(str(OUTPUT))

print(f"quote mesh: {before} -> {mesh.CountFacets} facets")
print(OUTPUT)
