// RENDER 3D — câmera fixa + API "imediata" sobre Three.js.
//
// O minigame define `draw3d(g, r)` e, A CADA QUADRO, descreve a cena chamando r.box(), r.character()...
// O motor reaproveita os objetos 3D (pool), então não há nada para criar/destruir. Como draw3d só LÊ
// o estado de `g`, o modo em rede continua automático (o cliente chama o mesmo draw3d).
//
// COORDENADAS (1 unidade = 1 pixel da lógica 2D):
//   X = g/p.x (direita)   Z = g/p.y (para "baixo" na tela 2D = em direção à câmera)   Y = altura (para cima)
//   Ou seja: a lógica 2D continua igual e vira o CHÃO do mundo 3D. Chão em y = 0.
// Veja docs/COMO_CRIAR_MINIGAME.md para a lista completa de chamadas.
(function () {
  const hasThree = typeof THREE !== 'undefined';
  const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

  // ---------------- câmera / ambiente padrão ----------------
  const DEFAULT_CAMERA = { pos: [480, 640, 860], target: [480, 0, 300], fov: 38 };
  const DEFAULT_ENV = { bg: '#0a0d11', fog: [1300, 3000], ambient: 0.7, sun: 2.4, sunDir: [-0.45, 1, 0.55], sunColor: '#ffe9cf', hemiSky: '#9fb7d8', hemiGround: '#20160f' };

  // ====================== VALIDADOR (Node / sem WebGL) ======================
  // Mesmo formato da API real; só confere se os números são válidos.
  function makeValidator() {
    const errs = [];
    const chk = (name, args) => {
      for (let i = 0; i < args.length; i++) {
        const a = args[i];
        if (typeof a === 'number' && !Number.isFinite(a)) errs.push(`${name}: argumento ${i + 1} inválido (${a})`);
      }
    };
    const api = {};
    for (const k of ['camera', 'env', 'box', 'cyl', 'sphere', 'cone', 'plane', 'disc', 'ring', 'beam', 'tube', 'light', 'label', 'character']) {
      api[k] = (...args) => { if (k === 'character') { const p = args[0] || {}; chk(k, [p.x, p.y, p.dir || 0]); } else chk(k, args); };
    }
    api.W = TN.W; api.H = TN.H; api.time = 0;
    api.project = () => ({ x: 0, y: 0, visible: true });
    api.unproject = (sx, sy, py = 0) => ({ x: sx, y: py, z: sy });
    return { api, errs };
  }

  TN.R3 = {
    available: false,
    used: false,
    DEFAULT_CAMERA, DEFAULT_ENV,
    // usado pelo tools/simular.js: roda draw3d contra o validador
    validate(round) {
      const { api, errs } = makeValidator();
      round.def.draw3d(round, api);
      return errs;
    },
  };
  if (!hasThree || typeof document === 'undefined') return;

  // ====================== BACKEND THREE.JS ======================
  let renderer, scene, camera, sun, hemi, ambient, canvas3d;
  const tmpV = new THREE.Vector3();
  const unitBox = new THREE.BoxGeometry(1, 1, 1); unitBox.translate(0, 0.5, 0);           // base no y=0
  const unitBoxC = new THREE.BoxGeometry(1, 1, 1);                                        // centralizada (beam)
  const unitTube = new THREE.CylinderGeometry(1, 1, 1, 14);                              // centralizado, eixo Y (tube)
  const upY = new THREE.Vector3(0, 1, 0), dirV = new THREE.Vector3();
  const unitCyl = new THREE.CylinderGeometry(1, 1, 1, 20); unitCyl.translate(0, 0.5, 0);
  const unitCone = new THREE.ConeGeometry(1, 1, 20); unitCone.translate(0, 0.5, 0);
  const unitSphere = new THREE.SphereGeometry(1, 20, 14);
  const unitPlane = new THREE.PlaneGeometry(1, 1); unitPlane.rotateX(-Math.PI / 2);
  const unitDisc = new THREE.CircleGeometry(1, 32); unitDisc.rotateX(-Math.PI / 2);
  const cylGeoms = new Map();
  function cylGeom(sides) {
    if (!sides || sides === 20) return unitCyl;
    let gm = cylGeoms.get(sides);
    if (!gm) { gm = new THREE.CylinderGeometry(1, 1, 1, sides); gm.translate(0, 0.5, 0); cylGeoms.set(sides, gm); }
    return gm;
  }
  const ringGeoms = new Map();
  function ringGeom(innerRatio, arc) {
    const key = innerRatio.toFixed(2) + '|' + arc.toFixed(2);
    let gm = ringGeoms.get(key);
    if (!gm) { gm = new THREE.RingGeometry(innerRatio, 1, 40, 1, Math.PI / 2, Math.PI * 2 * arc); gm.rotateX(-Math.PI / 2); ringGeoms.set(key, gm); }
    return gm;
  }

  const mats = new Map();
  function material(color, o = {}) {
    const glow = !!o.glow;
    const op = Math.round((o.opacity ?? 1) * 20) / 20;   // arredonda para não criar um material por quadro
    const key = `${color}|${glow}|${op}|${o.emissive || ''}|${o.emissiveIntensity ?? ''}|${o.additive ? 1 : 0}|${o.metal ?? ''}|${o.rough ?? ''}|${o.flash ? 1 : 0}`;
    let m = mats.get(key);
    if (!m) {
      if (glow) m = new THREE.MeshBasicMaterial({ color, transparent: op < 1, opacity: op, blending: o.additive ? THREE.AdditiveBlending : THREE.NormalBlending, depthWrite: op >= 1 });
      else m = new THREE.MeshStandardMaterial({ color, roughness: o.rough ?? 0.75, metalness: o.metal ?? 0.08, transparent: op < 1, opacity: op, depthWrite: op >= 1, envMapIntensity: 0.55 });
      if (!glow && (o.emissive || o.flash)) { m.emissive = new THREE.Color(o.flash ? '#ffffff' : o.emissive); m.emissiveIntensity = o.flash ? 0.9 : (o.emissiveIntensity ?? 1); }
      mats.set(key, m);
    }
    return m;
  }

  // pools por tipo de primitiva
  const pools = {};
  function take(kind, geom) {
    const pool = pools[kind] || (pools[kind] = { list: [], n: 0 });
    let mesh = pool.list[pool.n];
    if (!mesh) { mesh = new THREE.Mesh(geom, undefined); mesh.castShadow = true; mesh.receiveShadow = true; scene.add(mesh); pool.list.push(mesh); }
    pool.n++;
    mesh.visible = true;
    if (geom && mesh.geometry !== geom) mesh.geometry = geom;
    mesh.rotation.set(0, 0, 0);
    return mesh;
  }
  function place(mesh, x, y, z, sx, sy, sz, color, o) {
    mesh.position.set(x, y, z);
    mesh.scale.set(sx || 0.001, sy || 0.001, sz || 0.001);
    if (o.rotY) mesh.rotation.y = o.rotY;
    if (o.rotX) mesh.rotation.x = o.rotX;
    if (o.rotZ) mesh.rotation.z = o.rotZ;
    mesh.material = material(color, o);
    mesh.castShadow = o.shadow !== false && !o.glow && (o.opacity ?? 1) >= 1;
    mesh.receiveShadow = !o.glow;
    return mesh;
  }

  // ---------------- personagem (boneco de macacão) ----------------
  const charPool = { list: [], n: 0 };
  const charState = new Map(); // key -> { x, z, phase, t }
  const skinMat = new THREE.MeshStandardMaterial({ color: '#d8d2c8', roughness: 0.6, envMapIntensity: 0.5 });
  const visorMat = new THREE.MeshStandardMaterial({ color: '#0b0f14', roughness: 0.2, metalness: 0.6 });
  const collarMat = new THREE.MeshStandardMaterial({ color: '#2a2a2a', roughness: 0.4, metalness: 0.7 });
  const bootMat = new THREE.MeshStandardMaterial({ color: '#1a1a1a', roughness: 0.9 });
  function part(geom, mat, sx, sy, sz, x, y, z, parent) {
    const m = new THREE.Mesh(geom, mat); m.scale.set(sx, sy, sz); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m;
  }
  function limb(parent, x, y, z, w, h, d, mat, bootH) {
    const pivot = new THREE.Group(); pivot.position.set(x, y, z); parent.add(pivot);
    const seg = new THREE.Mesh(unitBox, mat); seg.scale.set(w, h, d); seg.position.y = -h; seg.castShadow = true; pivot.add(seg);
    let boot = null;
    if (bootH) { boot = new THREE.Mesh(unitBox, bootMat); boot.scale.set(w + 2, bootH, d + 1); boot.position.set(1, -h, 0); boot.castShadow = true; pivot.add(boot); }
    return { pivot, seg, boot };
  }
  function makeCharacter() {
    const root = new THREE.Group();
    const body = new THREE.Group(); root.add(body);
    const suit = new THREE.MeshStandardMaterial({ color: '#888', roughness: 0.8, envMapIntensity: 0.5 });
    const c = { root, body, suit };
    c.legL = limb(body, 0, 22, -4.6, 7, 22, 7, suit, 4);
    c.legR = limb(body, 0, 22, 4.6, 7, 22, 7, suit, 4);
    c.torso = part(unitBox, suit, 11, 21, 19, 0, 21, 0, body);
    c.collar = part(unitCyl, collarMat, 6.2, 3.2, 6.2, 0, 41.5, 0, body);
    c.collarLight = part(unitSphere, new THREE.MeshBasicMaterial({ color: '#f33' }), 1.4, 1.4, 1.4, 5.6, 43, 0, body);
    c.head = part(unitSphere, skinMat, 7.6, 8.2, 7.6, 0, 52, 0, body);
    c.visor = part(unitBox, visorMat, 3, 4.5, 10, 6.2, 50.5, 0, body);
    c.armL = limb(body, 0, 41, -12.3, 5.5, 18, 5.5, suit);
    c.armR = limb(body, 0, 41, 12.3, 5.5, 18, 5.5, suit);
    c.handL = part(unitSphere, skinMat, 3, 3, 3, 0, -19, 0, c.armL.pivot);
    c.handR = part(unitSphere, skinMat, 3, 3, 3, 0, -19, 0, c.armR.pivot);
    scene.add(root);
    return c;
  }

  // ---------------- luzes pontuais ----------------
  const lightPool = { list: [], n: 0 };

  // ---------------- rótulos (texto 2D projetado) ----------------
  let labels = [];

  // ponto da tela (coordenadas 960x540) → ponto no plano horizontal y = planeY
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), hit = new THREE.Vector3();
  function unproject(sx, sy, planeY = 0) {
    ndc.set((sx / TN.W) * 2 - 1, 1 - (sy / TN.H) * 2);
    ray.setFromCamera(ndc, camera);
    const pl = new THREE.Plane(new THREE.Vector3(0, 1, 0), -planeY);
    return ray.ray.intersectPlane(pl, hit) ? { x: hit.x, y: planeY, z: hit.z } : { x: sx, y: planeY, z: sy };
  }
  function project(x, y, z) {
    tmpV.set(x, y, z).project(camera);
    return { x: (tmpV.x + 1) / 2 * TN.W, y: (1 - tmpV.y) / 2 * TN.H, visible: tmpV.z < 1 };
  }

  // ====================== API passada ao draw3d ======================
  const api = {
    W: TN.W, H: TN.H,
    // câmera fixa: posição, alvo e campo de visão (graus). Chame no draw3d (ou use def.camera).
    camera(pos, target, fov) {
      camera.position.set(pos[0], pos[1], pos[2]);
      camera.lookAt(target[0], target[1], target[2]);
      if (fov && camera.fov !== fov) { camera.fov = fov; camera.updateProjectionMatrix(); }
    },
    // ambiente: { bg, fog:[perto,longe], ambient, sun, sunDir:[x,y,z], sunColor }
    env(e = {}) { applyEnv({ ...DEFAULT_ENV, ...e }); },
    // caixa com BASE em y (centro em x,z). o: { rotY, rotX, rotZ, glow, opacity, emissive, metal, rough, shadow }
    box(x, y, z, w, h, d, color, o = {}) { return place(take('box', unitBox), x, y, z, w, h, d, color, o); },
    // cilindro com base em y; o.sides = nº de lados (6 = prisma hexagonal com ponta para +Z)
    cyl(x, y, z, radius, h, color, o = {}) { return place(take('cyl' + (o.sides || ''), cylGeom(o.sides)), x, y, z, radius, h, radius, color, o); },
    cone(x, y, z, radius, h, color, o = {}) { return place(take('cone', unitCone), x, y, z, radius, h, radius, color, o); },
    // esfera com CENTRO em y
    sphere(x, y, z, radius, color, o = {}) { return place(take('sphere', unitSphere), x, y, z, radius, radius, radius, color, o); },
    // retângulo horizontal (piso, ladrilho, faixa) no nível y
    plane(x, y, z, w, d, color, o = {}) { const m = place(take('plane', unitPlane), x, y, z, w, 1, d, color, o); m.castShadow = false; return m; },
    // círculo horizontal
    disc(x, y, z, radius, color, o = {}) { const m = place(take('disc', unitDisc), x, y, z, radius, 1, radius, color, o); m.castShadow = false; return m; },
    // anel horizontal; o.arc (0..1) desenha só um pedaço — ótimo para barras de progresso circulares
    ring(x, y, z, inner, outer, color, o = {}) {
      const m = place(take('ring', ringGeom(Math.min(0.99, inner / outer), Math.max(0.01, Math.min(1, o.arc ?? 1)))), x, y, z, outer, 1, outer, color, o);
      m.castShadow = false; return m;
    },
    // barra entre dois pontos (laser, cabo, corda, trilho)
    beam(x1, y1, z1, x2, y2, z2, thick, color, o = {}) {
      const m = take('beam', unitBoxC);
      const dx = x2 - x1, dy = y2 - y1, dz = z2 - z1, len = Math.hypot(dx, dy, dz) || 0.001;
      place(m, (x1 + x2) / 2, (y1 + y2) / 2, (z1 + z2) / 2, len, thick, thick, color, o);
      m.rotation.set(0, Math.atan2(-dz, dx), Math.atan2(dy, Math.hypot(dx, dz)), 'YZX');
      return m;
    },
    // cilindro deitado/inclinado entre dois pontos (cano, roda, rolo, eixo)
    tube(x1, y1, z1, x2, y2, z2, radius, color, o = {}) {
      const m = take('tube', unitTube);
      dirV.set(x2 - x1, y2 - y1, z2 - z1);
      const len = dirV.length() || 0.001;
      place(m, (x1 + x2) / 2, (y1 + y2) / 2, (z1 + z2) / 2, radius, len, radius, color, o);
      m.quaternion.setFromUnitVectors(upY, dirV.normalize());
      return m;
    },
    // luz pontual (máx. 6 por quadro)
    light(x, y, z, color = '#fff', intensity = 1, distance = 300) {
      if (lightPool.n >= 6) return;
      let l = lightPool.list[lightPool.n];
      if (!l) { l = new THREE.PointLight('#fff', 1, 300, 1.6); scene.add(l); lightPool.list.push(l); }
      lightPool.n++;
      l.visible = true; l.position.set(x, y, z); l.color.set(color); l.intensity = intensity * 60000 / 100; l.distance = distance;
    },
    // texto 2D preso a um ponto 3D
    label(x, y, z, text, color = '#fff', size = 14) { labels.push({ x, y, z, text: String(text), color, size }); },
    project,
    unproject,
    // Personagem. Aceita o jogador `p` (usa p.x, p.y, p.dir, p.alive, p.color, p.label) ou um objeto parecido.
    // o: { pose: 'auto'|'idle'|'walk'|'dead'|'sit'|'crouch'|'fall'|'lie'|'arms'|'aim',
    //      y (elevação), scale, color, flash, label (texto ou false), key (id do cache), dir (rad) }
    character(p, o = {}) {
      let c = charPool.list[charPool.n];
      if (!c) { c = makeCharacter(); charPool.list.push(c); }
      charPool.n++;
      c.root.visible = true;
      const key = o.key ?? p.id ?? charPool.n;
      const st = charState.get(key) || { x: p.x, z: p.y, phase: 0, moving: 0, seed: Math.random() * 6 };
      const moved = Math.hypot(p.x - st.x, p.y - st.z);
      st.phase += moved * 0.11;
      st.moving += ((moved > 0.4 ? 1 : 0) - st.moving) * 0.25;
      st.x = p.x; st.z = p.y; charState.set(key, st);

      const alive = p.alive !== false;
      let pose = o.pose || 'auto';
      if (pose === 'auto') pose = !alive ? 'dead' : st.moving > 0.3 ? 'walk' : 'idle';
      const scale = (o.scale || 1) * ((p.r || 16) / 16);
      const color = o.color || p.color || '#999';
      c.suit.color.set(color);
      if (!alive) c.suit.color.multiplyScalar(0.45);
      c.suit.emissive.set(o.flash ? '#ffffff' : '#000000');
      c.suit.emissiveIntensity = o.flash ? 0.45 : 0;
      c.collarLight.material.color.set(alive ? (Math.floor(performance.now() / 400) % 2 ? color : '#ff2a2a') : '#330000');

      c.root.position.set(p.x, o.y || 0, p.y);
      c.root.rotation.set(0, -(o.dir ?? p.dir ?? 0), 0);
      c.root.scale.setScalar(scale);
      // reset
      c.body.position.set(0, 0, 0); c.body.rotation.set(0, 0, 0); c.body.scale.set(1, 1, 1);
      for (const l of [c.legL, c.legR, c.armL, c.armR]) l.pivot.rotation.set(0, 0, 0);
      const t = performance.now() / 1000;
      const sw = Math.sin(st.phase);
      if (pose === 'walk') {
        c.legL.pivot.rotation.z = sw * 0.5; c.legR.pivot.rotation.z = -sw * 0.5;
        c.armL.pivot.rotation.z = -sw * 0.45; c.armR.pivot.rotation.z = sw * 0.45;
        c.body.position.y = Math.abs(Math.cos(st.phase)) * 1.6;
      } else if (pose === 'idle') {
        c.body.position.y = Math.sin(t * 2 + st.seed) * 0.5;
        c.armL.pivot.rotation.x = 0.06; c.armR.pivot.rotation.x = -0.06;
      } else if (pose === 'dead' || pose === 'lie') {
        c.body.rotation.z = Math.PI / 2; c.body.position.set(28, 5, 0); // deitado, centrado na posição
        c.armL.pivot.rotation.x = 0.9; c.armR.pivot.rotation.x = -0.4; c.legL.pivot.rotation.x = 0.15;
      } else if (pose === 'sit') {
        c.legL.pivot.rotation.z = Math.PI / 2; c.legR.pivot.rotation.z = Math.PI / 2;
        c.body.position.y = -2; c.armL.pivot.rotation.z = 0.5; c.armR.pivot.rotation.z = 0.5;
      } else if (pose === 'crouch') {
        c.body.scale.y = 0.72; c.legL.pivot.rotation.z = 0.5; c.legR.pivot.rotation.z = -0.3;
      } else if (pose === 'fall') {
        c.armL.pivot.rotation.x = 2.6; c.armR.pivot.rotation.x = -2.6;
        c.body.rotation.x = Math.sin(t * 9) * 0.4; c.legL.pivot.rotation.z = 0.6; c.legR.pivot.rotation.z = -0.5;
      } else if (pose === 'arms' || pose === 'aim') {
        c.armL.pivot.rotation.z = Math.PI / 2; c.armR.pivot.rotation.z = Math.PI / 2;
        if (st.moving > 0.3) { c.legL.pivot.rotation.z = sw * 0.6; c.legR.pivot.rotation.z = -sw * 0.6; }
      }
      if (o.lean) c.body.rotation.z += o.lean;   // inclina o corpo (positivo = para trás)
      if (o.label !== false && (o.label || p.label)) labels.push({ x: p.x, y: (o.y || 0) + 72 * scale, z: p.y, text: o.label || p.label, color: alive ? color : '#888', size: 12 });
      return c.root;
    },
  };

  let envTexture = null, fogObj = null;
  const sunDirV = new THREE.Vector3();
  function applyEnv(e) {
    scene.environment = (e.envMap ?? 1) > 0 ? envTexture : null;   // envMap: 0 → cena realmente escura
    if (!scene.background) scene.background = new THREE.Color(); scene.background.set(e.bg);
    if (e.fog) {
      if (!fogObj) fogObj = new THREE.Fog('#000', 1, 2);
      fogObj.color.set(e.bg); fogObj.near = e.fog[0]; fogObj.far = e.fog[1]; scene.fog = fogObj;
    } else scene.fog = null;
    hemi.intensity = e.ambient;
    hemi.color.set(e.hemiSky); hemi.groundColor.set(e.hemiGround);
    sun.intensity = e.sun;
    sun.color.set(e.sunColor);
    const d = sunDirV.set(e.sunDir[0], e.sunDir[1], e.sunDir[2]).normalize();
    sun.position.set(480 + d.x * 900, d.y * 900, 270 + d.z * 900);
    sun.target.position.set(480, 0, 270);
  }

  // grão de filme (padrão de ruído pré-gerado)
  let grain = null;
  function makeGrain() {
    const cv = document.createElement('canvas'); cv.width = cv.height = 128;
    const cx = cv.getContext('2d'); const img = cx.createImageData(128, 128);
    for (let i = 0; i < img.data.length; i += 4) { const v = Math.random() * 255; img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 22; }
    cx.putImageData(img, 0, 0);
    return cv;
  }

  Object.assign(TN.R3, {
    init(canvas) {
      try {
        canvas3d = canvas;
        renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
      } catch (e) { console.warn('WebGL indisponível — usando 2D', e); return false; }
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.25;
      scene = new THREE.Scene();
      camera = new THREE.PerspectiveCamera(38, TN.W / TN.H, 5, 6000);
      hemi = new THREE.HemisphereLight('#9fb7d8', '#20160f', 0.5); scene.add(hemi);
      sun = new THREE.DirectionalLight('#ffe9cf', 1.6);
      sun.castShadow = true;
      sun.shadow.mapSize.set(2048, 2048);
      Object.assign(sun.shadow.camera, { left: -700, right: 700, top: 500, bottom: -500, near: 10, far: 2500 });
      sun.shadow.bias = -0.0008; sun.shadow.normalBias = 0.6;
      scene.add(sun); scene.add(sun.target);
      grain = makeGrain();
      // mapa de ambiente procedural (sala com painéis de luz) → reflexos em metais
      try {
        const pmrem = new THREE.PMREMGenerator(renderer);
        const envScene = new THREE.Scene();
        envScene.add(new THREE.Mesh(new THREE.BoxGeometry(10, 10, 10), new THREE.MeshBasicMaterial({ color: '#30353d', side: THREE.BackSide })));
        const panel = (x, y, z, w, h, d, col, k) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshBasicMaterial({ color: new THREE.Color(col).multiplyScalar(k) })); m.position.set(x, y, z); envScene.add(m); };
        panel(0, 4.9, 0, 6, 0.1, 2, '#fff1dc', 5);
        panel(-4.9, 1.5, 0, 0.1, 2, 5, '#9fc0ff', 2);
        panel(4.9, 2, 1, 0.1, 1.5, 3, '#ffcf9a', 2.5);
        panel(0, -4.9, 0, 10, 0.1, 10, '#141210', 1);
        envTexture = scene.environment = pmrem.fromScene(envScene, 0.04).texture;
        pmrem.dispose();
      } catch (e) { console.warn('sem envmap', e); }
      this.available = true;
      return true;
    },
    resize(w, h, dpr) { if (renderer) { renderer.setPixelRatio(dpr); renderer.setSize(w, h, false); } },
    // desenha a rodada em 3D; depois a camada 2D (c) recebe rótulos, vinheta e grão
    renderRound(round, c) {
      const def = round.def;
      for (const k in pools) pools[k].n = 0;
      charPool.n = 0; lightPool.n = 0; labels = [];
      applyEnv({ ...DEFAULT_ENV, ...(def.env || {}) });
      const cam = def.camera || DEFAULT_CAMERA;
      api.camera(cam.pos, cam.target, cam.fov || 38);
      api.time = round.time;
      def.draw3d(round, api);
      // partículas do motor viram cubinhos brilhantes perto do chão (exceto em jogos de coordenadas de tela)
      if (!def.screenSpace) for (const pt of round._particles) api.box(pt.x, 10 + (1 - pt.t) * 18, pt.y, pt.size * 1.6, pt.size * 1.6, pt.size * 1.6, pt.color, { glow: true });
      // esconde o que não foi usado neste quadro
      for (const k in pools) { const pl = pools[k]; for (let i = pl.n; i < pl.list.length; i++) pl.list[i].visible = false; }
      for (let i = charPool.n; i < charPool.list.length; i++) charPool.list[i].root.visible = false;
      for (let i = lightPool.n; i < lightPool.list.length; i++) lightPool.list[i].visible = false;
      // tremor de tela
      if (round._shake > 0) camera.position.add(new THREE.Vector3((Math.random() - 0.5) * round._shake * 2, (Math.random() - 0.5) * round._shake * 2, 0));
      renderer.render(scene, camera);
      this.used = true;
      // camada 2D: vinheta + grão + rótulos
      const g = c.createRadialGradient(TN.W / 2, TN.H / 2, TN.H * 0.42, TN.W / 2, TN.H / 2, TN.W * 0.66);
      g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.55)');
      c.fillStyle = g; c.fillRect(0, 0, TN.W, TN.H);
      if (grain) { c.save(); c.globalAlpha = 0.5; c.fillStyle = c.createPattern(grain, 'repeat'); c.translate(Math.random() * 128, Math.random() * 128); c.fillRect(-128, -128, TN.W + 256, TN.H + 256); c.restore(); }
      for (const l of labels) {
        const s = project(l.x, l.y, l.z);
        if (s.visible) TN.draw.text(c, l.text, s.x, s.y, { size: l.size, color: l.color, align: 'center' });
      }
    },
    project: (x, y, z) => project(x, y, z),
    unproject: (sx, sy, py) => unproject(sx, sy, py),
    setVisible(v) { if (canvas3d) canvas3d.style.visibility = v ? 'visible' : 'hidden'; },
  });
})();
