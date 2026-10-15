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
  // visual "cadeia PS2": baixa resolução, texturas sujas, luz dura. ?visual=antigo volta ao visual liso.
  const RETRO = !(typeof location !== 'undefined' && /[?&]visual=antigo/.test(location.search));
  // texturas sujas disponíveis em o.tex (geradas em makeTexture; nome errado é acusado pelo validador)
  const TEX_NOMES = ['concreto', 'piso', 'metal', 'tinta', 'tecido', 'tijolo', 'azulejo', 'caquinho', 'madeira', 'taco'];
  const DEFAULT_ENV = RETRO
    ? { bg: '#030404', fog: [1000, 2200], ambient: 0.16, sun: 0.45, sunDir: [-0.35, 1, 0.45], sunColor: '#ffc987', hemiSky: '#8fae98', hemiGround: '#140e09', spot: 5.5, spotColor: '#ffdcaa', envMap: 0.4 }
    : { bg: '#0a0d11', fog: [1300, 3000], ambient: 0.7, sun: 2.4, sunDir: [-0.45, 1, 0.55], sunColor: '#ffe9cf', hemiSky: '#9fb7d8', hemiGround: '#20160f', spot: 0 };

  // r.room / r.yard / r.prop: montados por engine/cenarios.js usando as primitivas da própria API
  // (por isso funcionam igual no navegador e no validador)
  const KIT = ['room', 'yard', 'prop'];
  const viaCenarios = (api, k) => (...args) => {
    const f = TN.cenarios && TN.cenarios[k];
    if (!f) throw new Error(`r.${k}: engine/cenarios.js não foi carregado (ou não tem "${k}")`);
    return f(api, ...args);
  };

  // ====================== VALIDADOR (Node / sem WebGL) ======================
  // Mesmo formato da API real; confere se os números são válidos e registra as chamadas (para testes).
  function makeValidator() {
    const errs = [], counts = {}, calls = [];
    const chk = (name, args) => {
      for (let i = 0; i < args.length; i++) {
        const a = args[i];
        if (typeof a === 'number' && !Number.isFinite(a)) errs.push(`${name}: argumento ${i + 1} inválido (${a})`);
        else if (a && typeof a === 'object' && 'tex' in a && a.tex !== false && !TEX_NOMES.includes(a.tex)) errs.push(`${name}: o.tex desconhecido "${a.tex}" (use: ${TEX_NOMES.join(', ')} ou false)`);
      }
    };
    const api = {};
    for (const k of ['camera', 'env', 'box', 'cyl', 'sphere', 'cone', 'plane', 'disc', 'ring', 'beam', 'tube', 'light', 'label', 'character']) {
      api[k] = (...args) => {
        counts[k] = (counts[k] || 0) + 1; calls.push([k, args]);
        if (k === 'character') { const p = args[0] || {}; chk(k, [p.x, p.y, p.dir || 0]); } else chk(k, args);
      };
    }
    for (const k of KIT) api[k] = viaCenarios(api, k);
    api.W = TN.W; api.H = TN.H; api.time = 0;
    api.project = () => ({ x: 0, y: 0, visible: true });
    api.unproject = (sx, sy, py = 0) => ({ x: sx, y: py, z: sy });
    return { api, errs, counts, calls };
  }

  TN.R3 = {
    available: false,
    used: false,
    RETRO,
    DEFAULT_CAMERA, DEFAULT_ENV,
    detentoPronto: Promise.resolve(false),   // o init troca pela carga do detento glTF
    // usado pelo tools/simular.js: roda draw3d contra o validador
    validate(round) {
      const { api, errs } = makeValidator();
      round.def.draw3d(round, api);
      return errs;
    },
    // usado pelo tools/teste_cenarios.js: roda fn(api) no validador com r.time = time e devolve o rastro
    trace(fn, time = 0) {
      const v = makeValidator();
      v.api.time = time;
      fn(v.api);
      return { errs: v.errs, counts: v.counts, calls: v.calls };
    },
  };
  if (!hasThree || typeof document === 'undefined') return;

  // ====================== BACKEND THREE.JS ======================
  let renderer, scene, camera, sun, hemi, ambient, canvas3d, spot;
  let rt = null, postScene = null, postCam = null;   // passo de pós-processo (visual retrô)
  const RW = 640, RH = 360;                           // resolução interna do visual retrô
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

  // ---------------- texturas sujas procedurais (sem arquivos de imagem) ----------------
  // Cada textura é um multiplicador de cor (~0.5..1): a cor pedida pelo minigame continua valendo,
  // só ganha manchas, rachaduras e ferrugem. Pixel duro (NearestFilter) para o ar de PS2.
  function rng(seed) {
    return () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  function noiseFn(cells, rnd) {   // ruído de valor que fecha nas bordas (textura repete sem emenda)
    const g = []; for (let i = 0; i < cells * cells; i++) g.push(rnd());
    const at = (x, y) => g[((y % cells) + cells) % cells * cells + ((x % cells) + cells) % cells];
    return (u, v) => {   // u, v em 0..1
      const x = u * cells, y = v * cells, xi = Math.floor(x), yi = Math.floor(y);
      let fx = x - xi, fy = y - yi; fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
      const a = at(xi, yi), b = at(xi + 1, yi), c = at(xi, yi + 1), d = at(xi + 1, yi + 1);
      return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
    };
  }
  function makeTexture(kind, N = 128) {
    const rnd = rng(kind.length * 7919 + kind.charCodeAt(0));
    const n4 = noiseFn(4, rnd), n8 = noiseFn(8, rnd), n16 = noiseFn(16, rnd), n32 = noiseFn(32, rnd);
    const col = Array.from({ length: N }, () => rnd());   // variação por coluna (riscos verticais, escorridos)
    const per = Array.from({ length: 64 }, () => rnd());   // tom de cada peça (tijolo, azulejo, tábua, taco)
    // caquinho: pontos de Voronoi (cacos), com distância que "dá a volta" para repetir sem emenda
    const pts = kind === 'caquinho' ? Array.from({ length: 36 }, () => [rnd() * N, rnd() * N, 0.72 + 0.28 * rnd()]) : null;
    const px = new Float32Array(N * N * 3);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const u = x / N, v = y / N, i = (y * N + x) * 3;
      let r, g, b;
      if (kind === 'metal') {
        const streak = (col[x] + col[(x + 1) % N]) / 2;
        const k = 0.8 + 0.12 * n8(u, v) + 0.08 * streak - 0.06 * (rnd() < 0.04 ? 1 : 0);
        const rust = Math.max(0, n8(u + 0.3, v) * 0.7 + n32(u, v) * 0.3 - 0.55) * 2.6;
        r = k * (1 - rust * 0.25); g = k * (1 - rust * 0.5); b = k * (1 - rust * 0.68);
      } else if (kind === 'tecido') {
        const k = 0.86 + 0.08 * rnd() + 0.05 * n16(u, v) - (x % 4 === 0 ? 0.04 : 0);
        r = g = b = k;
      } else if (kind === 'tinta') {   // parede pintada descascando
        let k = 0.9 + 0.06 * n16(u, v) + 0.03 * rnd();
        const peel = n8(u, v) * 0.6 + n32(u, v) * 0.4;
        if (peel > 0.64) k *= 0.7;
        else if (peel > 0.61) k *= 0.55;
        const drip = col[x] > 0.93 ? 0.14 * (1 - ((v * 2) % 1)) : 0;
        r = g = b = k - drip;
      } else if (kind === 'tijolo') {   // fiadas de 16 px, tijolos de 32 px, juntas escuras
        const fiada = Math.floor(y / 16), off = fiada % 2 ? 16 : 0, tij = Math.floor((x + off) / 32) % 4;
        const junta = y % 16 < 2 || (x + off) % 32 < 2;
        r = g = b = junta ? 0.5 : 0.78 + 0.18 * per[(fiada * 4 + tij) % 64] + 0.08 * n32(u, v) - 0.05 * rnd();
      } else if (kind === 'azulejo') {   // azulejo de 32 px, rejunte escuro, encardido
        const junta = x % 32 < 2 || y % 32 < 2;
        const sujo = Math.max(0, n8(u, v) - 0.55) * 0.9;
        const k = (junta ? 0.55 : 0.93 + 0.04 * per[(Math.floor(y / 32) * 4 + Math.floor(x / 32)) % 64]) - sujo;
        r = k; g = k * 0.99; b = k * 0.95;
      } else if (kind === 'caquinho') {   // piso de caquinho: cacos irregulares com rejunte
        let d1 = 1e9, d2 = 1e9, tom = 1;
        for (const [qx, qy, qv] of pts) {
          let dx = Math.abs(x - qx), dy = Math.abs(y - qy); dx = Math.min(dx, N - dx); dy = Math.min(dy, N - dy);
          const d = Math.hypot(dx, dy);
          if (d < d1) { d2 = d1; d1 = d; tom = qv; } else if (d < d2) d2 = d;
        }
        r = g = b = d2 - d1 < 1.6 ? 0.5 : tom + 0.05 * n32(u, v) - 0.04 * rnd();
      } else if (kind === 'madeira') {   // tábuas verticais de 16 px com veio
        const tab = Math.floor(x / 16);
        const veio = 0.08 * Math.sin((u * 6 + n16(u, v) * 2.5 + per[tab % 64] * 6) * Math.PI * 2);
        r = g = b = x % 16 === 0 ? 0.5 : 0.78 + veio + 0.1 * per[tab % 64] + 0.04 * rnd();
      } else if (kind === 'taco') {   // taco em blocos de 32 px alternando o sentido, réguas de 8 px
        const bx = Math.floor(x / 32), by = Math.floor(y / 32), lx = x % 32, ly = y % 32;
        const deitado = (bx + by) % 2 === 0, faixa = Math.floor((deitado ? ly : lx) / 8);
        const junta = (deitado ? ly : lx) % 8 === 0 || lx === 0 || ly === 0;
        r = g = b = junta ? 0.5 : 0.76 + 0.16 * per[((by * 4 + bx) * 4) % 64 + faixa] + 0.05 * n32(u, v);
      } else {   // 'concreto' e 'piso'
        const piso = kind === 'piso';
        let k = 0.82 + (piso ? 0.1 : 0.12) * n8(u, v) + 0.08 * n16(u, v) + 0.06 * n32(u, v) + 0.07 * (rnd() - 0.5);
        const stain = Math.max(0, n16(u + 0.5, v + 0.5) - 0.66) * 1.2;
        k -= stain;
        r = k; g = k * 0.98; b = k * 0.94;
      }
      px[i] = r; px[i + 1] = g; px[i + 2] = b;
    }
    // rachaduras (passeio aleatório) no concreto/piso/tinta
    if (kind === 'concreto' || kind === 'piso' || kind === 'tinta') {
      for (let c = 0; c < 5; c++) {
        let x = rnd() * N, y = rnd() * N, a = rnd() * Math.PI * 2;
        for (let s = 0; s < 40; s++) {
          a += (rnd() - 0.5) * 0.9; x = (x + Math.cos(a) + N) % N; y = (y + Math.sin(a) + N) % N;
          const i = (Math.floor(y) * N + Math.floor(x)) * 3; px[i] *= 0.55; px[i + 1] *= 0.55; px[i + 2] *= 0.55;
        }
      }
    }
    const data = new Uint8Array(N * N * 4);
    for (let i = 0, j = 0; i < px.length; i += 3, j += 4) {
      data[j] = Math.max(0, Math.min(255, px[i] * 255)); data[j + 1] = Math.max(0, Math.min(255, px[i + 1] * 255)); data[j + 2] = Math.max(0, Math.min(255, px[i + 2] * 255)); data[j + 3] = 255;
    }
    const tex = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestMipmapLinearFilter; tex.generateMipmaps = true;
    tex.needsUpdate = true;
    return tex;
  }
  const TEX_SIZE = { concreto: 300, piso: 420, metal: 220, tinta: 340, tecido: 60, tijolo: 170, azulejo: 110, caquinho: 190, madeira: 130, taco: 150 };   // unidades de mundo por repetição
  const textures = {};
  const texOf = (kind) => {
    if (!TEX_NOMES.includes(kind)) {   // o simular.js acusa; no navegador avisa uma vez e usa concreto
      if (!textures['?' + kind]) { console.warn(`o.tex desconhecido "${kind}" (use: ${TEX_NOMES.join(', ')})`); textures['?' + kind] = true; }
      kind = 'concreto';
    }
    return textures[kind] || (textures[kind] = makeTexture(kind));
  };
  // Projeção triplanar: a textura é amarrada ao objeto (não "escorrega" quando ele anda) e não estica
  // com a escala. world = true usa coordenadas do mundo (pisos montados em ladrilhos ficam contínuos).
  function texturize(m, kind, world) {
    const uniforms = { tpMap: { value: texOf(kind) }, tpScale: { value: 1 / (TEX_SIZE[kind] || 300) }, tpWorld: { value: world ? 1 : 0 } };
    m.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, uniforms);
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vTpPos;\nvarying vec3 vTpNrm;\nuniform float tpWorld;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          vec3 tpS = vec3(length(modelMatrix[0].xyz), length(modelMatrix[1].xyz), length(modelMatrix[2].xyz));
          vTpPos = tpWorld > 0.5 ? (modelMatrix * vec4(transformed, 1.0)).xyz : transformed * tpS;
          vTpNrm = tpWorld > 0.5 ? mat3(modelMatrix) * objectNormal : objectNormal;`);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vTpPos;\nvarying vec3 vTpNrm;\nuniform sampler2D tpMap;\nuniform float tpScale;')
        .replace('#include <map_fragment>', `#include <map_fragment>
          vec3 tpA = abs(normalize(vTpNrm));
          vec2 tpUv = tpA.y > max(tpA.x, tpA.z) ? vTpPos.xz : (tpA.x > tpA.z ? vTpPos.zy : vTpPos.xy);
          diffuseColor.rgb *= texture2D(tpMap, tpUv * tpScale).rgb;`);
    };
    m.customProgramCacheKey = () => 'tp';
    return m;
  }

  const mats = new Map();
  function material(color, o = {}, defTex) {
    const glow = !!o.glow;
    const op = Math.round((o.opacity ?? 1) * 20) / 20;   // arredonda para não criar um material por quadro
    const tex = RETRO && !glow && o.tex !== false ? (o.tex || ((o.metal ?? 0) >= 0.4 ? 'metal' : defTex)) : null;
    const world = tex && (o.texWorld ?? defTex === 'piso');
    const key = `${color}|${glow}|${op}|${o.emissive || ''}|${o.emissiveIntensity ?? ''}|${o.additive ? 1 : 0}|${o.metal ?? ''}|${o.rough ?? ''}|${o.flash ? 1 : 0}|${tex || ''}|${world ? 1 : 0}`;
    let m = mats.get(key);
    if (!m) {
      if (glow) m = new THREE.MeshBasicMaterial({ color, transparent: op < 1, opacity: op, blending: o.additive ? THREE.AdditiveBlending : THREE.NormalBlending, depthWrite: op >= 1 });
      else m = new THREE.MeshStandardMaterial({ color, roughness: o.rough ?? (RETRO ? 0.85 : 0.75), metalness: o.metal ?? 0.08, transparent: op < 1, opacity: op, depthWrite: op >= 1, envMapIntensity: RETRO ? 0.3 : 0.55 });
      if (!glow && (o.emissive || o.flash)) { m.emissive = new THREE.Color(o.flash ? '#ffffff' : o.emissive); m.emissiveIntensity = o.flash ? 0.9 : (o.emissiveIntensity ?? 1); }
      if (tex) texturize(m, tex, world);
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
  function place(mesh, x, y, z, sx, sy, sz, color, o, defTex = 'concreto') {
    mesh.position.set(x, y, z);
    mesh.scale.set(sx || 0.001, sy || 0.001, sz || 0.001);
    if (o.rotY) mesh.rotation.y = o.rotY;
    if (o.rotX) mesh.rotation.x = o.rotX;
    if (o.rotZ) mesh.rotation.z = o.rotZ;
    mesh.material = material(color, o, defTex);
    mesh.castShadow = o.shadow !== false && !o.glow && (o.opacity ?? 1) >= 1;
    mesh.receiveShadow = !o.glow;
    return mesh;
  }

  // ---------------- personagem (detento de uniforme; no visual antigo, boneco de macacão com visor) ----------------
  const charPool = { list: [], n: 0, quadro: 0 };   // c.quadro = último quadro em que a vaga foi usada
  const charState = new Map(); // key -> { x, z, phase, t }
  // detento glTF (visual novo): carregado em segundo plano no init; até ficar pronto, ou se falhar, o pool
  // usa o boneco de caixas. Quando fica pronto, o pool é refeito com o modelo.
  let detento = null, detentoEstado = RETRO ? 'carregando' : 'desligado', detentoPronto = Promise.resolve(false);
  function falhaDetento(e) {
    detento = null; detentoEstado = 'falhou';
    for (const c of charPool.list) if (c.gltf) scene.remove(c.root);
    charPool.list = charPool.list.filter((c) => !c.gltf);
    console.warn('detento: usando o boneco de caixas (' + (e && e.message) + ')');
    return false;
  }
  function carregarDetento(b64) {
    detentoEstado = 'carregando';
    if (!TN.Detento || !THREE.GLTFLoader || !THREE.SkeletonUtils) return Promise.resolve(falhaDetento(new Error('engine/detento.js ou vendor/GLTFLoader.js não foram carregados')));
    return TN.Detento.carregar(b64).then((m) => {
      detento = m; detentoEstado = 'pronto';
      for (const c of charPool.list) scene.remove(c.root);
      charPool.list.length = 0;
      return true;
    }, falhaDetento);
  }
  const SKIN_TONES = ['#c99e7c', '#8a5a3c', '#e2bc9a', '#5f3b26'];
  const PRISON_NUMBERS = ['171', '155', '157', '180'];   // artigos do código penal, com todo o carinho
  const skinMat = new THREE.MeshStandardMaterial({ color: '#d8d2c8', roughness: 0.6, envMapIntensity: 0.5 });
  const visorMat = new THREE.MeshStandardMaterial({ color: '#0b0f14', roughness: 0.2, metalness: 0.6 });
  const eyeMat = new THREE.MeshBasicMaterial({ color: '#0a0806' });
  const collarMat = new THREE.MeshStandardMaterial({ color: '#2a2a2a', roughness: 0.4, metalness: 0.7 });
  const bootMat = new THREE.MeshStandardMaterial({ color: '#1a1a1a', roughness: 0.9 });
  const greyC = new THREE.Color();
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
    if (detento) return makeCharacterGltf();
    const root = new THREE.Group();
    const body = new THREE.Group(); root.add(body);
    const suit = new THREE.MeshStandardMaterial({ color: '#888', roughness: 0.8, envMapIntensity: 0.5 });
    if (RETRO) texturize(suit, 'tecido', false);
    const skin = RETRO ? new THREE.MeshStandardMaterial({ color: SKIN_TONES[0], roughness: 0.7, envMapIntensity: 0.3 }) : skinMat;
    const c = { root, body, suit, skin };
    c.legL = limb(body, 0, 22, -4.6, 7, 22, 7, suit, 4);
    c.legR = limb(body, 0, 22, 4.6, 7, 22, 7, suit, 4);
    c.torso = part(unitBox, suit, 11, 21, 19, 0, 21, 0, body);
    c.collar = part(unitCyl, collarMat, 6.2, 3.2, 6.2, 0, 41.5, 0, body);
    c.collarLight = part(unitSphere, new THREE.MeshBasicMaterial({ color: '#f33' }), 1.4, 1.4, 1.4, 5.6, 43, 0, body);
    if (RETRO) {
      // cabeça raspada, orelhas e olhos; número de prontuário nas costas
      c.head = part(unitSphere, skin, 7.2, 8.4, 7, 0, 52, 0, body);
      part(unitSphere, skin, 1.6, 2.6, 1.6, 0, 52, -7, body);
      part(unitSphere, skin, 1.6, 2.6, 1.6, 0, 52, 7, body);
      part(unitBox, eyeMat, 1, 1.5, 1.8, 6.6, 52.5, -2.6, body);
      part(unitBox, eyeMat, 1, 1.5, 1.8, 6.6, 52.5, 2.6, body);
      part(unitBox, eyeMat, 1, 0.8, 4, 6.7, 47.6, 0, body);   // boca séria
      c.numCanvas = document.createElement('canvas'); c.numCanvas.width = 64; c.numCanvas.height = 32;
      c.numTex = new THREE.CanvasTexture(c.numCanvas); c.numTex.magFilter = THREE.NearestFilter; c.numTex.minFilter = THREE.NearestFilter; c.numTex.generateMipmaps = false;
      const plate = new THREE.Mesh(new THREE.PlaneGeometry(13, 6.5).rotateY(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: c.numTex, roughness: 0.9 }));
      plate.position.set(-5.6, 33, 0); body.add(plate);
    } else {
      c.head = part(unitSphere, skinMat, 7.6, 8.2, 7.6, 0, 52, 0, body);
      c.visor = part(unitBox, visorMat, 3, 4.5, 10, 6.2, 50.5, 0, body);
    }
    c.armL = limb(body, 0, 41, -12.3, 5.5, 18, 5.5, suit);
    c.armR = limb(body, 0, 41, 12.3, 5.5, 18, 5.5, suit);
    c.handL = part(unitSphere, skin, 3, 3, 3, 0, -19, 0, c.armL.pivot);
    c.handR = part(unitSphere, skin, 3, 3, 3, 0, -19, 0, c.armR.pivot);
    scene.add(root);
    return c;
  }
  // detento glTF: os mesmos campos do boneco de caixas (root, body, suit, skin, numCanvas, numTex,
  // collarLight), mais c.gltf com as animações
  function makeCharacterGltf() {
    const suit = new THREE.MeshStandardMaterial({ color: '#888', roughness: 0.8, envMapIntensity: 0.5 });
    texturize(suit, 'tecido', false);
    const skin = new THREE.MeshStandardMaterial({ color: SKIN_TONES[0], roughness: 0.7, envMapIntensity: 0.3 });
    const numCanvas = document.createElement('canvas'); numCanvas.width = 64; numCanvas.height = 32;
    const numTex = new THREE.CanvasTexture(numCanvas);
    numTex.magFilter = THREE.NearestFilter; numTex.minFilter = THREE.NearestFilter; numTex.generateMipmaps = false;
    const inst = TN.Detento.criar(detento, {
      suit, skin, placa: new THREE.MeshStandardMaterial({ map: numTex, roughness: 0.9 }),
      coleira: collarMat, luz: new THREE.MeshBasicMaterial({ color: '#f33' }), olho: eyeMat,
    });
    scene.add(inst.root);
    return { root: inst.root, body: inst.corpo, suit, skin, numCanvas, numTex, collarLight: inst.luz, gltf: inst, ultimoT: 0 };
  }
  function setPrisonNumber(c, num) {
    if (c.num === num) return;
    c.num = num;
    const cx = c.numCanvas.getContext('2d');
    cx.fillStyle = '#e4ddc8'; cx.fillRect(0, 0, 64, 32);
    cx.fillStyle = '#111'; cx.font = 'bold 24px "Courier New", monospace'; cx.textAlign = 'center'; cx.textBaseline = 'middle';
    cx.fillText(num, 32, 17);
    c.numTex.needsUpdate = true;
  }

  // ---------------- luzes pontuais ----------------
  const lightPool = { list: [], n: 0 };
  const luzesFundo = [];   // luzes de cenário do quadro atual, acesas depois das do minigame
  function addLight(x, y, z, color, intensity, distance) {
    if (lightPool.n >= 6) return;
    let l = lightPool.list[lightPool.n];
    if (!l) { l = new THREE.PointLight('#fff', 1, 300, 1.6); scene.add(l); lightPool.list.push(l); }
    lightPool.n++;
    l.visible = true; l.position.set(x, y, z); l.color.set(color); l.intensity = intensity * 60000 / 100; l.distance = distance;
  }

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
    plane(x, y, z, w, d, color, o = {}) { const m = place(take('plane', unitPlane), x, y, z, w, 1, d, color, o, 'piso'); m.castShadow = false; return m; },
    // círculo horizontal
    disc(x, y, z, radius, color, o = {}) { const m = place(take('disc', unitDisc), x, y, z, radius, 1, radius, color, o, 'piso'); m.castShadow = false; return m; },
    // anel horizontal; o.arc (0..1) desenha só um pedaço — ótimo para barras de progresso circulares
    ring(x, y, z, inner, outer, color, o = {}) {
      const m = place(take('ring', ringGeom(Math.min(0.99, inner / outer), Math.max(0.01, Math.min(1, o.arc ?? 1)))), x, y, z, outer, 1, outer, color, o, 'piso');
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
    // luz pontual (máx. 6 por quadro). o.fundo: luz de cenário, que só ocupa vaga sobrando depois do minigame
    light(x, y, z, color = '#fff', intensity = 1, distance = 300, o = {}) {
      if (o.fundo) { luzesFundo.push([x, y, z, color, intensity, distance]); return; }
      addLight(x, y, z, color, intensity, distance);
    },
    // texto 2D preso a um ponto 3D
    label(x, y, z, text, color = '#fff', size = 14) { labels.push({ x, y, z, text: String(text), color, size }); },
    project,
    unproject,
    // Personagem. Aceita o jogador `p` (usa p.x, p.y, p.dir, p.alive, p.color, p.label) ou um objeto parecido.
    // o: { pose: 'auto'|'idle'|'walk'|'dead'|'sit'|'crouch'|'fall'|'lie'|'arms'|'aim',
    //      y (elevação), scale, color, flash, label (texto ou false), key (id do cache), dir (rad) }
    character(p, o = {}) {
      const key = o.key ?? p.id ?? charPool.n + 1;
      let c;
      if (detento) {
        // detento glTF: a animação é estado da vaga, então cada key fica com a sua (a ordem de desenho
        // muda quando alguém morre); senão pega uma vaga que não foi usada nem no quadro anterior
        c = charPool.list.find((v) => v.chave === key && v.quadro !== charPool.quadro)
          || charPool.list.find((v) => v.quadro < charPool.quadro - 1);
      } else c = charPool.list.find((v) => v.quadro !== charPool.quadro);
      if (!c) { c = makeCharacter(); charPool.list.push(c); }
      charPool.n++;
      c.chave = key; c.quadro = charPool.quadro;
      c.root.visible = true;
      const st = charState.get(key) || { x: p.x, z: p.y, phase: 0, moving: 0, seed: Math.random() * 6, vel: 0, t: 0, andando: false };
      const moved = Math.hypot(p.x - st.x, p.y - st.z);
      st.phase += moved * 0.11;
      st.moving += ((moved > 0.4 ? 1 : 0) - st.moving) * 0.25;
      st.x = p.x; st.z = p.y; charState.set(key, st);
      // velocidade (px/s) suavizada em ~0,2 s: a posição só muda nos passos da simulação (60/s) ou nos
      // snapshots da rede (30/s), então quadro a quadro ela alterna entre parada e o dobro
      const agora = performance.now() / 1000, dtKey = st.t ? Math.min(0.1, agora - st.t) : 0;
      st.t = agora;
      if (dtKey > 0) st.vel += (moved / dtKey - st.vel) * Math.min(1, dtKey * 5);
      st.andando = st.andando ? st.vel > 15 : st.vel > 30;   // histerese: não fica trocando walk/idle

      const alive = p.alive !== false;
      let pose = o.pose || 'auto';
      if (pose === 'auto') pose = !alive ? 'dead' : (c.gltf ? st.andando : st.moving > 0.3) ? 'walk' : 'idle';
      const scale = (o.scale || 1) * ((p.r || 16) / 16);
      const color = o.color || p.color || '#999';
      c.suit.color.set(color);
      if (RETRO) {
        // uniforme um pouco desbotado (menos cara de brinquedo); pele e número estáveis por personagem
        const idx = typeof key === 'number' ? key : String(key).split('').reduce((h, ch) => h * 31 + ch.charCodeAt(0), 7);
        c.suit.color.lerp(greyC.setRGB(0.32, 0.31, 0.29), 0.3);
        c.skin.color.set(SKIN_TONES[Math.abs(idx) % SKIN_TONES.length]);
        setPrisonNumber(c, o.number ?? (idx >= 0 && idx < 4 ? PRISON_NUMBERS[idx] : String(100 + Math.abs(idx) % 900)));
      }
      if (!alive) c.suit.color.multiplyScalar(0.45);
      c.suit.emissive.set(o.flash ? '#ffffff' : '#000000');
      c.suit.emissiveIntensity = o.flash ? 0.45 : 0;
      c.collarLight.material.color.set(alive ? (Math.floor(performance.now() / 400) % 2 ? color : '#ff2a2a') : '#330000');

      c.root.position.set(p.x, o.y || 0, p.y);
      c.root.rotation.set(0, -(o.dir ?? p.dir ?? 0), 0);
      c.root.scale.setScalar(scale);
      if (c.gltf) {
        // detento glTF: a pose vira um clipe; dt local (animação é só visual, não vai para a rede)
        const dt = c.ultimoT ? Math.min(0.1, agora - c.ultimoT) : 0;
        c.ultimoT = agora;
        c.gltf.pose(pose, st.vel);
        c.gltf.avancar(dt);
        c.body.rotation.set(0, 0, o.lean || 0);
      } else {
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
      }
      if (o.label !== false && (o.label || p.label)) labels.push({ x: p.x, y: (o.y || 0) + 72 * scale, z: p.y, text: o.label || p.label, color: alive ? color : '#888', size: 12 });
      return c.root;
    },
    // cenários de cadeia (engine/cenarios.js)
    room: (...a) => viaCenarios(api, 'room')(...a),
    yard: (...a) => viaCenarios(api, 'yard')(...a),
    prop: (...a) => viaCenarios(api, 'prop')(...a),
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
    // holofote de teto: luz dura no centro, escuridão nas bordas. spotPos/spotTarget ajustam por minigame.
    spot.intensity = e.spot || 0; spot.visible = spot.intensity > 0;
    spot.color.set(e.spotColor || '#ffe2b0');
    const sp = e.spotPos || [480, 1000, 420], st = e.spotTarget || [480, 0, 280];
    spot.position.set(sp[0], sp[1], sp[2]); spot.target.position.set(st[0], st[1], st[2]);
    spot.angle = e.spotAngle ?? 0.5;
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
      spot = new THREE.SpotLight('#ffe2b0', 0, 0, 0.62, 0.55, 0);
      spot.castShadow = true; spot.shadow.mapSize.set(1024, 1024); spot.shadow.bias = -0.0006; spot.shadow.normalBias = 0.6;
      spot.shadow.camera.near = 100; spot.shadow.camera.far = 2500;
      scene.add(spot); scene.add(spot.target);
      if (RETRO) {
        // a cena é desenhada pequena (640x360) num alvo intermediário; o passo final faz tone mapping,
        // reduz as cores com pontilhado (dither de Bayer) e o CSS amplia sem suavizar.
        rt = new THREE.WebGLRenderTarget(RW, RH, { type: THREE.HalfFloatType, magFilter: THREE.NearestFilter, minFilter: THREE.NearestFilter, depthBuffer: true });
        postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
        postScene = new THREE.Scene();
        postScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
          uniforms: { tDiffuse: { value: rt.texture } },
          vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
          fragmentShader: `
            uniform sampler2D tDiffuse; varying vec2 vUv;
            float bayer(vec2 p) {
              int x = int(mod(p.x, 4.0)), y = int(mod(p.y, 4.0)), i = x + y * 4;
              float m[16]; m[0]=0.;m[1]=8.;m[2]=2.;m[3]=10.;m[4]=12.;m[5]=4.;m[6]=14.;m[7]=6.;m[8]=3.;m[9]=11.;m[10]=1.;m[11]=9.;m[12]=15.;m[13]=7.;m[14]=13.;m[15]=5.;
              for (int k = 0; k < 16; k++) if (k == i) return m[k] / 16.0 - 0.5;
              return 0.0;
            }
            void main() {
              gl_FragColor = texture2D(tDiffuse, vUv);
              #include <tonemapping_fragment>
              #include <colorspace_fragment>
              vec3 c = gl_FragColor.rgb;
              float l = dot(c, vec3(0.299, 0.587, 0.114));
              c = mix(vec3(l), c, 0.82);                          // um pouco menos saturado
              c = c * vec3(1.0, 0.98, 0.93) + vec3(0.0, 0.006, 0.004);   // grade levemente quente/esverdeada
              float levels = 28.0;
              c = floor(c * levels + 0.5 + bayer(gl_FragCoord.xy) ) / levels;
              gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
            }`,
          depthTest: false, depthWrite: false,
        })));
      }
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
      if (RETRO) detentoPronto = carregarDetento(TN.ASSETS && TN.ASSETS.detento);
      TN.R3.detentoPronto = detentoPronto;
      return true;
    },
    resize(w, h, dpr) {
      if (!renderer) return;
      if (RETRO) { renderer.setPixelRatio(1); renderer.setSize(RW, RH, false); canvas3d.style.imageRendering = 'pixelated'; }
      else { renderer.setPixelRatio(dpr); renderer.setSize(w, h, false); }
    },
    // desenha a rodada em 3D; depois a camada 2D (c) recebe rótulos, vinheta e grão
    renderRound(round, c) {
      const def = round.def;
      for (const k in pools) pools[k].n = 0;
      charPool.n = 0; charPool.quadro++; lightPool.n = 0; labels = []; luzesFundo.length = 0;
      applyEnv({ ...DEFAULT_ENV, ...(def.env || {}) });
      const cam = def.camera || DEFAULT_CAMERA;
      api.camera(cam.pos, cam.target, cam.fov || 38);
      api.time = round.time;
      def.draw3d(round, api);
      for (const l of luzesFundo) addLight(...l);   // cenário ocupa só as vagas que sobraram
      luzesFundo.length = 0;
      // partículas do motor viram cubinhos brilhantes perto do chão (exceto em jogos de coordenadas de tela)
      if (!def.screenSpace) for (const pt of round._particles) api.box(pt.x, 10 + (1 - pt.t) * 18, pt.y, pt.size * 1.6, pt.size * 1.6, pt.size * 1.6, pt.color, { glow: true });
      // esconde o que não foi usado neste quadro
      for (const k in pools) { const pl = pools[k]; for (let i = pl.n; i < pl.list.length; i++) pl.list[i].visible = false; }
      for (const c of charPool.list) if (c.quadro !== charPool.quadro) c.root.visible = false;
      for (let i = lightPool.n; i < lightPool.list.length; i++) lightPool.list[i].visible = false;
      // tremor de tela
      if (round._shake > 0) camera.position.add(new THREE.Vector3((Math.random() - 0.5) * round._shake * 2, (Math.random() - 0.5) * round._shake * 2, 0));
      if (rt) {
        renderer.setRenderTarget(rt); renderer.render(scene, camera);
        renderer.setRenderTarget(null); renderer.render(postScene, postCam);
      } else renderer.render(scene, camera);
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
    _textura: (nome) => texOf(nome),   // para testes (tools/teste_render.js)
    estadoDetento: () => detentoEstado,
    _personagens: () => charPool.list,   // para testes: o pool de personagens
    _recarregarDetento: (b64) => carregarDetento(b64),   // para testes: força uma nova carga do modelo
    // para testes (tools/teste_render.js): o que o último quadro acendeu
    stats() { return { luzes: lightPool.list.slice(0, lightPool.n).map((l) => ({ x: l.position.x, y: l.position.y, z: l.position.z })) }; },
    project: (x, y, z) => project(x, y, z),
    unproject: (sx, sy, py) => unproject(sx, sy, py),
    setVisible(v) { if (canvas3d) canvas3d.style.visibility = v ? 'visible' : 'hidden'; },
  });
})();
