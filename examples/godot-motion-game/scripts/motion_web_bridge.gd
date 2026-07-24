class_name VcgMotionWebBridge
extends RefCounted

const PROTOCOL_VERSION := 2
const MOTION_API_SCHEMA_VERSION := "0.3.0"
const ORIGIN_PATTERN := "^https?://[A-Za-z0-9.-]+(?::[0-9]{1,5})?$"

var _game: RefCounted
var _target_origin: String
var _client_id: String
var _helper: JavaScriptObject
var _message_callback: JavaScriptObject
var _session_id := ""


func _init(game: RefCounted, target_origin: String, client_id := "vcg-godot-tiny-game") -> void:
	_game = game
	_target_origin = target_origin
	_client_id = client_id


func start() -> bool:
	if not OS.has_feature("web") or not _valid_origin(_target_origin):
		return false
	JavaScriptBridge.eval("""
		window.__vcgGodotMotionBridge = {
			listener: null,
			start(origin, clientId, callback) {
				this.stop();
				this.listener = (event) => {
					if (event.origin === origin && event.source === window.parent) {
						callback(JSON.stringify(event.data));
					}
				};
				window.addEventListener("message", this.listener);
				window.parent.postMessage({
					type: "vcg.motion.hello",
					protocolVersion: 2,
					motionApiSchemaVersion: "0.3.0",
					clientId,
					request: {
						requiredProfiles: ["body.core17"],
						optionalProfiles: ["actions.obstacle.v1"]
					}
				}, origin);
			},
			ack(origin, sessionId, sequence) {
				window.parent.postMessage({
					type: "vcg.motion.ack",
					protocolVersion: 2,
					sessionId,
					sequence
				}, origin);
			},
			goodbye(origin, sessionId) {
				window.parent.postMessage({
					type: "vcg.motion.goodbye",
					protocolVersion: 2,
					sessionId
				}, origin);
			},
			stop() {
				if (this.listener) window.removeEventListener("message", this.listener);
				this.listener = null;
			}
		};
	""")
	_helper = JavaScriptBridge.get_interface("__vcgGodotMotionBridge")
	if _helper == null:
		return false
	_message_callback = JavaScriptBridge.create_callback(_on_message)
	_helper.start(_target_origin, _client_id, _message_callback)
	return true


func stop() -> void:
	if _helper != null:
		if not _session_id.is_empty():
			_helper.goodbye(_target_origin, _session_id)
		_helper.stop()
	_session_id = ""
	_message_callback = null
	_helper = null


func _on_message(arguments: Array) -> void:
	if arguments.is_empty() or typeof(arguments[0]) != TYPE_STRING:
		return
	var parsed: Variant = JSON.parse_string(arguments[0])
	if typeof(parsed) != TYPE_DICTIONARY:
		return
	var message: Dictionary = parsed
	if message.get("protocolVersion") != PROTOCOL_VERSION:
		return
	var message_type: Variant = message.get("type")
	if message_type == "vcg.motion.welcome":
		if message.get("motionApiSchemaVersion") != MOTION_API_SCHEMA_VERSION:
			return
		var negotiation: Variant = message.get("negotiation")
		var health: Variant = message.get("health")
		var session_id: Variant = message.get("sessionId")
		if typeof(negotiation) != TYPE_DICTIONARY or negotiation.get("accepted") != true:
			return
		if typeof(session_id) != TYPE_STRING or session_id.is_empty() or not _game.accept_health(health):
			return
		_session_id = session_id
	elif message_type == "vcg.motion.health":
		if message.get("sessionId") == _session_id:
			_game.accept_health(message.get("event"))
	elif message_type == "vcg.motion.frame":
		if message.get("sessionId") != _session_id or typeof(message.get("frame")) != TYPE_DICTIONARY:
			return
		var frame: Dictionary = message["frame"]
		if _game.accept_frame(frame) and typeof(frame.get("sequence")) == TYPE_INT:
			_helper.ack(_target_origin, _session_id, frame["sequence"])


func _valid_origin(value: String) -> bool:
	var expression := RegEx.new()
	return expression.compile(ORIGIN_PATTERN) == OK and expression.search(value) != null
