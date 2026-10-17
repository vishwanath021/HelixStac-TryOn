/**
 * On-device live look. The shader keeps the camera texture and blends
 * makeup and hair colour into it. Masks clip the blend; landmarks only
 * describe lips, lids and brows. Nothing here fills an eye.
 */

import {
  BROW_L,
  BROW_R,
  EYE_L,
  EYE_R,
  INNER_LIP,
  IRIS_L,
  IRIS_R,
  LOWER_LASH_L,
  LOWER_LASH_R,
  OUTER_LIP,
  UPPER_LASH_L,
  UPPER_LASH_R,
  type Pt,
} from "@/lib/face/makeup-paint";
import { HAIR_LUMA_LIFT, HAIR_LUMA_LIFT_END, HAIR_LUMA_LIFT_MIX, HAIR_LUMA_LIFT_START } from "@/lib/face/hair-mask";
import { EYE_FEATHER_PX, LINER_BLUR_PX, liveEffectsFor, livePreset, type LookAudience } from "@/lib/face/makeup-blend";

export type LiveLookOptions = {
  lip: string | null;
  kajal: boolean;
  blush: boolean;
  brow: boolean;
  hair: string | null;
  /** 0–1. How strongly a hair colour replaces the hair hue while keeping luminosity. */
  hairStrength: number;
  hasMask: boolean;
  /** Bridal live makeup uses a stronger preset. Everyday stays on the subtle numbers. */
  bridal?: boolean;
  /** Webcam preview: lips, soft kajal, soft blush. Brows stay off. There is no lash layer. */
  camera?: boolean;
};

export type LiveGl = {
  draw: (source: TexImageSource, mask: Uint8Array | null, maskWidth: number, maskHeight: number, points: Pt[] | null, options: LiveLookOptions, audience?: LookAudience) => void;
  resize: (width: number, height: number) => void;
  destroy: () => void;
};

const VERT = `#version 300 es
in vec2 a_pos;
out vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

const FRAG = `#version 300 es
precision mediump float;
in vec2 v_uv;
out vec4 outColor;
uniform sampler2D u_camera;
uniform sampler2D u_mask;
uniform vec2 u_outer[20];
uniform vec2 u_inner[20];
uniform vec2 u_browR[10];
uniform vec2 u_browL[10];
uniform vec2 u_upR[9];
uniform vec2 u_loR[9];
uniform vec2 u_upL[9];
uniform vec2 u_loL[9];
uniform vec2 u_eyeR[16];
uniform vec2 u_eyeL[16];
uniform vec2 u_centerR;
uniform vec2 u_centerL;
uniform vec2 u_irisR;
uniform vec2 u_irisL;
uniform float u_irisRadR;
uniform float u_irisRadL;
uniform float u_iod;
uniform vec3 u_lip;
uniform vec3 u_hair;
uniform vec3 u_blush;
uniform vec3 u_brow;
uniform vec2 u_cheekR;
uniform vec2 u_cheekL;
uniform vec2 u_px;
uniform float u_faceUv;
uniform float u_lipOn;
uniform float u_kajal;
uniform float u_blushOn;
uniform float u_browOn;
uniform float u_hairOn;
uniform float u_hairStrength;
uniform float u_hasMask;
uniform float u_lipMix;
uniform float u_lipFeather;
uniform float u_lipBody;
uniform float u_lipAdapt;
uniform float u_lipStamp;
uniform float u_blushPeak;
uniform float u_browMix;
uniform float u_kajalMix;
uniform float u_kajalIod;
uniform float u_kajalMax;
uniform float u_wing;

bool insidePoly(vec2 p, vec2 poly[20], int n) {
  bool hit = false;
  for (int i = 0; i < 20; i++) {
    if (i >= n) break;
    vec2 a = poly[i];
    int j = i + 1;
    if (j >= n) j = 0;
    vec2 b = poly[j];
    bool up = (a.y > p.y) != (b.y > p.y);
    if (up) {
      float x = (b.x - a.x) * (p.y - a.y) / (b.y - a.y + 1e-5) + a.x;
      if (p.x < x) hit = !hit;
    }
  }
  return hit;
}

bool insideBrow(vec2 p, vec2 poly[10]) {
  bool hit = false;
  for (int i = 0; i < 10; i++) {
    vec2 a = poly[i];
    int j = i + 1;
    if (j >= 10) j = 0;
    vec2 b = poly[j];
    bool up = (a.y > p.y) != (b.y > p.y);
    if (up) {
      float x = (b.x - a.x) * (p.y - a.y) / (b.y - a.y + 1e-5) + a.x;
      if (p.x < x) hit = !hit;
    }
  }
  return hit;
}

bool inside16(vec2 p, vec2 poly[16]) {
  bool hit = false;
  for (int i = 0; i < 16; i++) {
    vec2 a = poly[i];
    int j = i + 1;
    if (j == 16) j = 0;
    vec2 b = poly[j];
    bool up = (a.y > p.y) != (b.y > p.y);
    if (up) {
      float x = (b.x - a.x) * (p.y - a.y) / (b.y - a.y + 1e-5) + a.x;
      if (p.x < x) hit = !hit;
    }
  }
  return hit;
}

float edge16(vec2 p, vec2 poly[16]) {
  float best = 1.0;
  for (int i = 0; i < 16; i++) {
    vec2 a = poly[i];
    int j = i + 1;
    if (j == 16) j = 0;
    vec2 b = poly[j];
    vec2 ab = b - a;
    float t = clamp(dot(p - a, ab) / (dot(ab, ab) + 1e-5), 0.0, 1.0);
    best = min(best, length(p - (a + ab * t)));
  }
  return best;
}

float eyeCover(vec2 p, vec2 poly[16]) {
  float px = max(u_px.x, u_px.y);
  if (inside16(p, poly)) return 1.0;
  return 1.0 - smoothstep(0.0, px * ${EYE_FEATHER_PX.toFixed(1)}, edge16(p, poly));
}

float eyeMask(vec2 p) {
  return max(eyeCover(p, u_eyeR), eyeCover(p, u_eyeL));
}

vec3 adaptInk(vec3 ink, vec3 skin, float mixAmt) {
  float skinY = max(dot(skin, vec3(0.2126, 0.7152, 0.0722)), 0.04);
  float inkY = max(dot(ink, vec3(0.2126, 0.7152, 0.0722)), 0.04);
  float scale = (1.0 - mixAmt) + mixAmt * (skinY / inkY);
  return clamp(ink * scale, 0.0, 1.0);
}

float linerStroke(vec2 p, vec2 poly[9], vec2 center, float maxW, float blur, float wingLen) {
  float best = 1.0;
  float bestS = 1.0;
  vec2 closest = poly[0];
  float total = 0.0;
  float walked = 0.0;
  float px = max(u_px.x, u_px.y);
  for (int i = 0; i < 8; i++) total += length(poly[i + 1] - poly[i]);
  for (int i = 0; i < 8; i++) {
    vec2 a = poly[i];
    vec2 b = poly[i + 1];
    vec2 ab = b - a;
    float seg = length(ab);
    float t = clamp(dot(p - a, ab) / (dot(ab, ab) + 1e-6), 0.0, 1.0);
    vec2 c = a + ab * t;
    float d = length(p - c);
    if (d < best) {
      best = d;
      bestS = (walked + t * seg) / (total + 1e-6);
      closest = c;
    }
    walked += seg;
  }
  if (wingLen > 0.0001) {
    vec2 wingDir = poly[0] - poly[1];
    wingDir /= length(wingDir) + 1e-6;
    vec2 tip = poly[0] + wingDir * wingLen;
    vec2 wab = poly[0] - tip;
    float wt = clamp(dot(p - tip, wab) / (dot(wab, wab) + 1e-6), 0.0, 1.0);
    vec2 c = tip + wab * wt;
    float wd = length(p - c);
    if (wd < best) {
      best = wd;
      bestS = wt - 1.0;
      closest = c;
    }
  }
  if (dot(p - closest, closest - center) <= 0.0) return 0.0;
  float width = 0.0;
  if (bestS > -1.0 && bestS < 1.0) {
    if (bestS < 0.0) width = maxW * (1.0 + bestS);
    else if (bestS <= 0.33) width = maxW;
    else width = maxW * (1.0 - bestS) / 0.67;
  }
  if (width <= 0.0001) return 0.0;
  float reach = best - px;
  if (reach < 0.0) return 0.0;
  return 1.0 - smoothstep(width, width + blur, reach);
}

bool onIris(vec2 p) {
  return length(p - u_irisR) <= u_irisRadR || length(p - u_irisL) <= u_irisRadL;
}

bool inEye(vec2 p) {
  return inside16(p, u_eyeR) || inside16(p, u_eyeL);
}

float polyEdge(vec2 p, vec2 poly[20], int n) {
  float best = 1.0;
  for (int i = 0; i < 20; i++) {
    if (i >= n) break;
    vec2 a = poly[i];
    int j = i + 1;
    if (j >= n) j = 0;
    vec2 b = poly[j];
    vec2 ab = b - a;
    float t = clamp(dot(p - a, ab) / (dot(ab, ab) + 1e-5), 0.0, 1.0);
    best = min(best, length(p - (a + ab * t)));
  }
  return best;
}

vec3 softLight(vec3 base, vec3 blend) {
  return (1.0 - 2.0 * blend) * base * base + 2.0 * blend * base;
}

vec3 dyeHair(vec3 base, vec3 dye) {
  float luma = dot(base, vec3(0.2126, 0.7152, 0.0722));
  float maxC = max(base.r, max(base.g, base.b));
  float minC = min(base.r, min(base.g, base.b));
  float sat = maxC <= 0.001 ? 0.0 : (maxC - minC) / maxC;
  float t = smoothstep(${HAIR_LUMA_LIFT_START.toFixed(2)}, ${HAIR_LUMA_LIFT_END.toFixed(2)}, luma);
  float grey = smoothstep(0.22, 0.08, sat);
  float amount = ${HAIR_LUMA_LIFT_MIX.toFixed(2)} * (1.0 - t) * (1.0 - grey);
  float target = mix(${HAIR_LUMA_LIFT.toFixed(2)}, luma, t);
  float lifted = mix(luma, target, amount);
  float dyeLuma = max(dot(dye, vec3(0.2126, 0.7152, 0.0722)), 0.02);
  vec3 colored = clamp(dye * (lifted / dyeLuma), 0.0, 1.0);
  vec3 soft = softLight(base, dye);
  return mix(soft, colored, 0.55);
}

void main() {
  vec2 p = vec2(v_uv.x, 1.0 - v_uv.y);
  vec3 base = texture(u_camera, v_uv).rgb;
  vec4 maskPx = texture(u_mask, v_uv);
  float hairW = u_hasMask > 0.5 ? maskPx.r : 0.0;
  float skinW = u_hasMask > 0.5 ? maskPx.g : 1.0;
  bool skin = skinW > 0.34;
  bool outer = insidePoly(p, u_outer, 20);
  bool inner = insidePoly(p, u_inner, 20);
  float eye = eyeMask(p);
  float px = max(u_px.x, u_px.y);
  vec3 color = base;
  vec3 skinTone = texture(u_camera, vec2(u_cheekR.x, 1.0 - u_cheekR.y)).rgb;
  vec3 lipInk = adaptInk(u_lip, skinTone, u_lipAdapt);
  vec3 blushInk = adaptInk(u_blush, skinTone, 0.45);

  if (u_hairOn > 0.5 && hairW > 0.03) {
    float luma = dot(base, vec3(0.2126, 0.7152, 0.0722));
    float maxC = max(base.r, max(base.g, base.b));
    float minC = min(base.r, min(base.g, base.b));
    float sat = maxC <= 0.001 ? 0.0 : (maxC - minC) / maxC;
    float light = smoothstep(0.45, 0.70, luma);
    float grey = smoothstep(0.18, 0.02, sat) * step(0.16, luma);
    vec3 dyed = dyeHair(base, u_hair);
    color = mix(color, dyed, hairW * clamp(u_hairStrength, 0.0, 0.5) * (1.0 - max(light, grey)));
  }

  if (u_blushOn > 0.5 && skin && hairW < 0.2 && eye < 0.5) {
    float sigma = max(u_faceUv * 0.18 / 2.5, px * 6.0);
    float gR = exp(-0.5 * dot(p - u_cheekR, p - u_cheekR) / (sigma * sigma + 1e-8));
    float gL = exp(-0.5 * dot(p - u_cheekL, p - u_cheekL) / (sigma * sigma + 1e-8));
    float blush = max(gR, gL) * u_blushPeak;
    vec3 soft = softLight(color, blushInk);
    vec3 mul = color * blushInk;
    color = mix(color, mix(soft, mul, 0.5), blush);
  }

  if (u_browOn > 0.5 && eye < 0.5 && (insideBrow(p, u_browR) || insideBrow(p, u_browL))) {
    vec3 soft = softLight(color, u_brow);
    vec3 mul = color * u_brow;
    color = mix(color, mix(soft, mul, 0.5), u_browMix);
  }

  float kajalW = clamp(u_iod * u_kajalIod, px, px * u_kajalMax);
  float blur = px * ${LINER_BLUR_PX.toFixed(1)};
  vec3 ink = vec3(0.25, 0.14, 0.12);
  if (u_kajal > 0.5 && !inEye(p) && !onIris(p)) {
    float wingR = length(u_upR[0] - u_upR[8]) * u_wing;
    float wingL = length(u_upL[0] - u_upL[8]) * u_wing;
    float line = 0.0;
    line = max(line, linerStroke(p, u_upR, u_centerR, kajalW, blur, wingR));
    line = max(line, linerStroke(p, u_loR, u_centerR, kajalW, blur, 0.0));
    line = max(line, linerStroke(p, u_upL, u_centerL, kajalW, blur, wingL));
    line = max(line, linerStroke(p, u_loL, u_centerL, kajalW, blur, 0.0));
    color = mix(color, color * ink, line * u_kajalMix);
  }

  if (u_lipOn > 0.5 && hairW < 0.25 && eye < 0.5) {
    float outerEdge = polyEdge(p, u_outer, 20);
    float innerEdge = polyEdge(p, u_inner, 20);
    // The inner contour is the open mouth. A tooth just outside that line is
    // still closer to the opening than to the outer lip, so it stays bare.
    // The lip centre is about equidistant and keeps its colour.
    bool opening = inner || (innerEdge + px * 0.5 < outerEdge && innerEdge < px * 1.5);
    float rim = px;
    bool onLip = !opening && (outer || (outerEdge <= rim && outerEdge < innerEdge));
    if (onLip) {
      float reach = px * max(u_lipFeather, 1.0);
      float feather = outer ? smoothstep(0.0, reach, outerEdge) : (1.0 - smoothstep(0.0, rim, outerEdge));
      vec3 soft = softLight(base, lipInk);
      vec3 mul = base * lipInk;
      float lipLuma = dot(base, vec3(0.2126, 0.7152, 0.0722));
      vec3 shaded = lipInk * clamp(lipLuma * 1.35 + 0.45, 0.55, 1.25);
      vec3 body = mix(mix(soft, mul, u_lipBody), shaded, u_lipStamp);
      color = mix(color, body, u_lipMix * feather);
    }
  }

  outColor = vec4(color, 1.0);
}`;

function compile(gl: WebGL2RenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("shader");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader) || "compile";
    gl.deleteShader(shader);
    throw new Error(log);
  }
  return shader;
}

function hexToRgb(hex: string): [number, number, number] {
  const raw = hex.replace("#", "");
  const full = raw.length === 3 ? raw.split("").map((c) => c + c).join("") : raw;
  return [parseInt(full.slice(0, 2), 16) / 255, parseInt(full.slice(2, 4), 16) / 255, parseInt(full.slice(4, 6), 16) / 255];
}

function centroid(points: Pt[], indexes: readonly number[]): Pt {
  let x = 0;
  let y = 0;
  let n = 0;
  for (const index of indexes) {
    const point = points[index];
    if (!point) continue;
    x += point.x;
    y += point.y;
    n += 1;
  }
  return n ? { x: x / n, y: y / n } : { x: 0.5, y: 0.5 };
}

function pack(points: Pt[], indexes: readonly number[], count: number) {
  const out = new Float32Array(count * 2);
  const last = indexes.length - 1;
  for (let i = 0; i < count; i += 1) {
    const point = points[indexes[Math.min(i, last)] ?? indexes[0] ?? 0];
    out[i * 2] = point?.x ?? 0;
    out[i * 2 + 1] = point?.y ?? 0;
  }
  return out;
}

export function createLiveGl(canvas: HTMLCanvasElement): LiveGl | null {
  const context = canvas.getContext("webgl2", { premultipliedAlpha: false, preserveDrawingBuffer: true, antialias: false });
  if (!context) return null;
  const gl: WebGL2RenderingContext = context;
  const program = gl.createProgram();
  if (!program) return null;
  try {
    const vs = compile(gl, gl.VERTEX_SHADER, VERT);
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.bindAttribLocation(program, 0, "a_pos");
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) || "link");
    gl.deleteShader(vs);
    gl.deleteShader(fs);
  } catch (error) {
    console.error(error instanceof Error ? error.message : "live shader");
    gl.deleteProgram(program);
    return null;
  }

  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  const cameraTex = gl.createTexture();
  const maskTex = gl.createTexture();
  const loc = (name: string) => gl.getUniformLocation(program, name);

  function uploadImage(texture: WebGLTexture | null, source: TexImageSource) {
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  function uploadMask(mask: Uint8Array, width: number, height: number) {
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, maskTex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, mask);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  return {
    resize(width: number, height: number) {
      if (canvas.width !== width) canvas.width = width;
      if (canvas.height !== height) canvas.height = height;
      gl.viewport(0, 0, width, height);
    },
    draw(source, mask, maskWidth, maskHeight, points, options, audience) {
      const look = liveEffectsFor(audience, options);
      gl.useProgram(program);
      uploadImage(cameraTex, source);
      gl.uniform1i(loc("u_camera"), 0);
      if (mask && look.hasMask) {
        uploadMask(mask, maskWidth, maskHeight);
        gl.uniform1i(loc("u_mask"), 1);
        gl.uniform1f(loc("u_hasMask"), 1);
      } else {
        gl.uniform1f(loc("u_hasMask"), 0);
      }
      const hasFace = Boolean(points && points.length > 454);
      const blank = new Array(478).fill({ x: 0.5, y: 0.5 }) as Pt[];
      const pts = hasFace && points ? points : blank;
      const faceL = pts[234] ?? { x: 0.3, y: 0.5 };
      const faceR = pts[454] ?? { x: 0.7, y: 0.5 };
      const faceUv = Math.hypot(faceL.x - faceR.x, faceL.y - faceR.y) || 0.4;
      gl.uniform2fv(loc("u_outer"), pack(pts, OUTER_LIP, 20));
      gl.uniform2fv(loc("u_inner"), pack(pts, INNER_LIP, 20));
      gl.uniform2fv(loc("u_browR"), pack(pts, BROW_R, 10));
      gl.uniform2fv(loc("u_browL"), pack(pts, BROW_L, 10));
      gl.uniform2fv(loc("u_upR"), pack(pts, UPPER_LASH_R, 9));
      gl.uniform2fv(loc("u_loR"), pack(pts, LOWER_LASH_R, 9));
      gl.uniform2fv(loc("u_upL"), pack(pts, UPPER_LASH_L, 9));
      gl.uniform2fv(loc("u_loL"), pack(pts, LOWER_LASH_L, 9));
      gl.uniform2fv(loc("u_eyeR"), pack(pts, EYE_R, 16));
      gl.uniform2fv(loc("u_eyeL"), pack(pts, EYE_L, 16));
      const centerR = centroid(pts, EYE_R);
      const centerL = centroid(pts, EYE_L);
      gl.uniform2f(loc("u_centerR"), centerR.x, centerR.y);
      gl.uniform2f(loc("u_centerL"), centerL.x, centerL.y);
      const irisR = pts[468] ?? centerR;
      const irisL = pts[473] ?? centerL;
      const pxUv = Math.max(1 / Math.max(1, canvas.width), 1 / Math.max(1, canvas.height));
      const disc = (center: Pt, ring: readonly number[]) => {
        let radius = 0;
        for (const index of ring) {
          const point = pts[index];
          if (!point) continue;
          radius = Math.max(radius, Math.hypot(point.x - center.x, point.y - center.y));
        }
        return radius + pxUv;
      };
      gl.uniform2f(loc("u_irisR"), irisR.x, irisR.y);
      gl.uniform2f(loc("u_irisL"), irisL.x, irisL.y);
      gl.uniform1f(loc("u_irisRadR"), disc(irisR, IRIS_R));
      gl.uniform1f(loc("u_irisRadL"), disc(irisL, IRIS_L));
      gl.uniform1f(loc("u_iod"), Math.hypot(irisR.x - irisL.x, irisR.y - irisL.y) || faceUv * 0.45);
      const lip = hexToRgb(look.lip || "#9B2335");
      const hair = hexToRgb(look.hair || "#5C3317");
      gl.uniform3f(loc("u_lip"), lip[0], lip[1], lip[2]);
      gl.uniform3f(loc("u_hair"), hair[0], hair[1], hair[2]);
      gl.uniform3f(loc("u_blush"), 0.77, 0.36, 0.42);
      gl.uniform3f(loc("u_brow"), 0.36, 0.22, 0.16);
      const cheekR = pts[50] ?? { x: 0.35, y: 0.55 };
      const cheekL = pts[280] ?? { x: 0.65, y: 0.55 };
      gl.uniform2f(loc("u_cheekR"), cheekR.x, cheekR.y);
      gl.uniform2f(loc("u_cheekL"), cheekL.x, cheekL.y);
      gl.uniform2f(loc("u_px"), 1 / Math.max(1, canvas.width), 1 / Math.max(1, canvas.height));
      gl.uniform1f(loc("u_faceUv"), faceUv);
      gl.uniform1f(loc("u_lipOn"), hasFace && look.lip ? 1 : 0);
      gl.uniform1f(loc("u_kajal"), hasFace && look.kajal ? 1 : 0);
      gl.uniform1f(loc("u_blushOn"), hasFace && look.blush ? 1 : 0);
      gl.uniform1f(loc("u_browOn"), hasFace && look.brow ? 1 : 0);
      gl.uniform1f(loc("u_hairOn"), look.hair ? 1 : 0);
      gl.uniform1f(loc("u_hairStrength"), Math.max(0, Math.min(0.5, look.hairStrength)));
      const intensity = livePreset(options.bridal, options.camera);
      gl.uniform1f(loc("u_lipMix"), intensity.lipMix);
      gl.uniform1f(loc("u_lipFeather"), intensity.lipFeather);
      gl.uniform1f(loc("u_lipBody"), intensity.lipBody);
      gl.uniform1f(loc("u_lipAdapt"), intensity.lipAdapt);
      gl.uniform1f(loc("u_lipStamp"), intensity.lipStamp);
      gl.uniform1f(loc("u_blushPeak"), intensity.blushPeak);
      gl.uniform1f(loc("u_browMix"), intensity.browMix);
      gl.uniform1f(loc("u_kajalMix"), intensity.kajalMix);
      gl.uniform1f(loc("u_kajalIod"), intensity.kajalIod);
      gl.uniform1f(loc("u_kajalMax"), intensity.kajalMax);
      gl.uniform1f(loc("u_wing"), intensity.wing);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    },
    destroy() {
      gl.deleteTexture(cameraTex);
      gl.deleteTexture(maskTex);
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
    },
  };
}
