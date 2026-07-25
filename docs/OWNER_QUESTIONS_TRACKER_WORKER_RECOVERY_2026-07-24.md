# Owner questions: tracker worker recovery

Last updated: 2026-07-24

## Current bounded behavior

The browser tracker now fails closed when its live inference worker throws an
uncaught runtime error. It releases and resets one-frame backpressure, stops
the camera tracks, clears the video source, removes worker listeners,
terminates and forgets that worker, advances the run identity, emits the
closed `backend-fault` health event, and returns the visible camera control to
Start Camera.

An explicit Start Camera retry creates a distinct worker. If fresh worker
initialization fails, the already disclosed main-thread fallback remains
available. The tracker does not automatically resume motion authority after a
runtime crash. Any asynchronous frame transfer started by the failed run stays
bound to its original worker and run identity; a late bitmap is closed, and a
late transfer failure cannot fault the replacement worker.

A real Chrome regression injects an uncaught error into the actual initialized
worker, holds an in-progress bitmap across the fault, and proves the fail-closed
state, fresh-worker retry, and stale-bitmap closure. This is desk evidence with
a synthetic browser camera, not real-camera, target-Linux, responsiveness,
repeated-fault, or product recovery qualification.

## Decisions still needed

1. Should a family build retain explicit player-initiated retry after a worker
   runtime fault, or make one bounded automatic attempt while the console
   remains visibly paused and motion control remains blocked?
2. If automatic recovery is selected, what attempt ceiling, delay, and
   transition to the main-thread fallback are acceptable on each hardware
   tier?
3. Must a second worker fault in the same play session permanently disable
   camera retry until the game exits or the tracker service restarts?

The current recommendation is to keep explicit retry until real-camera crash
injection measures pause continuity, UI responsiveness, repeated-fault
behavior, and fallback load on ordinary x86-64 Linux and Raspberry Pi. That
preserves the existing fail-closed authority boundary without silently
choosing a recovery loop.
