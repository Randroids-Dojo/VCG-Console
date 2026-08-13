<script lang="ts">
  // Generated key art for catalog surfaces. Every composition is inline SVG
  // (CSP-safe, no external requests, no filters) and is purely decorative;
  // hosts wrap it in an aria-hidden container.
  // `name` accepts any catalog id; unknown ids fall back to the generic mark.
  let { name = "generic" }: { name?: string } = $props();
</script>

{#if name === "obstacle"}
  <svg viewBox="0 0 640 360" preserveAspectRatio="xMidYMid slice" role="presentation" focusable="false">
    <defs>
      <linearGradient id="ka-ob-bg" x1="0" y1="0" x2="0.2" y2="1">
        <stop offset="0" stop-color="#0d2b2f" />
        <stop offset="0.55" stop-color="#0a1a1e" />
        <stop offset="1" stop-color="#071012" />
      </linearGradient>
      <radialGradient id="ka-ob-glow" cx="0.32" cy="0.62" r="0.55">
        <stop offset="0" stop-color="#53dac3" stop-opacity="0.5" />
        <stop offset="1" stop-color="#53dac3" stop-opacity="0" />
      </radialGradient>
      <linearGradient id="ka-ob-block" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#123a3c" />
        <stop offset="1" stop-color="#0c2426" />
      </linearGradient>
    </defs>
    <rect width="640" height="360" fill="url(#ka-ob-bg)" />
    <rect width="640" height="360" fill="url(#ka-ob-glow)" />
    <g stroke="#53dac3" stroke-opacity="0.1" stroke-width="1">
      <path d="M0 288 H640" /><path d="M0 316 H640" /><path d="M0 344 H640" />
    </g>
    <g fill="url(#ka-ob-block)" stroke="#2b6d68" stroke-opacity="0.6">
      <rect x="428" y="96" width="74" height="74" rx="10" transform="rotate(8 465 133)" />
      <rect x="524" y="180" width="96" height="96" rx="12" transform="rotate(-6 572 228)" />
      <rect x="470" y="20" width="52" height="52" rx="8" transform="rotate(-14 496 46)" />
    </g>
    <g stroke="#53dac3" stroke-opacity="0.5" stroke-width="3" stroke-linecap="round">
      <path d="M118 210 H196" /><path d="M96 232 H188" opacity="0.55" /><path d="M132 188 H206" opacity="0.35" />
    </g>
    <g stroke="#8ff7e4" stroke-width="7" stroke-linecap="round" fill="none">
      <circle cx="238" cy="128" r="17" fill="#8ff7e4" stroke="none" />
      <path d="M238 152 L238 216" />
      <path d="M238 168 L196 196" /><path d="M238 168 L282 188" />
      <path d="M238 216 L206 268" /><path d="M238 216 L272 272" />
    </g>
    <circle cx="238" cy="128" r="30" fill="none" stroke="#53dac3" stroke-opacity="0.4" stroke-width="2" />
  </svg>
{:else if name === "museum"}
  <svg viewBox="0 0 640 360" preserveAspectRatio="xMidYMid slice" role="presentation" focusable="false">
    <defs>
      <linearGradient id="ka-mu-bg" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#191534" />
        <stop offset="0.6" stop-color="#120e22" />
        <stop offset="1" stop-color="#0b0916" />
      </linearGradient>
      <radialGradient id="ka-mu-glow" cx="0.5" cy="0.18" r="0.6">
        <stop offset="0" stop-color="#b8a7ff" stop-opacity="0.42" />
        <stop offset="1" stop-color="#b8a7ff" stop-opacity="0" />
      </radialGradient>
      <linearGradient id="ka-mu-arch" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#2d2657" />
        <stop offset="1" stop-color="#1a1533" />
      </linearGradient>
    </defs>
    <rect width="640" height="360" fill="url(#ka-mu-bg)" />
    <rect width="640" height="360" fill="url(#ka-mu-glow)" />
    <g fill="url(#ka-mu-arch)" stroke="#6d5fc0" stroke-opacity="0.5">
      <path d="M96 320 V172 a54 54 0 0 1 108 0 V320 Z" />
      <path d="M266 320 V148 a54 54 0 0 1 108 0 V320 Z" />
      <path d="M436 320 V172 a54 54 0 0 1 108 0 V320 Z" />
    </g>
    <g fill="#b8a7ff">
      <circle cx="320" cy="196" r="14" opacity="0.9" />
      <rect x="142" y="210" width="16" height="52" rx="3" opacity="0.55" />
      <rect x="480" y="206" width="24" height="34" rx="3" opacity="0.5" />
    </g>
    <path d="M0 320 H640" stroke="#8b7de0" stroke-opacity="0.45" stroke-width="2" />
    <path d="M320 236 V320" stroke="#b8a7ff" stroke-opacity="0.3" stroke-width="2" />
    <g fill="#efeee6" opacity="0.8">
      <circle cx="561" cy="56" r="3" /><circle cx="592" cy="92" r="2" /><circle cx="82" cy="66" r="2.5" /><circle cx="130" cy="40" r="2" />
    </g>
  </svg>
{:else if name === "retro"}
  <svg viewBox="0 0 640 360" preserveAspectRatio="xMidYMid slice" role="presentation" focusable="false">
    <defs>
      <linearGradient id="ka-re-bg" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#241503" />
        <stop offset="0.55" stop-color="#170e05" />
        <stop offset="1" stop-color="#0d0804" />
      </linearGradient>
      <linearGradient id="ka-re-sun" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#ffe089" />
        <stop offset="1" stop-color="#f18f3b" />
      </linearGradient>
    </defs>
    <rect width="640" height="360" fill="url(#ka-re-bg)" />
    <circle cx="320" cy="176" r="86" fill="url(#ka-re-sun)" opacity="0.92" />
    <g stroke="#170e05" stroke-width="8">
      <path d="M214 158 H426" /><path d="M222 186 H418" /><path d="M240 214 H400" />
    </g>
    <g stroke="#f1c75b" stroke-opacity="0.5" stroke-width="2" fill="none">
      <path d="M0 262 H640" />
      <path d="M46 360 L188 262" /><path d="M180 360 L262 262" /><path d="M320 360 L320 262" />
      <path d="M460 360 L378 262" /><path d="M594 360 L452 262" />
      <path d="M0 292 H640" opacity="0.7" /><path d="M0 330 H640" opacity="0.5" />
    </g>
    <g fill="#f1c75b" opacity="0.85">
      <rect x="84" y="84" width="12" height="12" /><rect x="540" y="60" width="10" height="10" /><rect x="574" y="132" width="8" height="8" />
    </g>
  </svg>
{:else if name === "circuit-shift"}
  <svg viewBox="0 0 640 360" preserveAspectRatio="xMidYMid slice" role="presentation" focusable="false">
    <defs>
      <linearGradient id="ka-cs-bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#03180f" />
        <stop offset="1" stop-color="#020b07" />
      </linearGradient>
      <radialGradient id="ka-cs-glow" cx="0.7" cy="0.35" r="0.6">
        <stop offset="0" stop-color="#2bd97c" stop-opacity="0.34" />
        <stop offset="1" stop-color="#2bd97c" stop-opacity="0" />
      </radialGradient>
    </defs>
    <rect width="640" height="360" fill="url(#ka-cs-bg)" />
    <rect width="640" height="360" fill="url(#ka-cs-glow)" />
    <g stroke="#2bd97c" stroke-width="3" fill="none" stroke-linecap="round">
      <path d="M60 300 H190 V210 H320" opacity="0.85" />
      <path d="M60 84 H150 V150 H268 V96 H420" opacity="0.6" />
      <path d="M320 210 H452 V132 H560" opacity="0.9" />
      <path d="M200 330 H370 V276 H500 V210" opacity="0.5" />
    </g>
    <g fill="#0f3f26" stroke="#2bd97c" stroke-width="3">
      <circle cx="320" cy="210" r="12" /><circle cx="268" cy="96" r="9" /><circle cx="560" cy="132" r="11" /><circle cx="190" cy="300" r="9" /><circle cx="500" cy="210" r="8" />
    </g>
    <g fill="#a5ffce">
      <circle cx="320" cy="210" r="4" /><circle cx="560" cy="132" r="4" /><circle cx="190" cy="300" r="3" />
    </g>
  </svg>
{:else if name === "retro-2048"}
  <svg viewBox="0 0 640 360" preserveAspectRatio="xMidYMid slice" role="presentation" focusable="false">
    <defs>
      <linearGradient id="ka-20-bg" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#231a10" />
        <stop offset="1" stop-color="#120d07" />
      </linearGradient>
      <linearGradient id="ka-20-hot" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#ffd27a" />
        <stop offset="1" stop-color="#f1913b" />
      </linearGradient>
    </defs>
    <rect width="640" height="360" fill="url(#ka-20-bg)" />
    <g transform="rotate(-8 320 180)">
      <g fill="#3a2c1a" stroke="#68512e" stroke-opacity="0.6">
        <rect x="176" y="66" width="88" height="88" rx="14" />
        <rect x="376" y="166" width="88" height="88" rx="14" />
        <rect x="276" y="216" width="88" height="88" rx="14" />
        <rect x="426" y="46" width="88" height="88" rx="14" />
      </g>
      <rect x="276" y="116" width="88" height="88" rx="14" fill="url(#ka-20-hot)" />
      <text x="320" y="174" fill="#231303" font-family="ui-monospace, monospace" font-size="34" font-weight="700" text-anchor="middle">2048</text>
    </g>
    <circle cx="86" cy="292" r="5" fill="#f1c75b" opacity="0.8" />
    <circle cx="576" cy="312" r="4" fill="#f1c75b" opacity="0.6" />
  </svg>
{:else if name === "vibebots"}
  <svg viewBox="0 0 640 360" preserveAspectRatio="xMidYMid slice" role="presentation" focusable="false">
    <defs>
      <linearGradient id="ka-vb-bg" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#101c30" />
        <stop offset="1" stop-color="#080d18" />
      </linearGradient>
      <linearGradient id="ka-vb-head" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#26436b" />
        <stop offset="1" stop-color="#16283f" />
      </linearGradient>
    </defs>
    <rect width="640" height="360" fill="url(#ka-vb-bg)" />
    <g stroke="#4f7fb8" stroke-opacity="0.25" stroke-width="1.5">
      <path d="M0 84 H640" /><path d="M0 300 H640" />
    </g>
    <rect x="222" y="96" width="196" height="150" rx="30" fill="url(#ka-vb-head)" stroke="#5b8fd0" stroke-opacity="0.7" stroke-width="3" />
    <rect x="300" y="66" width="40" height="30" rx="8" fill="#16283f" stroke="#5b8fd0" stroke-opacity="0.7" stroke-width="3" />
    <circle cx="320" cy="52" r="10" fill="#53dac3" />
    <g fill="#53dac3">
      <rect x="262" y="146" width="42" height="18" rx="9" />
      <rect x="336" y="146" width="42" height="18" rx="9" />
    </g>
    <path d="M282 204 H358" stroke="#8ff7e4" stroke-width="6" stroke-linecap="round" />
    <g fill="#26436b" stroke="#5b8fd0" stroke-opacity="0.55" stroke-width="2.5">
      <rect x="160" y="150" width="34" height="60" rx="12" />
      <rect x="446" y="150" width="34" height="60" rx="12" />
    </g>
  </svg>
{:else if name === "mi-casa-es-su-casa"}
  <svg viewBox="0 0 640 360" preserveAspectRatio="xMidYMid slice" role="presentation" focusable="false">
    <defs>
      <linearGradient id="ka-mc-bg" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#2b1220" />
        <stop offset="1" stop-color="#120810" />
      </linearGradient>
    </defs>
    <rect width="640" height="360" fill="url(#ka-mc-bg)" />
    <circle cx="516" cy="84" r="42" fill="#ffd9a0" opacity="0.9" />
    <circle cx="500" cy="76" r="42" fill="#2b1220" opacity="0.85" />
    <g fill="#3f1d31" stroke="#ff765f" stroke-opacity="0.65" stroke-width="3">
      <path d="M200 320 V196 L306 128 L412 196 V320 Z" />
    </g>
    <rect x="282" y="238" width="48" height="82" rx="6" fill="#ff9b84" opacity="0.85" />
    <rect x="228" y="216" width="34" height="34" rx="5" fill="#ffd9a0" opacity="0.75" />
    <rect x="350" y="216" width="34" height="34" rx="5" fill="#ffd9a0" opacity="0.75" />
    <path d="M96 320 H544" stroke="#ff765f" stroke-opacity="0.5" stroke-width="2" />
    <g fill="#efeee6" opacity="0.7">
      <circle cx="120" cy="70" r="2.5" /><circle cx="168" cy="112" r="2" /><circle cx="590" cy="180" r="2.5" />
    </g>
  </svg>
{:else if name === "determined"}
  <svg viewBox="0 0 640 360" preserveAspectRatio="xMidYMid slice" role="presentation" focusable="false">
    <defs>
      <linearGradient id="ka-dt-bg" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#0d1d33" />
        <stop offset="1" stop-color="#070d17" />
      </linearGradient>
      <linearGradient id="ka-dt-peak" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#2c4a74" />
        <stop offset="1" stop-color="#152439" />
      </linearGradient>
    </defs>
    <rect width="640" height="360" fill="url(#ka-dt-bg)" />
    <g fill="url(#ka-dt-peak)">
      <path d="M-20 340 L180 130 L330 340 Z" opacity="0.75" />
      <path d="M200 340 L400 84 L620 340 Z" />
    </g>
    <path d="M400 84 L436 130 L400 130 Z" fill="#eef0ea" opacity="0.9" />
    <path d="M400 84 V56" stroke="#8ff7e4" stroke-width="4" stroke-linecap="round" />
    <path d="M400 56 L432 66 L400 78 Z" fill="#53dac3" />
    <g fill="#eef0ea" opacity="0.75">
      <circle cx="96" cy="60" r="2.5" /><circle cx="530" cy="46" r="2" /><circle cx="580" cy="96" r="2.5" /><circle cx="250" cy="52" r="2" />
    </g>
  </svg>
{:else if name === "tracker"}
  <svg viewBox="0 0 640 360" preserveAspectRatio="xMidYMid slice" role="presentation" focusable="false">
    <defs>
      <linearGradient id="ka-tr-bg" x1="0" y1="0" x2="0.3" y2="1">
        <stop offset="0" stop-color="#0c1a20" />
        <stop offset="1" stop-color="#080e12" />
      </linearGradient>
    </defs>
    <rect width="640" height="360" fill="url(#ka-tr-bg)" />
    <g stroke="#53dac3" stroke-opacity="0.16" stroke-width="1">
      <path d="M80 0 V360" /><path d="M212 0 V360" /><path d="M344 0 V360" /><path d="M476 0 V360" /><path d="M608 0 V360" />
      <path d="M0 72 H640" /><path d="M0 180 H640" /><path d="M0 288 H640" />
    </g>
    <g stroke="#53dac3" stroke-width="3" fill="none" opacity="0.9">
      <path d="M320 108 L320 196" />
      <path d="M320 132 L262 170" /><path d="M320 132 L378 170" />
      <path d="M320 196 L280 268" /><path d="M320 196 L360 268" />
    </g>
    <g fill="#8ff7e4">
      <circle cx="320" cy="88" r="13" />
      <circle cx="262" cy="170" r="7" /><circle cx="378" cy="170" r="7" />
      <circle cx="280" cy="268" r="7" /><circle cx="360" cy="268" r="7" />
      <circle cx="320" cy="196" r="8" />
    </g>
    <circle cx="320" cy="178" r="118" fill="none" stroke="#53dac3" stroke-opacity="0.3" stroke-width="2" stroke-dasharray="4 10" />
  </svg>
{:else if name === "shell"}
  <svg viewBox="0 0 640 360" preserveAspectRatio="xMidYMid slice" role="presentation" focusable="false">
    <defs>
      <linearGradient id="ka-sh-bg" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#161327" />
        <stop offset="1" stop-color="#0b0a14" />
      </linearGradient>
    </defs>
    <rect width="640" height="360" fill="url(#ka-sh-bg)" />
    <g fill="#1f1b38" stroke="#6d5fc0" stroke-opacity="0.5" stroke-width="2.5">
      <rect x="120" y="120" width="120" height="120" rx="18" />
      <rect x="404" y="120" width="120" height="120" rx="18" />
    </g>
    <rect x="252" y="102" width="140" height="156" rx="20" fill="#292251" stroke="#b8a7ff" stroke-width="3.5" />
    <path d="M292 180 H352" stroke="#b8a7ff" stroke-width="6" stroke-linecap="round" />
    <path d="M322 150 V210" stroke="#b8a7ff" stroke-width="6" stroke-linecap="round" />
    <g stroke="#b8a7ff" stroke-opacity="0.6" stroke-width="3" fill="none" stroke-linecap="round">
      <path d="M84 180 L60 180" /><path d="M580 180 L556 180" />
      <path d="M70 170 L60 180 L70 190" /><path d="M570 170 L580 180 L570 190" />
    </g>
  </svg>
{:else if name === "session"}
  <svg viewBox="0 0 640 360" preserveAspectRatio="xMidYMid slice" role="presentation" focusable="false">
    <defs>
      <linearGradient id="ka-se-bg" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#22101a" />
        <stop offset="1" stop-color="#110810" />
      </linearGradient>
    </defs>
    <rect width="640" height="360" fill="url(#ka-se-bg)" />
    <g stroke="#ff9b84" stroke-width="5" stroke-linecap="round" fill="none" opacity="0.95">
      <circle cx="250" cy="120" r="15" fill="#ff9b84" stroke="none" />
      <path d="M250 142 V210" /><path d="M250 160 L214 186" /><path d="M250 160 L286 186" />
      <path d="M250 210 L226 258" /><path d="M250 210 L274 258" />
    </g>
    <g stroke="#8b959d" stroke-width="4" stroke-linecap="round" fill="none" opacity="0.55">
      <circle cx="404" cy="132" r="12" fill="#8b959d" stroke="none" />
      <path d="M404 150 V206" /><path d="M404 164 L376 186" /><path d="M404 164 L432 186" />
      <path d="M404 206 L386 250" /><path d="M404 206 L422 250" />
    </g>
    <path d="M318 96 l44 18 v34 c0 30 -18 52 -44 62 c-26 -10 -44 -32 -44 -62 v-34 Z" fill="#2b1520" stroke="#ff765f" stroke-width="3" opacity="0.95" />
    <path d="M303 148 l12 12 22 -26" stroke="#ffd9a0" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round" />
  </svg>
{:else}
  <svg viewBox="0 0 640 360" preserveAspectRatio="xMidYMid slice" role="presentation" focusable="false">
    <defs>
      <linearGradient id="ka-ge-bg" x1="0" y1="0" x2="0.3" y2="1">
        <stop offset="0" stop-color="#131920" />
        <stop offset="1" stop-color="#0a0d10" />
      </linearGradient>
    </defs>
    <rect width="640" height="360" fill="url(#ka-ge-bg)" />
    <path d="M262 132 h28 l30 70 30 -70 h28 l-44 104 h-28 Z" fill="#53dac3" opacity="0.9" />
    <circle cx="320" cy="180" r="104" fill="none" stroke="#53dac3" stroke-opacity="0.3" stroke-width="2" />
    <circle cx="320" cy="180" r="136" fill="none" stroke="#53dac3" stroke-opacity="0.14" stroke-width="2" />
  </svg>
{/if}
