/**
 * One shader pass for the tonal sliders. The video frame stays on the GPU.
 */

export type TonalGrade = {
  highlight: number;
  shadow: number;
  whites: number;
  blacks: number;
  brilliance: number;
  sharpen: number;
  clarity: number;
};

const VERT = `
attribute vec2 aPos;
attribute vec2 aUv;
varying vec2 vUv;
void main() {
  vUv = aUv;
  gl_Position = vec4(aPos, 0.0, 1.0);
}
`;

const FRAG = `
precision mediump float;
uniform sampler2D uTex;
uniform vec2 uTexel;
uniform float uHighlight;
uniform float uShadow;
uniform float uWhites;
uniform float uBlacks;
uniform float uBrilliance;
uniform float uSharpen;
uniform float uClarity;
varying vec2 vUv;
void main() {
  vec4 c = texture2D(uTex, vUv);
  vec3 rgb = c.rgb;
  float luma = dot(rgb, vec3(0.2126, 0.7152, 0.0722));
  rgb += smoothstep(0.45, 1.0, luma) * uHighlight * 0.6;
  rgb += smoothstep(0.55, 0.0, luma) * uShadow * 0.6;
  rgb += smoothstep(0.7, 1.0, luma) * uWhites * 0.5;
  rgb += smoothstep(0.3, 0.0, luma) * uBlacks * 0.5;
  rgb += (rgb - vec3(0.5)) * uBrilliance * 0.5;
  vec3 around = (
    texture2D(uTex, vUv + vec2(uTexel.x, 0.0)).rgb +
    texture2D(uTex, vUv - vec2(uTexel.x, 0.0)).rgb +
    texture2D(uTex, vUv + vec2(0.0, uTexel.y)).rgb +
    texture2D(uTex, vUv - vec2(0.0, uTexel.y)).rgb
  ) * 0.25;
  rgb += (rgb - around) * (uSharpen + uClarity);
  gl_FragColor = vec4(clamp(rgb, 0.0, 1.0), c.a);
}
`;

type GradeState = {
  gl: WebGLRenderingContext;
  program: WebGLProgram;
  buffer: WebGLBuffer;
  texture: WebGLTexture;
  aPos: number;
  aUv: number;
  uTexel: WebGLUniformLocation | null;
  uHighlight: WebGLUniformLocation | null;
  uShadow: WebGLUniformLocation | null;
  uWhites: WebGLUniformLocation | null;
  uBlacks: WebGLUniformLocation | null;
  uBrilliance: WebGLUniformLocation | null;
  uSharpen: WebGLUniformLocation | null;
  uClarity: WebGLUniformLocation | null;
};

/** Leave the upload unflipped. The quad samples v=0 along its top edge. */
export const GRADE_UNPACK_FLIP_Y = 0;

const states = new WeakMap<HTMLCanvasElement, GradeState>();

function compile(gl: WebGLRenderingContext, type: number, source: string): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

function ensureState(canvas: HTMLCanvasElement): GradeState | null {
  const existing = states.get(canvas);
  if (existing) return existing;
  const gl = canvas.getContext('webgl', { premultipliedAlpha: false, alpha: true });
  if (!gl) return null;
  const vert = compile(gl, gl.VERTEX_SHADER, VERT);
  const frag = compile(gl, gl.FRAGMENT_SHADER, FRAG);
  if (!vert || !frag) return null;
  const program = gl.createProgram();
  if (!program) return null;
  gl.attachShader(program, vert);
  gl.attachShader(program, frag);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return null;
  const buffer = gl.createBuffer();
  const texture = gl.createTexture();
  if (!buffer || !texture) return null;
  const state: GradeState = {
    gl,
    program,
    buffer,
    texture,
    aPos: gl.getAttribLocation(program, 'aPos'),
    aUv: gl.getAttribLocation(program, 'aUv'),
    uTexel: gl.getUniformLocation(program, 'uTexel'),
    uHighlight: gl.getUniformLocation(program, 'uHighlight'),
    uShadow: gl.getUniformLocation(program, 'uShadow'),
    uWhites: gl.getUniformLocation(program, 'uWhites'),
    uBlacks: gl.getUniformLocation(program, 'uBlacks'),
    uBrilliance: gl.getUniformLocation(program, 'uBrilliance'),
    uSharpen: gl.getUniformLocation(program, 'uSharpen'),
    uClarity: gl.getUniformLocation(program, 'uClarity')
  };
  states.set(canvas, state);
  return state;
}

function fitRect(
  sourceWidth: number,
  sourceHeight: number,
  width: number,
  height: number,
  fit: string | undefined
): { x: number; y: number; w: number; h: number } {
  if (fit === 'fill') return { x: 0, y: 0, w: width, h: height };
  const scale =
    fit === 'cover'
      ? Math.max(width / sourceWidth, height / sourceHeight)
      : Math.min(width / sourceWidth, height / sourceHeight);
  const w = sourceWidth * scale;
  const h = sourceHeight * scale;
  return { x: (width - w) / 2, y: (height - h) / 2, w, h };
}

/** Draw one source frame through the tonal shader. Returns false when WebGL is unavailable. */
export function paintGradedFrame(
  canvas: HTMLCanvasElement,
  source: CanvasImageSource,
  width: number,
  height: number,
  fit: string | undefined,
  grade: TonalGrade
): boolean {
  const state = ensureState(canvas);
  if (!state) return false;
  const gl = state.gl;
  const sourceWidth =
    'videoWidth' in source && typeof source.videoWidth === 'number' && source.videoWidth > 0
      ? source.videoWidth
      : 'naturalWidth' in source && typeof source.naturalWidth === 'number' && source.naturalWidth > 0
        ? source.naturalWidth
        : width;
  const sourceHeight =
    'videoHeight' in source && typeof source.videoHeight === 'number' && source.videoHeight > 0
      ? source.videoHeight
      : 'naturalHeight' in source && typeof source.naturalHeight === 'number' && source.naturalHeight > 0
        ? source.naturalHeight
        : height;
  const rect = fitRect(sourceWidth, sourceHeight, width, height, fit);
  const x0 = (rect.x / width) * 2 - 1;
  const x1 = ((rect.x + rect.w) / width) * 2 - 1;
  const y0 = 1 - ((rect.y + rect.h) / height) * 2;
  const y1 = 1 - (rect.y / height) * 2;
  const verts = new Float32Array([
    x0, y0, 0, 1,
    x1, y0, 1, 1,
    x0, y1, 0, 0,
    x1, y1, 1, 0
  ]);
  gl.viewport(0, 0, width, height);
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.useProgram(state.program);
  gl.bindBuffer(gl.ARRAY_BUFFER, state.buffer);
  gl.bufferData(gl.ARRAY_BUFFER, verts, gl.DYNAMIC_DRAW);
  gl.enableVertexAttribArray(state.aPos);
  gl.vertexAttribPointer(state.aPos, 2, gl.FLOAT, false, 16, 0);
  gl.enableVertexAttribArray(state.aUv);
  gl.vertexAttribPointer(state.aUv, 2, gl.FLOAT, false, 16, 8);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, state.texture);
  // The quad already puts v=0 at the top. Flipping the upload again inverts the picture.
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, GRADE_UNPACK_FLIP_Y);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source as TexImageSource);
  const unit = (value: number) => Math.min(1, Math.max(-1, value / 100));
  gl.uniform2f(state.uTexel, 1 / Math.max(1, sourceWidth), 1 / Math.max(1, sourceHeight));
  gl.uniform1f(state.uHighlight, unit(grade.highlight));
  gl.uniform1f(state.uShadow, unit(grade.shadow));
  gl.uniform1f(state.uWhites, unit(grade.whites));
  gl.uniform1f(state.uBlacks, unit(grade.blacks));
  gl.uniform1f(state.uBrilliance, unit(grade.brilliance));
  gl.uniform1f(state.uSharpen, unit(grade.sharpen));
  gl.uniform1f(state.uClarity, unit(grade.clarity));
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  return true;
}
