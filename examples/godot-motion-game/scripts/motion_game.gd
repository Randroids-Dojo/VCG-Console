class_name VcgTinyMotionGame
extends RefCounted

signal changed(snapshot: Dictionary)

const MOTION_API_SCHEMA_VERSION := "0.4.0"
const CORE_PROFILE := "body.core17"
const OBSTACLE_PROFILE := "actions.obstacle.v1"
const CORE_LANDMARKS := [
	"nose",
	"left_eye",
	"right_eye",
	"left_ear",
	"right_ear",
	"left_shoulder",
	"right_shoulder",
	"left_elbow",
	"right_elbow",
	"left_wrist",
	"right_wrist",
	"left_hip",
	"right_hip",
	"left_knee",
	"right_knee",
	"left_ankle",
	"right_ankle",
]
const CONTROLLER_ACTIONS := ["left", "right", "jump", "duck"]
const OBSTACLE_ACTIONS := ["dodge_left", "dodge_right", "jump", "duck"]

var snapshot := {
	"lane": 1,
	"stance": "standing",
	"score": 0,
	"motion_ready": false,
	"input_source": "waiting",
	"status": "WAITING FOR PLAYER",
}


func current_snapshot() -> Dictionary:
	return snapshot.duplicate(true)


func accept_health(value: Variant) -> bool:
	if typeof(value) != TYPE_DICTIONARY:
		return false
	var health: Dictionary = value
	if health.get("schemaVersion") != MOTION_API_SCHEMA_VERSION:
		return false
	var status_value: Variant = health.get("status", "")
	var availability_value: Variant = health.get("controlAvailability", "")
	var reason_value: Variant = health.get("reason", "")
	if typeof(status_value) != TYPE_STRING or typeof(availability_value) != TYPE_STRING or typeof(reason_value) != TYPE_STRING:
		return false
	var status: String = status_value
	var availability: String = availability_value
	var reason: String = reason_value
	var ready: bool = status == "ready" and availability == "full"
	snapshot["motion_ready"] = ready
	snapshot["input_source"] = snapshot["input_source"] if ready else "waiting"
	snapshot["status"] = "MOTION READY" if ready else "MOTION %s" % reason.replace("-", " ").to_upper()
	_publish()
	return true


func accept_frame(value: Variant) -> bool:
	if typeof(value) != TYPE_DICTIONARY:
		return false
	var frame: Dictionary = value
	if frame.get("schemaVersion") != MOTION_API_SCHEMA_VERSION:
		return false
	if typeof(frame.get("sequence")) != TYPE_INT or typeof(frame.get("sourceTimestampMs")) not in [TYPE_INT, TYPE_FLOAT]:
		return false
	var capabilities_value: Variant = frame.get("capabilities")
	var players_value: Variant = frame.get("players")
	if typeof(capabilities_value) != TYPE_DICTIONARY or typeof(players_value) != TYPE_ARRAY:
		return false
	var profiles_value: Variant = capabilities_value.get("profiles")
	if typeof(profiles_value) != TYPE_ARRAY or not CORE_PROFILE in profiles_value:
		return false
	var players: Array = players_value
	if frame.get("health") != "ready" or players.is_empty():
		snapshot["motion_ready"] = false
		snapshot["input_source"] = "waiting"
		snapshot["status"] = "MOTION DEGRADED" if not players.is_empty() else "PLAYER NOT FOUND"
		_publish()
		return true
	if typeof(players[0]) != TYPE_DICTIONARY:
		return false
	var player: Dictionary = players[0]
	var landmarks := _validated_landmarks(player.get("coreLandmarks"))
	if landmarks.is_empty():
		return false
	var actions_value: Variant = player.get("actions")
	if typeof(actions_value) != TYPE_ARRAY:
		return false

	var hip_center: float = (landmarks["left_hip"].x + landmarks["right_hip"].x) / 2.0
	snapshot["lane"] = 0 if hip_center < 0.44 else (2 if hip_center > 0.56 else 1)
	snapshot["motion_ready"] = true
	snapshot["input_source"] = "motion"
	snapshot["status"] = "LANDMARKS ACTIVE"

	for action_value in actions_value:
		if typeof(action_value) != TYPE_DICTIONARY:
			return false
		var action: Dictionary = action_value
		var action_name: Variant = action.get("name")
		var phase: Variant = action.get("phase")
		if typeof(action_name) != TYPE_STRING or typeof(phase) != TYPE_STRING:
			return false
		if action_name in OBSTACLE_ACTIONS and not OBSTACLE_PROFILE in profiles_value:
			return false
		if phase != "triggered":
			continue
		if action_name == "dodge_left":
			_apply("left", "motion")
		elif action_name == "dodge_right":
			_apply("right", "motion")
		elif action_name == "jump":
			_apply("jump", "motion")
		elif action_name == "duck":
			_apply("duck", "motion")
	_publish()
	return true


func accept_controller(action: String) -> bool:
	if action not in CONTROLLER_ACTIONS:
		return false
	_apply(action, "controller")
	_publish()
	return true


func _validated_landmarks(value: Variant) -> Dictionary:
	if typeof(value) != TYPE_ARRAY:
		return {}
	var result := {}
	for landmark_value in value:
		if typeof(landmark_value) != TYPE_DICTIONARY:
			return {}
		var landmark: Dictionary = landmark_value
		var name: Variant = landmark.get("name")
		var position_value: Variant = landmark.get("position")
		if typeof(name) != TYPE_STRING or name not in CORE_LANDMARKS or result.has(name):
			return {}
		if typeof(position_value) != TYPE_DICTIONARY:
			return {}
		var x: Variant = position_value.get("x")
		var y: Variant = position_value.get("y")
		if typeof(x) not in [TYPE_INT, TYPE_FLOAT] or typeof(y) not in [TYPE_INT, TYPE_FLOAT]:
			return {}
		if not is_finite(float(x)) or not is_finite(float(y)) or x < 0 or x > 1 or y < 0 or y > 1:
			return {}
		result[name] = Vector2(float(x), float(y))
	return result if result.size() == CORE_LANDMARKS.size() else {}


func _apply(action: String, source: String) -> void:
	if action == "left":
		snapshot["lane"] = maxi(0, int(snapshot["lane"]) - 1)
	elif action == "right":
		snapshot["lane"] = mini(2, int(snapshot["lane"]) + 1)
	snapshot["stance"] = "jumping" if action == "jump" else ("ducking" if action == "duck" else "standing")
	snapshot["score"] = int(snapshot["score"]) + 100
	snapshot["input_source"] = source
	snapshot["status"] = "%s %s" % [source.to_upper(), action.to_upper()]


func _publish() -> void:
	changed.emit(current_snapshot())
