/**
 * On-device live look. The shader keeps the camera texture and blends
 * makeup and hair colour into it. Masks clip the blend; landmarks only
 * describe lips, lids and brows. Nothing here fills an eye.
 */

import {
  BROW_L,
  BROW_R,
  INNER_LIP,
  LOWER_LASH_L,
  LOWER_LASH_R,
  OUTER_LIP,
  UPPER_LASH_L,
  UPPER_LASH_R,
  type Pt,
} from "@/lib/face/makeup-paint";

export type LiveLookOptions = {
  lip: string | null;
  kajal: boolean;
  lashes: boolean;
  blush: boolean;
  brow: boolean;
  hair: string | null;
  /** 0–1. How strongly a hair colour replaces the hair hue while keeping luminosity. */
  hairStrength: number;
  hasMask: boolean;
};

export type LiveGl = {
  draw: (source: TexImageSource, mask: Uint8Array | null, maskWidth: number, maskHeight: number, points: Pt[] | null, options: LiveLookOptions) => void;
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
uniform float u_lashes;
uniform float u_blushOn;
uniform float u_browOn;
uniform float u_hairOn;
uniform float u_hairStrength;
uniform float u_hasMask;
uniform float u_noseY;
uniform float u_faceCx;
uniform float u_faceHalf;

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

float lineField(vec2 p, vec2 poly[9], int n, float width) {
  float best = width;
  for (int i = 0; i < 8; i++) {
    if (i + 1 >= n) break;
    vec2 a = poly[i];
    vec2 b = poly[i + 1];
    vec2 ab = b - a;
    float denom = dot(ab, ab) + 1e-5;
    float t = clamp(dot(p - a, ab) / denom, 0.0, 1.0);
    best = min(best, length(p - (a + ab * t)));
  }
  return 1.0 - smoothstep(width * 0.45, width, best);
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

float classAt(vec2 uv) {
  return floor(texture(u_mask, uv).r * 255.0 + 0.5);
}

float lashField(vec2 p, vec2 poly[9], int n, float len, float width) {
  float best = width;
  for (int i = 0; i < 7; i++) {
    if (i + 2 >= n) break;
    vec2 a = poly[i];
    vec2 b = poly[i + 2];
    vec2 ab = b - a;
    vec2 dir = ab / (length(ab) + 1e-5);
    vec2 nrm = vec2(-dir.y, dir.x);
    vec2 mid = (a + b) * 0.5;
    if (dot(nrm, mid - poly[4]) < 0.0) nrm = -nrm;
    vec2 tip = mid + nrm * len;
    vec2 s = tip - mid;
    float t = clamp(dot(p - mid, s) / (dot(s, s) + 1e-5), 0.0, 1.0);
    best = min(best, length(p - (mid + s * t)));
  }
  return 1.0 - smoothstep(width * 0.35, width, best);
}

vec3 softLight(vec3 base, vec3 blend) {
  return (1.0 - 2.0 * blend) * base * base + 2.0 * blend * base;
}

vec3 keepLuma(vec3 base, vec3 dyed) {
  float luma = dot(base, vec3(0.2126, 0.7152, 0.0722));
  float dyedLuma = max(dot(dyed, vec3(0.2126, 0.7152, 0.0722)), 0.02);
  return clamp(dyed * (luma / dyedLuma), 0.0, 1.0);
}

void main() {
  vec2 p = vec2(v_uv.x, 1.0 - v_uv.y);
  vec3 base = texture(u_camera, v_uv).rgb;
  float hairW = 0.0;
  float skinW = 0.0;
  float center = 0.0;
  if (u_hasMask > 0.5) {
    vec2 texel = vec2(1.0) / vec2(textureSize(u_mask, 0));
    center = classAt(v_uv);
    for (int y = -1; y <= 1; y++) {
      for (int x = -1; x <= 1; x++) {
        float cls = classAt(v_uv + texel * vec2(float(x), float(y)));
        if (cls == 1.0) hairW += 1.0;
        if (cls == 2.0 || cls == 3.0) skinW += 1.0;
      }
    }
    hairW /= 9.0;
    skinW /= 9.0;
  }
  bool skin = u_hasMask < 0.5 || skinW > 0.34;
  bool beard = center == 1.0 && p.y > u_noseY && abs(p.x - u_faceCx) < u_faceHalf;
  bool outer = insidePoly(p, u_outer, 20);
  bool inner = insidePoly(p, u_inner, 20);
  vec3 color = base;

  if (u_hairOn > 0.5 && hairW > 0.2 && !beard && !(outer && !inner)) {
    vec3 dyed = mix(base, u_hair, u_hairStrength);
    color = mix(color, keepLuma(base, dyed), hairW * 0.92);
  }

  if (u_blushOn > 0.5 && skin && !beard) {
    float r = u_faceUv * 0.18;
    float blush = max(
      1.0 - smoothstep(r * 0.15, r, length(p - u_cheekR)),
      1.0 - smoothstep(r * 0.15, r, length(p - u_cheekL))
    );
    color = mix(color, softLight(color, u_blush), blush * 0.28);
  }

  if (u_browOn > 0.5 && (insideBrow(p, u_browR) || insideBrow(p, u_browL))) {
    color = mix(color, color * u_brow, 0.32);
  }

  float width = max(u_px.x, u_px.y) * 2.4;
  float kajalA = 0.0;
  if (u_kajal > 0.5) {
    kajalA = max(kajalA, lineField(p, u_upR, 9, width));
    kajalA = max(kajalA, lineField(p, u_loR, 9, width * 0.85));
    kajalA = max(kajalA, lineField(p, u_upL, 9, width));
    kajalA = max(kajalA, lineField(p, u_loL, 9, width * 0.85));
    vec2 wingDir = normalize(u_upR[0] - u_upR[2] + vec2(1e-4));
    float wing = 1.0 - smoothstep(width * 0.4, width, length(p - (u_upR[0] + wingDir * u_faceUv * 0.045)));
    kajalA = max(kajalA, wing * 0.85);
    wingDir = normalize(u_upL[0] - u_upL[2] + vec2(1e-4));
    wing = 1.0 - smoothstep(width * 0.4, width, length(p - (u_upL[0] + wingDir * u_faceUv * 0.045)));
    kajalA = max(kajalA, wing * 0.85);
    color = mix(color, color * vec3(0.08, 0.06, 0.07), kajalA * 0.72);
  }

  if (u_lashes > 0.5) {
    float lash = max(
      lashField(p, u_upR, 9, u_faceUv * 0.03, width * 0.45),
      lashField(p, u_upL, 9, u_faceUv * 0.03, width * 0.45)
    );
    color = mix(color, color * vec3(0.05, 0.04, 0.05), lash * 0.8);
  }

  if (u_lipOn > 0.5 && outer && !inner && skin && hairW < 0.45 && !beard) {
    float edge = max(u_faceUv * 0.012, max(u_px.x, u_px.y) * 1.5);
    float dist = min(polyEdge(p, u_outer, 20), polyEdge(p, u_inner, 20));
    float feather = smoothstep(0.0, edge, dist);
    float clip = u_hasMask > 0.5 ? skinW : 1.0;
    color = mix(color, softLight(color, u_lip), 0.62 * feather * clip);
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

function pack(points: Pt[], indexes: number[], count: number) {
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
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, width, height, 0, gl.RED, gl.UNSIGNED_BYTE, mask);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  return {
    resize(width: number, height: number) {
      if (canvas.width !== width) canvas.width = width;
      if (canvas.height !== height) canvas.height = height;
      gl.viewport(0, 0, width, height);
    },
    draw(source, mask, maskWidth, maskHeight, points, options) {
      gl.useProgram(program);
      uploadImage(cameraTex, source);
      gl.uniform1i(loc("u_camera"), 0);
      if (mask && options.hasMask) {
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
      const lip = hexToRgb(options.lip || "#9B2335");
      const hair = hexToRgb(options.hair || "#5C3317");
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
      gl.uniform1f(loc("u_lipOn"), hasFace && options.lip ? 1 : 0);
      gl.uniform1f(loc("u_kajal"), hasFace && options.kajal ? 1 : 0);
      gl.uniform1f(loc("u_lashes"), hasFace && options.lashes ? 1 : 0);
      gl.uniform1f(loc("u_blushOn"), hasFace && options.blush ? 1 : 0);
      gl.uniform1f(loc("u_browOn"), hasFace && options.brow ? 1 : 0);
      gl.uniform1f(loc("u_hairOn"), options.hair ? 1 : 0);
      gl.uniform1f(loc("u_hairStrength"), Math.max(0, Math.min(1, options.hairStrength)));
      gl.uniform1f(loc("u_noseY"), hasFace ? (pts[2]?.y ?? 0.55) : 2);
      gl.uniform1f(loc("u_faceCx"), (faceL.x + faceR.x) / 2);
      gl.uniform1f(loc("u_faceHalf"), faceUv * 0.42);
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
