from __future__ import annotations

import unittest

import numpy as np

from benchmark import percentile, suite_sha256, synthetic_suite


class BenchmarkHelpersTest(unittest.TestCase):
    def test_synthetic_suite_is_exact_and_repeatable(self) -> None:
        first = synthetic_suite()
        second = synthetic_suite()
        self.assertEqual([name for name, _ in first], [
            "black",
            "gray-114",
            "horizontal-gradient",
            "seeded-noise",
        ])
        self.assertEqual(suite_sha256(first), suite_sha256(second))
        for (_, left), (_, right) in zip(first, second, strict=True):
            self.assertEqual(left.shape, (640, 640, 3))
            self.assertEqual(left.dtype, np.uint8)
            self.assertTrue(np.array_equal(left, right))
            self.assertTrue(np.array_equal(left[:, :, 0], left[:, :, 1]))
            self.assertTrue(np.array_equal(left[:, :, 1], left[:, :, 2]))

    def test_percentile_uses_linear_interpolation(self) -> None:
        self.assertEqual(percentile([1.0], 0.95), 1.0)
        self.assertEqual(percentile([1.0, 2.0, 3.0, 4.0], 0.5), 2.5)
        self.assertAlmostEqual(percentile([1.0, 2.0, 3.0, 4.0], 0.95), 3.85)

    def test_percentile_rejects_empty_samples(self) -> None:
        with self.assertRaisesRegex(RuntimeError, "empty latency"):
            percentile([], 0.5)


if __name__ == "__main__":
    unittest.main()
