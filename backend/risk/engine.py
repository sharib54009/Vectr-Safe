"""History-based, explainable movement signals. A signal is not proof of danger."""
from datetime import timedelta
from math import atan2, cos, degrees, radians, sin, sqrt

from . import config

EARTH_RADIUS_METERS = 6_371_000


def calculate_distance_meters(point_a, point_b):
    """Haversine distance accounts for Earth's curvature and returns meters."""
    latitude_a, longitude_a = map(radians, point_a)
    latitude_b, longitude_b = map(radians, point_b)
    latitude_delta = latitude_b - latitude_a
    longitude_delta = longitude_b - longitude_a
    haversine = sin(latitude_delta / 2) ** 2 + cos(latitude_a) * cos(latitude_b) * sin(longitude_delta / 2) ** 2
    return EARTH_RADIUS_METERS * 2 * atan2(sqrt(haversine), sqrt(1 - haversine))


def _coordinates(point):
    if isinstance(point, dict):
        return float(point["latitude"]), float(point["longitude"])
    return float(point[0]), float(point[1])


def _distance_to_segment(point, start, end):
    """Project a short route segment into local meters and find nearest point."""
    point_lat, point_lon = _coordinates(point)
    start_lat, start_lon = _coordinates(start)
    end_lat, end_lon = _coordinates(end)
    middle_latitude = radians((start_lat + end_lat + point_lat) / 3)
    meters_per_degree_latitude = 111_320
    meters_per_degree_longitude = 111_320 * cos(middle_latitude)
    start_x, start_y = start_lon * meters_per_degree_longitude, start_lat * meters_per_degree_latitude
    end_x, end_y = end_lon * meters_per_degree_longitude, end_lat * meters_per_degree_latitude
    point_x, point_y = point_lon * meters_per_degree_longitude, point_lat * meters_per_degree_latitude
    segment_x, segment_y = end_x - start_x, end_y - start_y
    segment_length_squared = segment_x * segment_x + segment_y * segment_y
    if segment_length_squared == 0:
        return calculate_distance_meters((point_lat, point_lon), (start_lat, start_lon))
    fraction = ((point_x - start_x) * segment_x + (point_y - start_y) * segment_y) / segment_length_squared
    fraction = max(0.0, min(1.0, fraction))
    nearest_x = start_x + fraction * segment_x
    nearest_y = start_y + fraction * segment_y
    return sqrt((point_x - nearest_x) ** 2 + (point_y - nearest_y) ** 2)


def calculate_distance_from_route(current_location, planned_route):
    """Return meters to the closest route point or segment; empty routes are unknown."""
    if not planned_route:
        return None
    if len(planned_route) == 1:
        return calculate_distance_meters(_coordinates(current_location), _coordinates(planned_route[0]))
    return min(_distance_to_segment(current_location, start, end) for start, end in zip(planned_route, planned_route[1:]))


def detect_route_deviation(locations, planned_route, corridor_meters=None):
    """A route signal requires several recent samples outside the corridor."""
    if not planned_route or not locations:
        return None
    corridor = corridor_meters if corridor_meters is not None else config.DEFAULT_ROUTE_CORRIDOR_METERS
    window_size = config.ROUTE_DEVIATION_WINDOW_SAMPLES
    recent = locations[-window_size:]
    distances = [calculate_distance_from_route(point, planned_route) for point in recent]
    if len(recent) < config.ROUTE_DEVIATION_SAMPLE_COUNT or not all(distance > corridor for distance in distances):
        return None
    distance = round(distances[-1])
    return {
        "type": "ROUTE_DEVIATION", "severity": "MEDIUM", "score_contribution": config.RISK_WEIGHTS["ROUTE_DEVIATION"],
        "distance_from_route_meters": distance,
        "message": f"The rider is approximately {distance} meters outside the planned route corridor.",
    }


def detect_prolonged_stop(locations, radius_meters=None, duration_seconds=None):
    """Detect a cluster of jittering GPS points that stayed near its first point."""
    if len(locations) < 2:
        return None
    radius = radius_meters if radius_meters is not None else config.STOP_RADIUS_METERS
    duration_limit = duration_seconds if duration_seconds is not None else config.STOP_DURATION_SECONDS
    anchor = locations[-1]
    stationary_points = [anchor]
    for point in reversed(locations[:-1]):
        if calculate_distance_meters(_coordinates(anchor), _coordinates(point)) > radius:
            break
        stationary_points.append(point)
    elapsed = (stationary_points[0]["timestamp"] - stationary_points[-1]["timestamp"]).total_seconds()
    if elapsed < duration_limit:
        return None
    minutes = max(1, round(elapsed / 60))
    return {
        "type": "PROLONGED_STOP", "severity": "MEDIUM", "score_contribution": config.RISK_WEIGHTS["PROLONGED_STOP"],
        "duration_seconds": int(elapsed), "radius_meters": radius,
        "message": f"The rider has remained within approximately {radius} meters for {minutes} minutes.",
    }


def _bearing_degrees(point_a, point_b):
    latitude_a, longitude_a = map(radians, _coordinates(point_a))
    latitude_b, longitude_b = map(radians, _coordinates(point_b))
    longitude_delta = longitude_b - longitude_a
    y = sin(longitude_delta) * cos(latitude_b)
    x = cos(latitude_a) * sin(latitude_b) - sin(latitude_a) * cos(latitude_b) * cos(longitude_delta)
    return (degrees(atan2(y, x)) + 360) % 360


def _nearest_route_bearing(point, planned_route):
    if len(planned_route) < 2:
        return None
    segments = list(zip(planned_route, planned_route[1:]))
    nearest_start, nearest_end = min(
        segments,
        key=lambda segment: _distance_to_segment(point, segment[0], segment[1]),
    )
    return _bearing_degrees(nearest_start, nearest_end)


def detect_wrong_direction(locations, planned_route):
    """Compare two consistent headings or movements with the planned route direction."""
    if not planned_route or len(planned_route) < 2 or len(locations) < 3:
        return None
    recent = locations[-3:]
    expected_bearings = [_nearest_route_bearing(point, planned_route) for point in recent[1:]]
    if any(bearing is None for bearing in expected_bearings):
        return None
    headings = [point.get("heading_degrees") for point in recent[1:]]
    if all(heading is not None for heading in headings):
        differences = [abs((float(heading) - expected + 180) % 360 - 180)
                       for expected, heading in zip(expected_bearings, headings)]
        if all(difference >= config.WRONG_DIRECTION_HEADING_DEGREES for difference in differences):
            return {
                "type": "WRONG_DIRECTION", "severity": "MEDIUM", "score_contribution": config.RISK_WEIGHTS["WRONG_DIRECTION"],
                "direction_difference_degrees": round(sum(differences) / len(differences)),
                "message": "Recent GPS headings consistently point away from the planned destination.",
            }
        return None
    moves_away = []
    for previous, current, expected_bearing in zip(recent, recent[1:], expected_bearings):
        movement = calculate_distance_meters(_coordinates(previous), _coordinates(current))
        actual_bearing = _bearing_degrees(previous, current)
        direction_difference = abs((actual_bearing - expected_bearing + 180) % 360 - 180)
        moves_away.append(
            movement >= config.WRONG_DIRECTION_MIN_DISTANCE_METERS
            and direction_difference >= config.WRONG_DIRECTION_HEADING_DEGREES
        )
    if all(moves_away):
        return {
            "type": "WRONG_DIRECTION", "severity": "MEDIUM", "score_contribution": config.RISK_WEIGHTS["WRONG_DIRECTION"],
            "message": "Recent locations consistently move farther from the planned destination.",
        }
    return None


def detect_unusual_movement(location):
    speed = location.get("speed_meters_per_second")
    if speed is None or speed <= config.UNUSUAL_SPEED_METERS_PER_SECOND:
        return None
    return {
        "type": "UNUSUAL_MOVEMENT", "severity": "LOW", "score_contribution": config.RISK_WEIGHTS["UNUSUAL_MOVEMENT"],
        "speed_meters_per_second": round(float(speed), 1),
        "message": "An unusually high GPS-reported speed was recorded; this may also be a sensor error.",
    }


def detect_late_journey(now, expected_arrival_at):
    if expected_arrival_at is None or now <= expected_arrival_at:
        return None
    late_seconds = int((now - expected_arrival_at).total_seconds())
    return {
        "type": "LATE_JOURNEY", "severity": "LOW", "score_contribution": config.RISK_WEIGHTS["LATE_JOURNEY"],
        "late_seconds": late_seconds, "message": "The journey is taking longer than its expected arrival time.",
    }


def calculate_risk_score(signals):
    return min(100, config.RISK_BASE_SCORE + sum(signal["score_contribution"] for signal in signals))


def get_risk_state(score):
    if score >= config.RISK_HIGH_THRESHOLD:
        return "HIGH"
    if score >= config.RISK_ELEVATED_THRESHOLD:
        return "ELEVATED"
    return "SAFE"


def transition_risk_state(current_state, proposed_state, lower_samples=0):
    """Hold a raised state until three consecutive lower readings damp GPS noise."""
    order = {"SAFE": 0, "ELEVATED": 1, "HIGH": 2}
    if order[proposed_state] >= order[current_state]:
        return proposed_state, 0
    lower_samples += 1
    if lower_samples >= config.RISK_CLEAR_SAMPLE_COUNT:
        return proposed_state, 0
    return current_state, lower_samples


def estimate_eta(locations, planned_route, now, journey_started_at=None):
    elapsed_seconds = None
    if journey_started_at is not None:
        elapsed_seconds = max(0, int((now - journey_started_at).total_seconds()))
    elif locations:
        elapsed_seconds = max(0, int((now - locations[0]["timestamp"]).total_seconds()))
    if not locations or not planned_route or len(locations) < 3:
        return {"remaining_distance_meters": None, "estimated_arrival": None, "elapsed_seconds": elapsed_seconds}
    current = locations[-1]
    route_distances = [calculate_distance_from_route(current, [point]) for point in planned_route]
    nearest_index = min(range(len(route_distances)), key=route_distances.__getitem__)
    remaining_distance = calculate_distance_meters(_coordinates(current), _coordinates(planned_route[nearest_index]))
    remaining_distance += sum(calculate_distance_meters(_coordinates(a), _coordinates(b))
                              for a, b in zip(planned_route[nearest_index:], planned_route[nearest_index + 1:]))
    speeds = []
    for previous, point in zip(locations[-6:-1], locations[-5:]):
        elapsed = (point["timestamp"] - previous["timestamp"]).total_seconds()
        if elapsed <= 0:
            continue
        measured_speed = point.get("speed_meters_per_second")
        speed = float(measured_speed) if measured_speed is not None else calculate_distance_meters(_coordinates(previous), _coordinates(point)) / elapsed
        if config.ETA_MIN_SPEED_METERS_PER_SECOND <= speed <= config.ETA_MAX_SPEED_METERS_PER_SECOND:
            speeds.append(speed)
    if not speeds:
        estimated_arrival = None
    else:
        average_speed = sum(speeds) / len(speeds)
        estimated_arrival = now + timedelta(seconds=remaining_distance / average_speed)
    return {
        "remaining_distance_meters": round(remaining_distance),
        "estimated_arrival": estimated_arrival,
        "elapsed_seconds": elapsed_seconds,
    }


def evaluate_movement(locations, planned_route, now, expected_arrival_at=None):
    if not locations:
        return {"score": config.RISK_BASE_SCORE, "state": "SAFE", "reasons": []}
    latest = locations[-1]
    signals = [
        detect_route_deviation(locations, planned_route),
        detect_prolonged_stop(locations),
        detect_wrong_direction(locations, planned_route),
        detect_unusual_movement(latest),
        detect_late_journey(now, expected_arrival_at),
    ]
    reasons = [signal for signal in signals if signal is not None]
    score = calculate_risk_score(reasons)
    return {"score": score, "state": get_risk_state(score), "reasons": reasons}
