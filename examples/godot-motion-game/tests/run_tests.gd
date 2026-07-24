extends SceneTree

const TinyGame := preload("res://scripts/motion_game.gd")
const MotionReplay := preload("res://scripts/motion_replay.gd")
const WebBridge := preload("res://scripts/motion_web_bridge.gd")

var _failures: Array[String] = []


func _init() -> void:
	call_deferred("_run")


func _run() -> void:
	_test_landmarks_actions_and_fallback()
	_test_replay_is_deterministic_and_raw_free()
	_test_bridge_denies_non_web_and_unsafe_origins()
	_test_bridge_normalizes_json_sequences()
	if _failures.is_empty():
		print("Godot Motion sample: 4 tests passed")
		quit(0)
	else:
		for failure in _failures:
			push_error(failure)
		quit(1)


func _test_landmarks_actions_and_fallback() -> void:
	var game := TinyGame.new()
	_expect(game.accept_frame(_frame(0, 1000, 0.3)), "portable frame should validate")
	_expect(game.current_snapshot()["lane"] == 0, "hip landmarks should select left lane")
	var triggered := _frame(1, 1100, 0.5, [{"name": "jump", "phase": "triggered"}])
	_expect(game.accept_frame(triggered), "triggered obstacle frame should validate")
	_expect(game.current_snapshot()["stance"] == "jumping", "triggered jump should change stance")
	var held := _frame(2, 1200, 0.5, [{"name": "duck", "phase": "held"}])
	_expect(game.accept_frame(held), "held feedback frame should validate")
	_expect(game.current_snapshot()["stance"] == "jumping", "held feedback must not trigger duck")
	var shell := _frame(3, 1300, 0.5, [{"name": "menu_back", "phase": "triggered"}])
	shell["capabilities"]["profiles"].append("actions.shell.v1")
	_expect(game.accept_frame(shell), "shell action frame should remain valid")
	_expect(game.current_snapshot()["stance"] == "jumping", "shell actions must not drive gameplay")
	_expect(game.accept_controller("right"), "controller fallback should remain available")
	_expect(game.current_snapshot()["input_source"] == "controller", "controller should own the recovery input")


func _test_replay_is_deterministic_and_raw_free() -> void:
	var trace := {
		"format": "vcg-motion-trace",
		"formatVersion": 1,
		"containsRawFrames": false,
		"frames": [_frame(0, 1000, 0.5), _frame(1, 1100, 0.7, [{"name": "duck", "phase": "triggered"}])],
	}
	var first_game := TinyGame.new()
	var first := MotionReplay.new(first_game, trace)
	_expect(first.is_valid() and first.play(), "skeleton-only replay should initialize")
	_expect(first.advance(0) == 1 and first.advance(100) == 1, "replay should follow the controlled clock")
	var second_game := TinyGame.new()
	var second := MotionReplay.new(second_game, trace)
	second.play()
	second.advance(100)
	_expect(first_game.current_snapshot() == second_game.current_snapshot(), "replay must be deterministic")
	var raw_trace := trace.duplicate(true)
	raw_trace["containsRawFrames"] = true
	_expect(not MotionReplay.new(TinyGame.new(), raw_trace).is_valid(), "raw-frame trace must be rejected")


func _test_bridge_denies_non_web_and_unsafe_origins() -> void:
	var game := TinyGame.new()
	var unsafe := WebBridge.new(game, "https://console.example/path")
	_expect(not unsafe.start(), "path-bearing origin must be rejected")
	var headless := WebBridge.new(game, "https://console.example")
	_expect(not headless.start(), "non-web runtime must not claim a live web bridge")


func _test_bridge_normalizes_json_sequences() -> void:
	_expect(WebBridge.valid_json_sequence(0.0), "integral JSON sequence should be accepted")
	_expect(WebBridge.valid_json_sequence(9_007_199_254_740_991.0), "maximum safe JSON sequence should be accepted")
	_expect(not WebBridge.valid_json_sequence(-1.0), "negative JSON sequence must be rejected")
	_expect(not WebBridge.valid_json_sequence(0.5), "fractional JSON sequence must be rejected")
	_expect(not WebBridge.valid_json_sequence(INF), "non-finite JSON sequence must be rejected")
	_expect(not WebBridge.valid_json_sequence("1"), "string JSON sequence must be rejected")


func _frame(sequence: int, timestamp_ms: int, hip_x: float, actions: Array = []) -> Dictionary:
	var landmarks := []
	for name in TinyGame.CORE_LANDMARKS:
		var x := hip_x if name in ["left_hip", "right_hip"] else 0.5
		landmarks.append({"name": name, "position": {"x": x, "y": 0.5}})
	return {
		"schemaVersion": "0.4.0",
		"sequence": sequence,
		"source": "replay",
		"sourceTimestampMs": timestamp_ms,
		"health": "ready",
		"capabilities": {
			"profiles": ["body.core17", "actions.obstacle.v1"],
		},
		"players": [{
			"id": "player-1",
			"coreLandmarks": landmarks,
			"actions": actions,
		}],
	}


func _expect(condition: bool, message: String) -> void:
	if not condition:
		_failures.append(message)
