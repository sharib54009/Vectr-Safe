from datetime import timedelta

from django.test import SimpleTestCase
from django.utils import timezone

from .engine import (
    calculate_distance_from_route,
    calculate_distance_meters,
    calculate_risk_score,
    detect_prolonged_stop,
    detect_route_deviation,
    detect_wrong_direction,
    estimate_eta,
    transition_risk_state,
)


class DistanceTests(SimpleTestCase):
    def test_identical_points_have_zero_distance(self):
        self.assertAlmostEqual(calculate_distance_meters((16.5, 80.6), (16.5, 80.6)), 0)

    def test_known_equatorial_distance_is_in_meters(self):
        distance = calculate_distance_meters((0, 0), (0, 0.001))
        self.assertAlmostEqual(distance, 111.2, delta=1)

    def test_route_segment_distance_uses_nearest_segment(self):
        route = [{"latitude": 0, "longitude": 0}, {"latitude": 0, "longitude": 0.01}]
        self.assertLess(calculate_distance_from_route((0, 0.005), route), 1)
        self.assertAlmostEqual(calculate_distance_from_route((0.001, 0), route[:1]), 111.2, delta=2)


class RouteDeviationTests(SimpleTestCase):
    def setUp(self):
        self.route = [{"latitude": 0, "longitude": 0}, {"latitude": 0, "longitude": 0.01}]
        self.now = timezone.now()

    def test_inside_corridor_has_no_deviation(self):
        locations = [{"latitude": 0.0002, "longitude": 0.002, "timestamp": self.now}]
        self.assertIsNone(detect_route_deviation(locations, self.route, corridor_meters=100))

    def test_one_outlier_is_not_a_persistent_signal(self):
        locations = [{"latitude": 0.002, "longitude": 0.002, "timestamp": self.now}]
        self.assertIsNone(detect_route_deviation(locations, self.route))

    def test_persistent_points_outside_corridor_create_signal(self):
        locations = [
            {"latitude": 0.002, "longitude": longitude, "timestamp": self.now + timedelta(seconds=index)}
            for index, longitude in enumerate((0.002, 0.003, 0.004))
        ]
        signal = detect_route_deviation(locations, self.route)
        self.assertEqual(signal["type"], "ROUTE_DEVIATION")
        self.assertGreater(signal["distance_from_route_meters"], 100)


class StopDetectionTests(SimpleTestCase):
    def setUp(self):
        self.now = timezone.now()

    def sample(self, latitude, longitude, seconds):
        return {"latitude": latitude, "longitude": longitude, "timestamp": self.now + timedelta(seconds=seconds)}

    def test_normal_movement_is_not_a_stop(self):
        points = [self.sample(0, 0, 0), self.sample(0, 0.001, 240)]
        self.assertIsNone(detect_prolonged_stop(points))

    def test_short_stop_is_not_a_prolonged_stop(self):
        points = [self.sample(0, 0, 0), self.sample(0.00001, 0.00001, 60)]
        self.assertIsNone(detect_prolonged_stop(points))

    def test_prolonged_stop_allows_small_gps_jitter(self):
        points = [
            self.sample(0, 0, 0), self.sample(0.00008, 0, 60),
            self.sample(0, 0.00008, 130), self.sample(-0.00006, 0, 190),
        ]
        signal = detect_prolonged_stop(points)
        self.assertEqual(signal["type"], "PROLONGED_STOP")


class DirectionTests(SimpleTestCase):
    def setUp(self):
        self.now = timezone.now()
        self.route = [{"latitude": 0, "longitude": 0}, {"latitude": 0, "longitude": 0.01}]

    def points(self, longitudes, heading=None):
        return [
            {"latitude": 0, "longitude": longitude, "timestamp": self.now + timedelta(seconds=index * 10), "heading_degrees": heading}
            for index, longitude in enumerate(longitudes)
        ]

    def test_movement_towards_destination_is_not_wrong_direction(self):
        self.assertIsNone(detect_wrong_direction(self.points((0, 0.001, 0.002)), self.route))

    def test_movement_away_from_destination_is_detected_after_two_samples(self):
        signal = detect_wrong_direction(self.points((0.002, 0.001, 0)), self.route)
        self.assertEqual(signal["type"], "WRONG_DIRECTION")

    def test_consistent_opposing_heading_is_detected(self):
        signal = detect_wrong_direction(self.points((0, 0.001, 0.002), heading=270), self.route)
        self.assertEqual(signal["type"], "WRONG_DIRECTION")

    def test_unavailable_direction_returns_none(self):
        self.assertIsNone(detect_wrong_direction(self.points((0, 0, 0)), self.route))
        self.assertIsNone(detect_wrong_direction(self.points((0, 0)), self.route))


class ScoreAndTransitionTests(SimpleTestCase):
    def signal(self, name, points):
        return {"type": name, "score_contribution": points}

    def test_no_single_and_multiple_signal_scores(self):
        self.assertEqual(calculate_risk_score([]), 10)
        self.assertEqual(calculate_risk_score([self.signal("ROUTE_DEVIATION", 35)]), 45)
        self.assertEqual(calculate_risk_score([self.signal("ROUTE_DEVIATION", 35), self.signal("PROLONGED_STOP", 30)]), 75)

    def test_risk_state_transitions_and_clear_hysteresis(self):
        self.assertEqual(transition_risk_state("SAFE", "ELEVATED"), ("ELEVATED", 0))
        self.assertEqual(transition_risk_state("ELEVATED", "HIGH"), ("HIGH", 0))
        self.assertEqual(transition_risk_state("HIGH", "ELEVATED"), ("HIGH", 1))
        self.assertEqual(transition_risk_state("HIGH", "ELEVATED", 2), ("ELEVATED", 0))
        self.assertEqual(transition_risk_state("ELEVATED", "SAFE", 2), ("SAFE", 0))

    def test_eta_is_unavailable_without_enough_history(self):
        result = estimate_eta([], [{"latitude": 0, "longitude": 0}], timezone.now())
        self.assertIsNone(result["estimated_arrival"])
        self.assertIsNone(result["remaining_distance_meters"])
