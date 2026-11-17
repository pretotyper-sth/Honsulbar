const vertexSource = `
attribute vec3 a_position;
attribute vec3 a_color;
uniform vec3 u_eye;
uniform vec2 u_yaw;
uniform vec2 u_pitch;
uniform vec3 u_projection;
varying vec3 v_color;
void main() {
  vec3 point = a_position - u_eye;
  float forward = point.x * u_yaw.x + point.z * u_yaw.y;
  float x = point.z * u_yaw.x - point.x * u_yaw.y;
  float y = point.y * u_pitch.y - forward * u_pitch.x;
  float depth = forward * u_pitch.y + point.y * u_pitch.x;
  // Map .24 through 80 world units to the depth buffer.
  gl_Position = vec4(x * u_projection.x, y * u_projection.y + depth * u_projection.z,
                     depth * 1.006018 - .481444, depth);
  v_color = a_color;
}`;

const fragmentSource = `
precision mediump float;
varying vec3 v_color;
void main() { gl_FragColor = vec4(v_color, 1.0); }
`;

export function createBarRenderer(canvas) {
  const gl = canvas.getContext('webgl', { alpha:true, antialias:true, depth:true });
  if (!gl) return null;

  function compile(type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    return shader;
  }
  const vertex = compile(gl.VERTEX_SHADER, vertexSource);
  const fragment = compile(gl.FRAGMENT_SHADER, fragmentSource);
  const program = gl.createProgram();
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    gl.deleteProgram(program);
    return null;
  }

  const buffer = gl.createBuffer();
  const position = gl.getAttribLocation(program, 'a_position');
  const color = gl.getAttribLocation(program, 'a_color');
  const eye = gl.getUniformLocation(program, 'u_eye');
  const yaw = gl.getUniformLocation(program, 'u_yaw');
  const pitch = gl.getUniformLocation(program, 'u_pitch');
  const projection = gl.getUniformLocation(program, 'u_projection');
  const palette = new Map();
  let vertices = new Float32Array(0);

  function draw(faces, camera, pixelWidth, pixelHeight) {
    if (gl.isContextLost()) return false;
    const length = faces.reduce((count, face) => count + (face.points.length - 2) * 18, 0);
    if (vertices.length < length) vertices = new Float32Array(length * 2);
    let offset = 0;
    for (const face of faces) {
      let rgb = palette.get(face.color);
      if (!rgb) {
        const value = Number.parseInt(face.color.slice(1),16);
        rgb = [value >> 16, (value >> 8) & 255, value & 255].map(channel => channel / 255);
        palette.set(face.color, rgb);
      }
      const points = face.points;
      for (let i = 1; i + 1 < points.length; i++) {
        for (const point of [points[0], points[i], points[i+1]]) {
          vertices.set(point, offset);
          vertices.set(rgb, offset + 3);
          offset += 6;
        }
      }
    }

    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
    }
    gl.viewport(0, 0, pixelWidth, pixelHeight);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.useProgram(program);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, vertices.subarray(0, offset), gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 3, gl.FLOAT, false, 24, 0);
    gl.enableVertexAttribArray(color);
    gl.vertexAttribPointer(color, 3, gl.FLOAT, false, 24, 12);
    gl.uniform3fv(eye, camera.eye);
    gl.uniform2fv(yaw, camera.yaw);
    gl.uniform2fv(pitch, camera.pitch);
    gl.uniform3fv(projection, camera.projection);
    gl.drawArrays(gl.TRIANGLES, 0, offset / 6);
    return true;
  }

  return { draw, dispose() { gl.deleteBuffer(buffer); gl.deleteProgram(program); } };
}
