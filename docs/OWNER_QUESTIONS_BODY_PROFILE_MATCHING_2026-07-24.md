# Owner questions: automatic body-profile matching

Last updated: 2026-07-24

None of these questions authorizes implementation or household testing.
Automatic matching remains disabled until the complete I-184 release gate,
qualified legal review, and explicit residual-risk decision pass.

## Q-151: exact v1 feature allowlist

Which exact tracker fields, temporal window, normalization, derived
measurements, model, and template representation may v1 retain and compare?

Safe default: approve no persisted feature yet. Require a field-by-field
purpose, sensitivity, inversion/linkability result, accuracy contribution,
schema/version rule, and deletion behavior. Exclude raw frames, crops, face
landmarks, appearance/color features, voice, demographic labels, inferred
health/disability labels, and any value that does not materially improve the
pre-registered matching gate.

## Q-152: household notice, consent, and opt-out

Who must understand and authorize enrollment and repeat matching for adults,
children, guests, and people with limited ability to consent, and how is
withdrawal represented on a credential-free shared console?

Safe default: no passive enrollment. Use a visible join-time explanation,
adult consent plus age-appropriate child assent where applicable, a complete
explicit-selection/transient-calibration alternative, and an always-available
disable/delete control. Refusal must not reduce core gameplay or cause
repeated prompts. Qualified counsel must approve the final age/guardian model.

## Q-153: launch jurisdictions and legal posture

In which jurisdictions and under which operator/distribution model could the
matching feature first be enabled?

Safe default: keep it disabled everywhere. Freeze the product, audience,
connectivity, data flow, feature schema, retention, and entity/operator facts,
then obtain written advice for every intended jurisdiction. Do not infer an
exemption from local-only processing, open-source DIY distribution, lack of a
cloud account, or the label "prediction."

## Q-154: measurable residual-risk acceptance

What maximum false-accept, false-reject, abstention, correction, subgroup
disparity, inversion, membership-inference, and cross-session/linkability
results are acceptable, and who can authorize the remaining shared-TV,
physical-household, running-root, and no-recovery risks?

Safe default: no owner acceptance until tests publish stratified confidence
intervals for children, adults, seated and limited-range players, similar
household bodies, clothing/assistive-device changes, and time-separated
sessions. Any unmitigated template extraction, cross-console linkage, silent
authority, or unsafe calibration is a no-ship result; otherwise ship explicit
selection and transient calibration.
