# Owner questions: confidence degradation

Date: 2026-07-24

The camera-free comparison is complete without this answer. The question
gates the later physical campaign and production recovery policy. No answer is
assumed.

## Q-234: restoration safety versus availability

After one landmark becomes unavailable, what maximum restoration delay should
the product permit in exchange for stronger evidence that the landmark has
really returned?

The authored comparison makes the tradeoff explicit:

- a memoryless threshold produced 14 unsafe-available samples and only 2
  false-unavailable samples;
- immediate loss plus three-sample high-confidence rearming produced no
  unsafe-available samples but 34 false-unavailable samples;
- the three-sample rule delays restoration by two samples, approximately
  33 ms at 60 FPS, but is frame-rate dependent; and
- numeric MediaPipe and RTMO confidence values are not yet calibrated or
  comparable.

Safe default while awaiting physical evidence:

- block an affected control immediately on explicit provider loss or a
  qualified low-confidence condition;
- require fresh high-confidence evidence before restoration;
- express the production rearm bound in trusted elapsed time plus repeated
  observations, not frame count alone;
- keep unrelated controls available only when their own landmarks, player
  identity, global tracker health, and title policy remain qualified;
- reset rearm evidence across camera, model, source, tracker, or timestamp
  epochs;
- preserve immediate controller recovery and visible unavailable/rearming
  feedback; and
- reject any candidate whose restoration delay causes the full D-110
  camera-to-action or recovery gate to fail.

Please select a maximum acceptable restoration delay for one-player motion
controls and say whether multiplayer must always freeze globally during any
joined player's landmark rearm. If the policy varies by control, please rank
Jump, Dodge, Duck, Select, Back/Pause, and Swipe by safety criticality.
