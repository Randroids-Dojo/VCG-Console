class_name VcgMotionReplay
extends RefCounted

var _game: RefCounted
var _frames: Array
var _cursor := 0
var _position_ms := 0.0
var _first_timestamp_ms := 0.0
var _playing := false


func _init(game: RefCounted, trace: Dictionary) -> void:
	_game = game
	if trace.get("format") != "vcg-motion-trace" or trace.get("formatVersion") != 1:
		return
	if trace.get("containsRawFrames") != false or typeof(trace.get("frames")) != TYPE_ARRAY:
		return
	var candidate_frames: Array = trace["frames"]
	if candidate_frames.is_empty():
		return
	var prior_timestamp := -INF
	for frame_value in candidate_frames:
		if typeof(frame_value) != TYPE_DICTIONARY:
			return
		var timestamp: Variant = frame_value.get("sourceTimestampMs")
		if typeof(timestamp) not in [TYPE_INT, TYPE_FLOAT] or not is_finite(float(timestamp)):
			return
		if float(timestamp) < prior_timestamp:
			return
		prior_timestamp = float(timestamp)
	_frames = candidate_frames.duplicate(true)
	_first_timestamp_ms = float(_frames[0]["sourceTimestampMs"])


func is_valid() -> bool:
	return not _frames.is_empty()


func play() -> bool:
	if not is_valid():
		return false
	_playing = true
	return true


func advance(elapsed_ms: float) -> int:
	if not _playing or not is_finite(elapsed_ms) or elapsed_ms < 0:
		return 0
	_position_ms += elapsed_ms
	var emitted := 0
	while _cursor < _frames.size():
		var relative_time := float(_frames[_cursor]["sourceTimestampMs"]) - _first_timestamp_ms
		if relative_time > _position_ms:
			break
		if not _game.accept_frame(_frames[_cursor]):
			_playing = false
			return emitted
		_cursor += 1
		emitted += 1
	if _cursor == _frames.size():
		_playing = false
	return emitted


func reset() -> void:
	_cursor = 0
	_position_ms = 0.0
	_playing = false
