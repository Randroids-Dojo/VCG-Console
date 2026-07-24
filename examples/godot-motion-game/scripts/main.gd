extends Control

const TinyGame := preload("res://scripts/motion_game.gd")

var _game: RefCounted
var _title: Label
var _state: Label
var _help: Label


func _ready() -> void:
	_build_ui()
	_game = TinyGame.new()
	_game.changed.connect(_render)
	_render(_game.current_snapshot())


func _unhandled_key_input(event: InputEvent) -> void:
	if not event.pressed or event.echo:
		return
	if event.keycode == KEY_LEFT or event.keycode == KEY_A:
		_game.accept_controller("left")
	elif event.keycode == KEY_RIGHT or event.keycode == KEY_D:
		_game.accept_controller("right")
	elif event.keycode == KEY_SPACE:
		_game.accept_controller("jump")
	elif event.keycode == KEY_DOWN or event.keycode == KEY_S:
		_game.accept_controller("duck")


func _build_ui() -> void:
	var stack := VBoxContainer.new()
	stack.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT, Control.PRESET_MODE_MINSIZE, 64)
	stack.alignment = BoxContainer.ALIGNMENT_CENTER
	add_child(stack)
	_title = Label.new()
	_title.text = "VCG TINY MOTION GAME"
	_title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_title.add_theme_font_size_override("font_size", 36)
	stack.add_child(_title)
	_state = Label.new()
	_state.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_state.add_theme_font_size_override("font_size", 24)
	stack.add_child(_state)
	_help = Label.new()
	_help.text = "Controller fallback: Left/Right, Space to jump, Down to duck\nHome and Back remain platform-owned."
	_help.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_help.add_theme_font_size_override("font_size", 18)
	stack.add_child(_help)


func _render(snapshot: Dictionary) -> void:
	_state.text = "LANE %d   %s   SCORE %d\n%s / %s" % [
		int(snapshot["lane"]) + 1,
		String(snapshot["stance"]).to_upper(),
		int(snapshot["score"]),
		String(snapshot["input_source"]).to_upper(),
		snapshot["status"],
	]
	_publish_web_export_probe(snapshot)


func _publish_web_export_probe(snapshot: Dictionary) -> void:
	if not OS.has_feature("web"):
		return
	var value := {
		"schemaVersion": 1,
		"lane": int(snapshot["lane"]),
		"stance": String(snapshot["stance"]),
		"score": int(snapshot["score"]),
		"inputSource": String(snapshot["input_source"]),
		"status": String(snapshot["status"]),
	}
	JavaScriptBridge.eval(
		"globalThis.__vcgGodotExportProbe = Object.freeze(%s);" % JSON.stringify(value)
	)
