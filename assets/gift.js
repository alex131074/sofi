/* 3D: готовый подарок – букет, плюшевый мишка и гелиевые шары на ниточках. Чистый WebGL, без библиотек. */
(function () {
  var cv = document.getElementById('sf');
  var gl = cv && (cv.getContext('webgl', { alpha: true, antialias: true, premultipliedAlpha: true }) || cv.getContext('experimental-webgl'));
  if (!gl) { document.documentElement.classList.add('no-gl'); window.SF = { scroll: function () {}, live: function () {} }; return; }
  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var PI = Math.PI;

  /* ---------- математика ---------- */
  function mul(a, b) { var o = new Float32Array(16); for (var c = 0; c < 4; c++) for (var r = 0; r < 4; r++) o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3]; return o; }
  function ident() { return new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]); }
  function trans(x, y, z) { var m = ident(); m[12] = x; m[13] = y; m[14] = z; return m; }
  function scl(x, y, z) { var m = ident(); m[0] = x; m[5] = y; m[10] = z; return m; }
  function rotX(a) { var c = Math.cos(a), s = Math.sin(a), m = ident(); m[5] = c; m[6] = s; m[9] = -s; m[10] = c; return m; }
  function rotY(a) { var c = Math.cos(a), s = Math.sin(a), m = ident(); m[0] = c; m[2] = -s; m[8] = s; m[10] = c; return m; }
  function rotZ(a) { var c = Math.cos(a), s = Math.sin(a), m = ident(); m[0] = c; m[1] = s; m[4] = -s; m[5] = c; return m; }
  function persp(fov, asp, n, f) { var t = 1 / Math.tan(fov / 2), m = new Float32Array(16); m[0] = t / asp; m[5] = t; m[10] = (f + n) / (n - f); m[11] = -1; m[14] = 2 * f * n / (n - f); return m; }
  function norm(v) { var l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; }
  function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function lookAt(e, t) { var z = norm([e[0] - t[0], e[1] - t[1], e[2] - t[2]]), x = norm(cross([0, 1, 0], z)), y = cross(z, x); return new Float32Array([x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, -dot(x, e), -dot(y, e), -dot(z, e), 1]); }
  function basis(d) { var y = norm(d), up = Math.abs(y[2]) < .9 ? [0, 0, 1] : [1, 0, 0], x = norm(cross(up, y)), z = cross(x, y); return new Float32Array([x[0], x[1], x[2], 0, y[0], y[1], y[2], 0, z[0], z[1], z[2], 0, 0, 0, 0, 1]); }
  function chain() { var m = arguments[0]; for (var i = 1; i < arguments.length; i++) m = mul(m, arguments[i]); return m; }

  /* ---------- геометрия ---------- */
  function Geo() { this.d = []; }
  Geo.prototype.surf = function (F, nu, nv, M) { // F(u,v) -> [x,y,z,m], нормали по разностям
    M = M || ident(); var P = [], i, j, e = 1e-3;
    for (j = 0; j <= nv; j++) for (i = 0; i <= nu; i++) {
      var u = i / nu, v = j / nv, p = F(u, v), pu = F(Math.min(1, u + e), v), pu2 = F(Math.max(0, u - e), v), pv = F(u, Math.min(1, v + e)), pv2 = F(u, Math.max(0, v - e));
      var n = cross([pu[0] - pu2[0], pu[1] - pu2[1], pu[2] - pu2[2]], [pv[0] - pv2[0], pv[1] - pv2[1], pv[2] - pv2[2]]);
      if (!(n[0] || n[1] || n[2])) n = [0, 1, 0];
      P.push([p, norm(n)]);
    }
    var w = nu + 1;
    for (j = 0; j < nv; j++) for (i = 0; i < nu; i++) {
      var a = P[j * w + i], b = P[j * w + i + 1], c = P[(j + 1) * w + i + 1], d = P[(j + 1) * w + i];
      this.tri(a, b, c, M); this.tri(a, c, d, M);
    }
  };
  Geo.prototype.tri = function () {
    var M = arguments[3], self = this;
    for (var k = 0; k < 3; k++) {
      var q = arguments[k], p = q[0], n = q[1];
      self.d.push(M[0] * p[0] + M[4] * p[1] + M[8] * p[2] + M[12], M[1] * p[0] + M[5] * p[1] + M[9] * p[2] + M[13], M[2] * p[0] + M[6] * p[1] + M[10] * p[2] + M[14],
        M[0] * n[0] + M[4] * n[1] + M[8] * n[2], M[1] * n[0] + M[5] * n[1] + M[9] * n[2], M[2] * n[0] + M[6] * n[1] + M[10] * n[2], p[3]);
    }
  };
  Geo.prototype.upload = function () {
    var b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(this.d), gl.STATIC_DRAW);
    var n = this.d.length / 7; this.d = null; return { b: b, n: n };
  };

  /* лепесток: растёт вдоль y, края загибаются к центру цветка, кончик отгибается наружу */
  function petal(g, o) {
    var F = function (u, v) {
      var s = u * 2 - 1, w = o.w * Math.pow(Math.sin(PI * (.08 + .86 * v)), o.sh || .6);
      var x = s * w, y = o.l * v, z = -o.cup * s * s * w + o.curl * v * v * v * o.l;
      y -= o.tipDip ? o.tipDip * s * s * v * v : 0;
      return [x, y, z, o.m === undefined ? v : o.m];
    };
    g.surf(F, o.nu || 7, o.nv || 8, chain(rotY(o.a), trans(0, o.y || 0, o.r), rotX(o.t)));
  }
  function disc(g, r, h, m, M) { // приплюснутая полусфера: серединка, чашелистик
    g.surf(function (u, v) { var a = u * 2 * PI, b = v * PI / 2; return [Math.cos(a) * Math.cos(b) * r, Math.sin(b) * h, Math.sin(a) * Math.cos(b) * r, m]; }, 18, 5, M);
  }

  /* роза: тугой бутон внутри, раскрытые лепестки снаружи */
  var rose = new Geo(), GA = 2.39996;
  [[5, .14, .32, .5, .2, .25, .02], [5, .45, .42, .62, .3, .4, .06], [6, .8, .52, .72, .38, .5, .12], [6, 1.12, .6, .76, .44, .55, .22]].forEach(function (L, li) {
    for (var k = 0; k < L[0]; k++) petal(rose, { a: k / L[0] * 2 * PI + li * .7, t: L[1], w: L[2], l: L[3], r: L[4] * .35, cup: L[5], curl: L[6], y: -li * .05 });
  });
  disc(rose, .34, -.28, .1, ident());
  var roseB = rose.upload();

  /* кустовая роза: маленькая и раскрытая */
  var spray = new Geo();
  [[5, .5, .3, .4, .2, .35, .05], [6, 1.0, .36, .46, .3, .3, .15]].forEach(function (L, li) {
    for (var k = 0; k < L[0]; k++) petal(spray, { a: k / L[0] * 2 * PI + li * .6, t: L[1], w: L[2], l: L[3], r: L[4] * .3, cup: L[5], curl: L[6] });
  });
  disc(spray, .2, -.18, .1, ident());
  var sprayB = spray.upload();

  /* хризантема-ромашка: серединка и два ряда узких лепестков */
  var daisy = new Geo();
  [[18, 1.25, .1, .78, .02], [16, 1.5, .09, .7, .1]].forEach(function (L, li) {
    for (var k = 0; k < L[0]; k++) petal(daisy, { a: (k + li * .5) / L[0] * 2 * PI, t: L[1], w: L[2], l: L[3], r: .18, cup: .5, curl: L[4], sh: .45, nu: 3, nv: 6, y: .04 - li * .03 });
  });
  disc(daisy, .24, .14, 2, trans(0, .02, 0));
  var daisyB = daisy.upload();

  /* лист эвкалипта/зелени */
  var leaf = new Geo();
  petal(leaf, { a: 0, t: 0, w: .26, l: 1.25, r: 0, cup: .25, curl: .25, sh: .9, nv: 9 });
  var leafB = leaf.upload();

  /* обёртка: два слоя бумаги с волнистым краем, спереди ниже, чтобы цветы были видны */
  function wrapGeo(rot, lift, waves, m) {
    var g = new Geo();
    g.surf(function (u, v) {
      var a = u * 2 * PI, t = v;
      var front = Math.max(0, Math.cos(a - PI / 2 + rot));
      var top = .55 + lift - 1.0 * front * front + .16 * Math.sin(a * waves);
      var y = -3.3 + (top + 3.3) * t;
      var r = (.32 + Math.pow(t, 1.25) * .98) * (1 + .05 * Math.sin(a * waves + 1) * t);
      return [Math.cos(a) * r, y, Math.sin(a) * r, m + t * .9];
    }, 72, 14);
    return g.upload();
  }
  var wrapA = wrapGeo(0, 0, 5, 0), wrapB = wrapGeo(.5, .22, 4, 0);
  var ribbon = new Geo();
  ribbon.surf(function (u, v) { var a = u * 2 * PI, b = v * 2 * PI, R = .52, r = .07; return [Math.cos(a) * (R + Math.cos(b) * r), Math.sin(b) * r * 1.6, Math.sin(a) * (R + Math.cos(b) * r), 2]; }, 40, 8);
  [-1, 1].forEach(function (s) { // хвосты ленты
    ribbon.surf(function (u, v) { var x = s * (.1 + v * .5), y = -v * 1.2, z = .55 + Math.sin(v * 3) * .08; return [x + (u - .5) * .22, y, z + (u - .5) * .02 * s, 2]; }, 2, 8);
  });
  var ribbonB = ribbon.upload();
  var stem = new Geo();
  stem.surf(function (u, v) { var a = u * 2 * PI; return [Math.cos(a) * .05, -v * 1.1, Math.sin(a) * .05, .5]; }, 8, 1);
  var stemB = stem.upload();

  /* ---------- шейдеры ---------- */
  var VS = 'attribute vec3 aP;attribute vec3 aN;attribute float aM;uniform mat4 uVP;uniform mat4 uW;varying vec3 vW;varying vec3 vN;varying float vM;void main(){vec4 w=uW*vec4(aP,1.);vW=w.xyz;vN=mat3(uW[0].xyz,uW[1].xyz,uW[2].xyz)*aN;vM=aM;gl_Position=uVP*w;}';
  var FS = 'precision mediump float;varying vec3 vW;varying vec3 vN;varying float vM;uniform vec3 uC1;uniform vec3 uC2;uniform vec3 uE;uniform float uFade;' +
    'void main(){vec3 N=normalize(vN);vec3 V=normalize(uE-vW);if(dot(N,V)<0.)N=-N;' +
    'vec3 base=vM<1.5?uC1*mix(.58,1.,smoothstep(0.,.95,vM)):uC2;' +
    'vec3 L1=normalize(vec3(-.55,.85,.65));vec3 L2=normalize(vec3(.8,.15,.35));' +
    'float d1=max(0.,dot(N,L1)*.7+.3);float d2=max(0.,dot(N,L2))*.3;float bl=max(0.,dot(-N,L1))*.3;' +
    'float rim=pow(1.-max(dot(N,V),0.),2.5);vec3 H=normalize(L1+V);float sp=pow(max(dot(N,H),0.),36.)*.1;' +
    'float ao=mix(.5,1.,smoothstep(-3.4,1.4,vW.y));' +
    'vec3 c=base*(.26+d1*.82+d2)*ao+base*bl*.8+vec3(sp)+base*rim*.25+vec3(1.,.93,.88)*rim*.12;' +
    'gl_FragColor=vec4(min(c,vec3(1.))*uFade,uFade);}';
  function sh(t, s) { var o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) console.error(gl.getShaderInfoLog(o)); return o; }
  var pg = gl.createProgram(); gl.attachShader(pg, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(pg, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(pg);
  var A = { p: gl.getAttribLocation(pg, 'aP'), n: gl.getAttribLocation(pg, 'aN'), m: gl.getAttribLocation(pg, 'aM') };
  var U = {}; ['uVP', 'uW', 'uC1', 'uC2', 'uE', 'uFade'].forEach(function (n) { U[n] = gl.getUniformLocation(pg, n); });
  gl.useProgram(pg); gl.enable(gl.DEPTH_TEST); gl.clearColor(0, 0, 0, 0);
  [A.p, A.n, A.m].forEach(function (l) { gl.enableVertexAttribArray(l); });

  function draw(buf, W, c1, c2) {
    gl.bindBuffer(gl.ARRAY_BUFFER, buf.b);
    gl.vertexAttribPointer(A.p, 3, gl.FLOAT, false, 28, 0); gl.vertexAttribPointer(A.n, 3, gl.FLOAT, false, 28, 12); gl.vertexAttribPointer(A.m, 1, gl.FLOAT, false, 28, 24);
    gl.uniformMatrix4fv(U.uW, false, W); gl.uniform3fv(U.uC1, c1); gl.uniform3fv(U.uC2, c2 || c1);
    gl.drawArrays(gl.TRIANGLES, 0, buf.n);
  }

  /* ---------- шейдеры ---------- */
  var VS = 'attribute vec3 aP;attribute vec3 aN;attribute float aM;uniform mat4 uVP;uniform mat4 uW;varying vec3 vW;varying vec3 vN;varying float vM;' +
    'void main(){vec4 w=uW*vec4(aP,1.);vW=w.xyz;vN=normalize(mat3(uW)*aN);vM=aM;gl_Position=uVP*w;}';
  var FS = 'precision mediump float;varying vec3 vW;varying vec3 vN;varying float vM;uniform vec3 uC1;uniform vec3 uC2;uniform vec3 uE;uniform float uFade;uniform float uGl;' +
    'void main(){vec3 N=normalize(vN);vec3 V=normalize(uE-vW);if(dot(N,V)<0.)N=-N;' +
    'vec3 base=vM<1.5?uC1*mix(.62,1.,smoothstep(0.,.95,vM)):uC2;' +
    'vec3 L1=normalize(vec3(-.5,.8,.7));vec3 L2=normalize(vec3(.85,.2,.4));' +
    'float d1=max(0.,dot(N,L1)*.6+.4);float d2=max(0.,dot(N,L2))*.25;' +
    'float rim=pow(1.-max(dot(N,V),0.),2.4);' +
    'float sp=pow(max(dot(N,normalize(L1+V)),0.),60.)*uGl;' +
    'vec3 c=base*(.32+d1*.72+d2)+vec3(sp)+mix(vec3(1.,.95,.96),base,.4)*rim*(.12+uGl*.25);' +
    'gl_FragColor=vec4(min(c,vec3(1.))*uFade,uFade);}';
  function sh(t, s) { var o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) console.error(gl.getShaderInfoLog(o)); return o; }
  var pg = gl.createProgram(); gl.attachShader(pg, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(pg, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(pg);
  var A = { p: gl.getAttribLocation(pg, 'aP'), n: gl.getAttribLocation(pg, 'aN'), m: gl.getAttribLocation(pg, 'aM') };
  var U = {}; ['uVP', 'uW', 'uC1', 'uC2', 'uE', 'uFade', 'uGl'].forEach(function (n) { U[n] = gl.getUniformLocation(pg, n); });
  gl.useProgram(pg); gl.enable(gl.DEPTH_TEST); gl.clearColor(0, 0, 0, 0);
  [A.p, A.n, A.m].forEach(function (l) { gl.enableVertexAttribArray(l); });
  function draw(buf, W, c1, c2, gloss) {
    gl.bindBuffer(gl.ARRAY_BUFFER, buf.b);
    gl.vertexAttribPointer(A.p, 3, gl.FLOAT, false, 28, 0); gl.vertexAttribPointer(A.n, 3, gl.FLOAT, false, 28, 12); gl.vertexAttribPointer(A.m, 1, gl.FLOAT, false, 28, 24);
    gl.uniformMatrix4fv(U.uW, false, W); gl.uniform3fv(U.uC1, c1); gl.uniform3fv(U.uC2, c2 || c1); gl.uniform1f(U.uGl, gloss || 0);
    gl.drawArrays(gl.TRIANGLES, 0, buf.n);
  }

  /* ---------- подарок: букет, мишка, шары ---------- */
  var COL = {
    pink: [.96, .56, .68], rasp: [.86, .27, .5], cream: [.99, .9, .78], peach: [.99, .72, .6], white: [.98, .97, .95], lilac: [.76, .64, .92],
    yolk: [.95, .8, .35], green: [.3, .5, .36], euc: [.55, .7, .62], paper: [.99, .82, .88], paper2: [.82, .74, .96], rib: [.62, .5, .9],
    fur: [.83, .62, .44], furL: [.97, .87, .74], dark: [.16, .1, .09], bow: [.95, .45, .62],
    b1: [1, .42, .62], b2: [.42, .86, .74], b3: [.7, .58, 1]
  };
  var sph = new Geo();
  sph.surf(function (u, v) { var a = u * 2 * PI, b = v * PI; return [Math.sin(b) * Math.cos(a), Math.cos(b), Math.sin(b) * Math.sin(a), .95]; }, 28, 18);
  var sphB = sph.upload();
  var ball = new Geo(); // шар: чуть вытянутый книзу, с узелком
  ball.surf(function (u, v) { var a = u * 2 * PI, b = v * PI, r = Math.sin(b) * (1 - .12 * Math.pow(v, 3)); return [r * Math.cos(a) * .82, Math.cos(b) * (1 + .18 * v), r * Math.sin(a) * .82, .95]; }, 32, 22);
  ball.surf(function (u, v) { var a = u * 2 * PI, r = .06 + v * .08; return [Math.cos(a) * r, -1.18 + v * .1, Math.sin(a) * r, .7]; }, 10, 2);
  var ballB = ball.upload();
  var str = new Geo(); // ниточка
  str.surf(function (u, v) { var a = u * 2 * PI; return [Math.cos(a) * .012 + Math.sin(v * 9) * .03, -v, Math.sin(a) * .012, .9]; }, 4, 24);
  var strB = str.upload();

  /* букет */
  var N = 15, FL = [], TYPES = [[roseB, 'pink', 1], [sprayB, 'white', 1.05], [roseB, 'peach', 1], [daisyB, 'white', .85], [roseB, 'rasp', .95], [sprayB, 'lilac', 1.05], [roseB, 'cream', 1]];
  for (var i = 0; i < N; i++) {
    var rho = .95 * Math.sqrt((i + .45) / N), th = i * GA, k = rho / .95;
    var pos = [Math.cos(th) * rho, .6 + .38 * (1 - k * k), Math.sin(th) * rho], T = TYPES[(i * 3) % TYPES.length];
    FL.push({ pos: pos, dir: norm([pos[0] * .7, 1, pos[2] * .7]), b: T[0], c: COL[T[1]], s: T[2] * (.55 + .07 * ((i * 7) % 5) / 4), spin: i * 1.7 });
  }
  var BALLS = [{ x: -1.6, y: 3.0, z: -.6, c: COL.b1, ph: 0 }, { x: .2, y: 3.6, z: -1.1, c: COL.b2, ph: 2 }, { x: 1.7, y: 2.8, z: -.4, c: COL.b3, ph: 4 }];
  var TIE = [-.9, .2, .3];

  /* ---------- кадр ---------- */
  var W = 0, H = 0, live = true, last = 0, time = 0, mx = 0, my = 0, tmx = 0, tmy = 0, fade = 0, scr = 0, scrT = 0, up = 0;
  function resize() {
    var r = cv.getBoundingClientRect(), dpr = Math.min(devicePixelRatio || 1, 2);
    W = Math.max(1, Math.round(r.width * dpr)); H = Math.max(1, Math.round(r.height * dpr));
    if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
    gl.viewport(0, 0, W, H);
  }
  addEventListener('resize', function () { resize(); if (reduce) kick(); });
  if (matchMedia('(hover:hover)').matches) addEventListener('pointermove', function (e) { tmx = e.clientX / innerWidth - .5; tmy = e.clientY / innerHeight - .5; }, { passive: true });
  function E(p, q, s) { return chain(trans(p[0], p[1], p[2]), scl(s[0], s[1], s[2])); }

  function step(dt) {
    var k = 1 - Math.exp(-dt * 5);
    fade += (1 - fade) * (1 - Math.exp(-dt * 3));
    mx += (tmx - mx) * k; my += (tmy - my) * k; scr += (scrT - scr) * k;
    up += (1 - up) * (1 - Math.exp(-dt * 1.6));
  }
  function render() {
    if (!W) resize();
    var asp = W / H, d = 16 * Math.max(1, .9 / asp);
    var az = .15 + (reduce ? 0 : Math.sin(time * .3) * .18) + mx * .45, el = .2 - my * .1, tg = [0, .4, 0];
    var eye = [Math.sin(az) * Math.cos(el) * d, tg[1] + Math.sin(el) * d, Math.cos(az) * Math.cos(el) * d];
    var VP = mul(persp(.5, asp, 1, 80), lookAt(eye, tg));
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.uniformMatrix4fv(U.uVP, false, VP); gl.uniform3f(U.uE, eye[0], eye[1], eye[2]); gl.uniform1f(U.uFade, fade);

    /* мишка сидит справа */
    var bx = 1.25, by = -2.1, sway = reduce ? 0 : Math.sin(time * 1.1) * .05;
    var R = chain(trans(bx, by, .3), rotY(-.35), rotZ(sway));
    draw(sphB, chain(R, E([0, 0, 0], 0, [.78, .88, .68])), COL.fur);
    draw(sphB, chain(R, E([0, -.05, .4], 0, [.45, .55, .35])), COL.furL);
    [-1, 1].forEach(function (s) {
      draw(sphB, chain(R, trans(s * .72, .2, .15), rotZ(s * .7), scl(.24, .48, .24)), COL.fur);
      draw(sphB, chain(R, trans(s * .42, -.72, .45), rotX(1.3), scl(.26, .45, .26)), COL.fur);
      draw(sphB, chain(R, E([s * .42, -.78, .9], 0, [.2, .2, .08])), COL.furL);
    });
    var HD = chain(R, trans(0, 1.18, .05), rotZ(-sway * 2), rotX(reduce ? 0 : Math.sin(time * .9) * .05));
    draw(sphB, chain(HD, scl(.64, .58, .58)), COL.fur);
    [-1, 1].forEach(function (s) {
      draw(sphB, chain(HD, E([s * .48, .44, -.05], 0, [.22, .22, .14])), COL.fur);
      draw(sphB, chain(HD, E([s * .48, .44, .03], 0, [.13, .13, .08])), COL.furL);
      draw(sphB, chain(HD, E([s * .22, .12, .52], 0, [.065, .075, .05])), COL.dark, null, 1.2);
    });
    draw(sphB, chain(HD, E([0, -.12, .48], 0, [.28, .2, .16])), COL.furL);
    draw(sphB, chain(HD, E([0, -.05, .63], 0, [.09, .065, .06])), COL.dark, null, 1.2);
    [-1, 1].forEach(function (s) { draw(sphB, chain(R, trans(s * .18, .66, .45), rotZ(s * 1.2), scl(.2, .12, .1)), COL.bow, null, .5); });
    draw(sphB, chain(R, E([0, .66, .5], 0, [.08, .08, .08])), COL.bow, null, .5);

    /* букет слева */
    var B = chain(trans(-1.0, -.55, .4), rotZ(.18), rotX(.35), scl(.9, .9, .9));
    draw(wrapA, chain(B, scl(.85, .8, .85)), COL.paper);
    draw(wrapB, chain(B, scl(.8, .76, .8)), COL.paper2);
    for (i = 0; i < 9; i++) { var a = i / 9 * 2 * PI + .2, p = [Math.cos(a) * .8, .55, Math.sin(a) * .8]; draw(leafB, chain(B, trans(p[0], p[1], p[2]), basis([p[0], .7, p[2]]), scl(.5, .5, .5)), i % 2 ? COL.euc : COL.green); }
    FL.forEach(function (f, i) { draw(f.b, chain(B, trans(f.pos[0], f.pos[1], f.pos[2]), basis(f.dir), rotY(f.spin), scl(f.s, f.s, f.s)), f.c, COL.yolk); });
    draw(ribbonB, chain(B, trans(0, -1.2, 0), scl(.55, .55, .55)), COL.rib, COL.rib);

    /* шары на ниточках; на прокрутке поднимаются */
    var lift = (1 - up) * -4 + scr * 3.5;
    BALLS.forEach(function (b) {
      var t = reduce ? 0 : time, x = b.x + Math.sin(t * .7 + b.ph) * .15, y = b.y + lift + Math.sin(t * 1.1 + b.ph) * .12, z = b.z;
      var tilt = Math.sin(t * .7 + b.ph) * .08;
      draw(ballB, chain(trans(x, y, z), rotZ(tilt), scl(.72, .72, .72)), b.c, null, 1.3);
      var bot = [x, y - .86, z], dx = TIE[0] - bot[0], dy = TIE[1] - bot[1], dz = TIE[2] - bot[2], L = Math.hypot(dx, dy, dz);
      draw(strB, chain(trans(bot[0], bot[1], bot[2]), basis([-dx, -dy, -dz]), scl(1, L, 1)), [.9, .9, .92]);
    });
  }
  function frame_(now) {
    var dt = Math.min(.05, (now - last) / 1000 || .016); last = now; time += dt;
    step(dt); render();
    if (live) requestAnimationFrame(frame_);
  }
  var pending = false;
  function kick() {
    if (!reduce || pending) return; pending = true;
    requestAnimationFrame(function () { pending = false; for (var i = 0; i < 80; i++) step(.05); render(); });
  }
  window.SF = {
    scroll: function (p) { scrT = Math.max(0, Math.min(1, p)); kick(); },
    live: function (v) { if (reduce || v === live) return; live = v; if (v) { last = performance.now(); requestAnimationFrame(frame_); } }
  };
  resize();
  if (reduce) { kick(); live = false; } else requestAnimationFrame(frame_);
})();
