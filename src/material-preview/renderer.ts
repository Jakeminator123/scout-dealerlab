import { actorRect, backdropRect, DEFAULT_BACKDROP, type BackdropView, type Placement } from './model';

type Source = HTMLImageElement | HTMLVideoElement;
const vertex = `attribute vec2 point; uniform vec4 rect; varying vec2 uv;
void main(){vec2 p=rect.xy+point*rect.zw;gl_Position=vec4(p.x/960.-1.,1.-p.y/540.,0.,1.);uv=point;}`;
// Same green-key thresholds as the verified main dealer-framing contract.
// Only a preview operation: source files and calibration never change.
const fragment = `precision mediump float; varying vec2 uv; uniform sampler2D picture;
uniform float textured; uniform float keyed; uniform float checker; uniform vec3 color; uniform float panorama; uniform vec3 camera;
void main(){vec4 c=vec4(color,1.);if(checker>.5){float v=mod(floor(gl_FragCoord.x/32.)+floor(gl_FragCoord.y/32.),2.);c=vec4(mix(vec3(.13,.16,.20),vec3(.22,.25,.29),v),1.);}
if(textured>.5){vec2 p=uv;if(panorama>.5){float t=tan(camera.z*.5);vec3 r=normalize(vec3((uv.x-.5)*2.*1.7777778*t,(.5-uv.y)*2.*t,1.));r=vec3(r.x,r.y*cos(camera.y)+r.z*sin(camera.y),-r.y*sin(camera.y)+r.z*cos(camera.y));float longitude=atan(r.x,r.z)+camera.x;p=vec2(fract(.5+longitude/6.2831853),.5-asin(clamp(r.y,-1.,1.))/3.14159265);}c=texture2D(picture,p);if(keyed>.5){float g=smoothstep(.23,.38,(c.g-max(c.r,c.b))/max(c.g,.001))*smoothstep(.18,.32,c.g);c.a*=1.-g;c.g=mix(c.g,min(c.g,max(c.r,c.b)),.5*g);}}gl_FragColor=c;}`;

export function createMaterialRenderer(canvas: HTMLCanvasElement) {
  const gl = canvas.getContext('webgl', { alpha: false, antialias: false, preserveDrawingBuffer: true });
  if (!gl) throw new Error('WebGL behövs för materialprovet.');
  const textures = new Map<Source, { texture: WebGLTexture; time: number }>();
  function shader(type: number, source: string) {
    const s = gl!.createShader(type)!; gl!.shaderSource(s, source); gl!.compileShader(s);
    if (!gl!.getShaderParameter(s, gl!.COMPILE_STATUS)) { const error = gl!.getShaderInfoLog(s); gl!.deleteShader(s); throw new Error(error || 'Shaderfel'); }
    return s;
  }
  const vs = shader(gl.VERTEX_SHADER, vertex), fs = shader(gl.FRAGMENT_SHADER, fragment), program = gl.createProgram()!;
  gl.attachShader(program, vs); gl.attachShader(program, fs); gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error('Renderingen kunde inte länkas.');
  gl.useProgram(program);
  const buffer = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 1]), gl.STATIC_DRAW);
  const point = gl.getAttribLocation(program, 'point'); gl.enableVertexAttribArray(point); gl.vertexAttribPointer(point, 2, gl.FLOAT, false, 0, 0);
  const location = Object.fromEntries(['rect', 'textured', 'keyed', 'checker', 'color', 'panorama', 'camera'].map(name => [name, gl.getUniformLocation(program, name)]));
  gl.uniform1i(gl.getUniformLocation(program, 'picture'), 0);
  gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.viewport(0, 0, 1920, 1080);
  // Keep a complete texture bound even for a solid-color pass.
  const blank = gl.createTexture()!; gl.bindTexture(gl.TEXTURE_2D, blank);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255, 255, 255, 255]));
  function draw(rect: number[], source: Source | null, key = false, checker = false, color = '#101419', view?: BackdropView) {
    gl!.uniform1f(location.panorama, view?.projection === 'panorama' ? 1 : 0); gl!.uniform3f(location.camera, (view?.yaw || 0)*Math.PI/180, (view?.pitch || 0)*Math.PI/180, (view?.fov || 65)*Math.PI/180);
    gl!.uniform4fv(location.rect, rect); gl!.uniform1f(location.textured, source ? 1 : 0); gl!.uniform1f(location.keyed, key ? 1 : 0); gl!.uniform1f(location.checker, checker ? 1 : 0);
    gl!.uniform3f(location.color, parseInt(color.slice(1, 3), 16) / 255, parseInt(color.slice(3, 5), 16) / 255, parseInt(color.slice(5, 7), 16) / 255);
    if (source) {
      let entry = textures.get(source);
      const time = source instanceof HTMLVideoElement ? source.currentTime : 0;
      if (!entry) { entry = { texture: gl!.createTexture()!, time: -1 }; textures.set(source, entry); gl!.bindTexture(gl!.TEXTURE_2D, entry.texture); for (const side of [gl!.TEXTURE_WRAP_S, gl!.TEXTURE_WRAP_T]) gl!.texParameteri(gl!.TEXTURE_2D, side, gl!.CLAMP_TO_EDGE); for (const filter of [gl!.TEXTURE_MIN_FILTER, gl!.TEXTURE_MAG_FILTER]) gl!.texParameteri(gl!.TEXTURE_2D, filter, gl!.LINEAR); }
      gl!.bindTexture(gl!.TEXTURE_2D, entry.texture);
      if (entry.time !== time) { gl!.texImage2D(gl!.TEXTURE_2D, 0, gl!.RGBA, gl!.RGBA, gl!.UNSIGNED_BYTE, source); entry.time = time; }
    } else gl!.bindTexture(gl!.TEXTURE_2D, blank);
    gl!.drawArrays(gl!.TRIANGLES, 0, 6);
  }
  return {
    render(source: Source | null, background: HTMLImageElement | null, backgroundId: string, color: string, placement: Placement, view: BackdropView = DEFAULT_BACKDROP) {
      for (const [element, entry] of textures) if (element !== source && element !== background) { gl.deleteTexture(entry.texture); textures.delete(element); }
      gl.clear(gl.COLOR_BUFFER_BIT); draw([0, 0, 1920, 1080], null, false, backgroundId === 'checker', color);
      if (background?.naturalWidth) draw(view.projection === 'panorama' ? [0, 0, 1920, 1080] : backdropRect(background.naturalWidth, background.naturalHeight, view), background, false, false, color, view);
      const width = source instanceof HTMLVideoElement ? source.videoWidth : source?.naturalWidth;
      const height = source instanceof HTMLVideoElement ? source.videoHeight : source?.naturalHeight;
      if (source && width && height && (!(source instanceof HTMLVideoElement) || source.readyState >= 2)) draw(actorRect(width, height, placement), source, placement.key);
    },
    dispose() { for (const entry of textures.values()) gl.deleteTexture(entry.texture); textures.clear(); gl.deleteTexture(blank); gl.deleteBuffer(buffer); gl.deleteProgram(program); gl.deleteShader(vs); gl.deleteShader(fs); },
  };
}
