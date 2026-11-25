/** A colour-only offscreen render target. The scene is painter's-order, so there is no depth buffer. */
export interface Target {
  fb: WebGLFramebuffer;
  tex: WebGLTexture;
  w: number;
  h: number;
  /** Floating-point storage (HDR). Falls back to 8-bit when the GPU cannot render to float. */
  hdr: boolean;
}

/** Fullscreen triangle generated from gl_VertexID — no vertex buffer needed. UV (0,0) is bottom-left. */
export const FULLSCREEN_VERT = `#version 300 es
out vec2 vUv;
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}
`;

/** Thin wrapper over WebGL2: context creation, shader compilation with readable errors, render targets. */
export class GL {
  readonly gl: WebGL2RenderingContext;
  /** True when floating-point render targets are available, which unlocks HDR bloom. */
  readonly hdr: boolean;
  readonly emptyVao: WebGLVertexArrayObject;
  private readonly uniformCache = new Map<WebGLProgram, Map<string, WebGLUniformLocation | null>>();
  /** Scratch pixel for `sync`. */
  private readonly syncPixel = new Uint8Array(4);

  constructor(canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl2', {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      premultipliedAlpha: true,
      preserveDrawingBuffer: false,
      powerPreference: 'high-performance',
    });
    if (!gl) throw new Error('WebGL2 is not available in this browser.');
    this.gl = gl;
    this.hdr =
      gl.getExtension('EXT_color_buffer_float') !== null ||
      gl.getExtension('EXT_color_buffer_half_float') !== null;
    const vao = gl.createVertexArray();
    if (!vao) throw new Error('Could not create a vertex array.');
    this.emptyVao = vao;
    gl.bindVertexArray(vao);
  }

  /** Compiles and links a program. Shader errors are reported with line numbers and then thrown. */
  program(name: string, vertex: string, fragment: string): WebGLProgram {
    const gl = this.gl;
    const compile = (type: number, source: string, label: string): WebGLShader => {
      const shader = gl.createShader(type);
      if (!shader) throw new Error(`${name}: could not allocate ${label} shader`);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const log = gl.getShaderInfoLog(shader) ?? 'unknown error';
        const numbered = source
          .split('\n')
          .map((line, i) => `${String(i + 1).padStart(4)} | ${line}`)
          .join('\n');
        gl.deleteShader(shader);
        throw new Error(`${name} ${label} shader failed to compile:\n${log}\n${numbered}`);
      }
      return shader;
    };
    const vs = compile(gl.VERTEX_SHADER, vertex, 'vertex');
    const fs = compile(gl.FRAGMENT_SHADER, fragment, 'fragment');
    const program = gl.createProgram();
    if (!program) throw new Error(`${name}: could not allocate program`);
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const log = gl.getProgramInfoLog(program) ?? 'unknown error';
      gl.deleteProgram(program);
      throw new Error(`${name} program failed to link:\n${log}`);
    }
    this.uniformCache.set(program, new Map());
    return program;
  }

  /** Location of a uniform (cached; null when the compiler optimised it out, which is harmless). */
  uniform(program: WebGLProgram, name: string): WebGLUniformLocation | null {
    let cache = this.uniformCache.get(program);
    if (!cache) {
      cache = new Map();
      this.uniformCache.set(program, cache);
    }
    if (!cache.has(name)) cache.set(name, this.gl.getUniformLocation(program, name));
    return cache.get(name) ?? null;
  }

  set1(program: WebGLProgram, name: string, x: number): void {
    this.gl.uniform1f(this.uniform(program, name), x);
  }

  set2(program: WebGLProgram, name: string, x: number, y: number): void {
    this.gl.uniform2f(this.uniform(program, name), x, y);
  }

  set3(program: WebGLProgram, name: string, x: number, y: number, z: number): void {
    this.gl.uniform3f(this.uniform(program, name), x, y, z);
  }

  set4(program: WebGLProgram, name: string, x: number, y: number, z: number, w: number): void {
    this.gl.uniform4f(this.uniform(program, name), x, y, z, w);
  }

  /** Binds `unit` and stores it in the uniform, texture-unit 0 by default. */
  texture(program: WebGLProgram, name: string, tex: WebGLTexture, unit = 0): void {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.uniform1i(this.uniform(program, name), unit);
  }

  /** Creates a render target. */
  target(w: number, h: number, hdr = this.hdr): Target {
    const tex = this.gl.createTexture();
    const fb = this.gl.createFramebuffer();
    if (!tex || !fb) throw new Error('Could not allocate a render target');
    const target: Target = { fb, tex, w: 0, h: 0, hdr };
    this.resize(target, w, h);
    return target;
  }

  /** (Re)allocates a target's storage. No-op when the size already matches. */
  resize(target: Target, w: number, h: number): void {
    const gl = this.gl;
    w = Math.max(1, Math.floor(w));
    h = Math.max(1, Math.floor(h));
    if (target.w === w && target.h === h) return;

    gl.bindTexture(gl.TEXTURE_2D, target.tex);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      target.hdr ? gl.RGBA16F : gl.RGBA8,
      w,
      h,
      0,
      gl.RGBA,
      target.hdr ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE,
      null,
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    gl.bindFramebuffer(gl.FRAMEBUFFER, target.fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, target.tex, 0);
    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    if (status !== gl.FRAMEBUFFER_COMPLETE)
      throw new Error(`Render target is incomplete (0x${status.toString(16)})`);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    target.w = w;
    target.h = h;
  }

  /** Renders into `target`, or to the canvas when null. Sets the viewport to match. */
  bind(target: Target | null): void {
    const gl = this.gl;
    if (target) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, target.fb);
      gl.viewport(0, 0, target.w, target.h);
    } else {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    }
  }

  dispose(target: Target): void {
    this.gl.deleteFramebuffer(target.fb);
    this.gl.deleteTexture(target.tex);
  }

  /** Draws the fullscreen triangle into the currently bound target. */
  fullscreen(): void {
    this.gl.drawArrays(this.gl.TRIANGLES, 0, 3);
  }

  /**
   * Blocks until everything drawn so far has finished on the GPU.
   *
   * A one-pixel readback from the canvas waits for every command issued before it. It reads the
   * back buffer rather than the pass's own target, so it works whatever that target's format is.
   * Only the pass profiler calls this: the stall is what makes per-pass timings possible, and
   * exactly why it must never run during normal play.
   */
  sync(): void {
    const gl = this.gl;
    const bound = gl.getParameter(gl.FRAMEBUFFER_BINDING) as WebGLFramebuffer | null;
    if (bound) gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, this.syncPixel);
    if (bound) gl.bindFramebuffer(gl.FRAMEBUFFER, bound);
  }
}
