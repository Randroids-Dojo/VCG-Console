const escapeTarget = "http://127.0.0.1:4173/?policyEscape=1";

function requiredOutput(id: string): HTMLOutputElement {
  const output = document.querySelector<HTMLOutputElement>(`#${id}`);
  if (!output) throw new Error(`Missing browser-policy fixture output: ${id}`);
  return output;
}

function requiredButton(id: string): HTMLButtonElement {
  const button = document.querySelector<HTMLButtonElement>(`#${id}`);
  if (!button) throw new Error(`Missing browser-policy fixture button: ${id}`);
  return button;
}

function blockedError(error: unknown): string {
  const name = error instanceof DOMException ? error.name : "ERROR";
  return `BLOCKED:${name.toUpperCase()}`;
}

function policyAllows(feature: string): boolean | undefined {
  const policy = (
    document as Document & {
      featurePolicy?: { allowsFeature: (featureName: string) => boolean };
    }
  ).featurePolicy;
  return policy?.allowsFeature(feature);
}

requiredOutput("frame-origin").textContent = location.origin;
for (const feature of ["camera", "microphone", "geolocation", "fullscreen"]) {
  const allowed = policyAllows(feature);
  requiredOutput(`${feature}-policy`).textContent =
    allowed === undefined ? "UNAVAILABLE" : allowed ? "ALLOWED" : "DENIED";
}

requiredButton("try-parent-document").addEventListener("click", () => {
  const output = requiredOutput("parent-document");
  try {
    void window.parent.document.title;
    output.textContent = "READABLE";
  } catch (error) {
    output.textContent = blockedError(error);
  }
});

async function tryMedia(
  constraints: MediaStreamConstraints,
  outputId: string,
): Promise<void> {
  const output = requiredOutput(outputId);
  try {
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    for (const track of stream.getTracks()) track.stop();
    output.textContent = "GRANTED";
  } catch (error) {
    output.textContent = blockedError(error);
  }
}

requiredButton("try-camera").addEventListener("click", () => {
  void tryMedia({ video: true, audio: false }, "camera-request");
});

requiredButton("try-microphone").addEventListener("click", () => {
  void tryMedia({ video: false, audio: true }, "microphone-request");
});

requiredButton("try-geolocation").addEventListener("click", () => {
  const output = requiredOutput("geolocation-request");
  navigator.geolocation.getCurrentPosition(
    () => {
      output.textContent = "GRANTED";
    },
    (error) => {
      output.textContent = `BLOCKED:${error.code}`;
    },
    { maximumAge: 0, timeout: 2_000 },
  );
});

requiredButton("try-network").addEventListener("click", () => {
  const output = requiredOutput("network-request");
  void fetch(escapeTarget, { mode: "no-cors" }).then(
    () => {
      output.textContent = "SENT";
    },
    (error: unknown) => {
      output.textContent = blockedError(error);
    },
  );
});

requiredButton("try-popup").addEventListener("click", () => {
  const opened = window.open(escapeTarget, "_blank");
  requiredOutput("popup-request").textContent = opened ? "OPENED" : "BLOCKED";
  opened?.close();
});

requiredButton("try-navigation").addEventListener("click", () => {
  const output = requiredOutput("navigation-request");
  try {
    window.top?.location.assign(escapeTarget);
    output.textContent = "NAVIGATED";
  } catch (error) {
    output.textContent = blockedError(error);
  }
});

requiredButton("try-download").addEventListener("click", () => {
  const link = document.createElement("a");
  link.href = "data:text/plain,vcg-policy-escape";
  link.download = "vcg-policy-escape.txt";
  document.body.append(link);
  link.click();
  link.remove();
  requiredOutput("download-request").textContent = "ATTEMPTED";
});

requiredButton("try-form").addEventListener("click", () => {
  const form = document.createElement("form");
  form.action = escapeTarget;
  form.method = "post";
  document.body.append(form);
  form.requestSubmit();
  form.remove();
  requiredOutput("form-request").textContent = "ATTEMPTED";
});

requiredButton("try-fullscreen").addEventListener("click", () => {
  const output = requiredOutput("fullscreen-request");
  void document.documentElement.requestFullscreen().then(
    () => {
      output.textContent = "GRANTED";
      void document.exitFullscreen();
    },
    (error: unknown) => {
      output.textContent = blockedError(error);
    },
  );
});

requiredButton("try-pointer-lock").addEventListener("click", () => {
  const output = requiredOutput("pointer-lock-request");
  try {
    const request = document.body.requestPointerLock();
    void Promise.resolve(request).then(
      () => {
        output.textContent = document.pointerLockElement ? "GRANTED" : "BLOCKED";
        if (document.pointerLockElement) document.exitPointerLock();
      },
      (error: unknown) => {
        output.textContent = blockedError(error);
      },
    );
  } catch (error) {
    output.textContent = blockedError(error);
  }
});

export {};
