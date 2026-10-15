// DETENTO glTF: o personagem do visual novo (manequim CC0 da Quaternius, em assets/detento.glb.js).
// Decodifica o modelo embutido, normaliza (cerca de 60 de altura, pés em y=0, olhando para +X, igual ao
// boneco de caixas), separa pele e uniforme e cria instâncias com o próprio AnimationMixer.
// A animação é só visual e local: não entra em g.data e não passa pela rede.
// Roda igual no navegador e no Node (tools/teste_detento.js). Precisa de THREE.GLTFLoader e THREE.SkeletonUtils.
(function () {
  // pose do r.character → clipe (o asset só tem estes, ver tools/preparar_detento.js)
  const POSE_CLIPE = {
    idle: 'Idle_Loop', walk: 'Jog_Fwd_Loop', dead: 'Death01', lie: 'Death01', sit: 'Sitting_Idle_Loop',
    crouch: 'Crouch_Idle_Loop', fall: 'Jump_Loop', arms: 'Push_Loop', aim: 'Pistol_Idle_Loop',
  };
  const UMA_VEZ = new Set(['Death01']);                  // toca uma vez e para no último quadro
  const OSSOS_PELE = /^(Head|neck_01|hand_[lr])$|^(index|middle|pinky|ring|thumb)_/;
  const CORRIDA_1X = 170;                                // px/s em que a corrida anima em 1x
  const FADE = 0.15;

  function base64ParaBuffer(b64) {
    const s = atob(b64), u = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i);
    return u.buffer;
  }
  const comp = (attr, v, c) => (c === 0 ? attr.getX(v) : c === 1 ? attr.getY(v) : c === 2 ? attr.getZ(v) : attr.getW(v));

  // reordena os triângulos em dois grupos: 0 = uniforme, 1 = pele (cabeça, pescoço e mãos). Um triângulo
  // é pele quando o osso de maior peso dos três vértices é de pele.
  function dividirPele(geo, esqueleto) {
    if (geo.groups.length === 2) return;
    const pele = new Set();
    esqueleto.bones.forEach((b, i) => { if (OSSOS_PELE.test(b.name)) pele.add(i); });
    const si = geo.attributes.skinIndex, sw = geo.attributes.skinWeight, idx = geo.index;
    const dominante = (v) => { let mw = -1, k = 0; for (let c = 0; c < 4; c++) { const w = comp(sw, v, c); if (w > mw) { mw = w; k = comp(si, v, c); } } return k; };
    const corpo = [], cabeca = [];
    for (let t = 0; t < idx.count; t += 3) {
      const a = idx.getX(t), b = idx.getX(t + 1), c = idx.getX(t + 2);
      (pele.has(dominante(a)) && pele.has(dominante(b)) && pele.has(dominante(c)) ? cabeca : corpo).push(a, b, c);
    }
    geo.setIndex(corpo.concat(cabeca));
    geo.clearGroups();
    geo.addGroup(0, corpo.length, 0);
    geo.addGroup(corpo.length, cabeca.length, 1);
  }

  function preparar(gltf) {
    const cena = gltf.scene;
    cena.updateMatrixWorld(true);
    let malha = null;
    cena.traverse((o) => { if (o.isSkinnedMesh && !malha) malha = o; });
    if (!malha) throw new Error('o modelo não tem malha com esqueleto');
    dividirPele(malha.geometry, malha.skeleton);
    const osso = (n) => { const b = cena.getObjectByName(n); if (!b) throw new Error(`osso "${n}" não encontrado`); return b.getWorldPosition(new THREE.Vector3()); };
    const frente = osso('ball_l').sub(osso('foot_l')).add(osso('ball_r').sub(osso('foot_r')));
    const caixa = new THREE.Box3().setFromObject(cena, true);
    return {
      cena,
      clipes: new Map(gltf.animations.map((c) => [c.name, c])),
      escala: TN.Detento.ALTURA / (caixa.max.y - caixa.min.y),
      giro: Math.atan2(frente.z, frente.x),   // rotation.y que leva a frente do modelo para +X
      piso: caixa.min.y,
    };
  }

  function carregar(b64) {
    return new Promise((resolve, reject) => {
      if (typeof b64 !== 'string' || !b64) { reject(new Error('asset ausente (assets/detento.glb.js não foi carregado)')); return; }
      let buf;
      try { buf = base64ParaBuffer(b64); } catch (e) { reject(new Error('base64 inválido')); return; }
      try {
        new THREE.GLTFLoader().parse(buf, '', (gltf) => { try { resolve(preparar(gltf)); } catch (e) { reject(e); } },
          (e) => reject(e instanceof Error ? e : new Error(String(e))));
      } catch (e) { reject(e); }
    });
  }

  function criar(m, mat) {
    const root = new THREE.Group(), corpo = new THREE.Group(), modelo = THREE.SkeletonUtils.clone(m.cena);
    root.add(corpo); corpo.add(modelo);
    modelo.rotation.y = m.giro;
    modelo.scale.setScalar(m.escala);
    modelo.position.y = -m.piso * m.escala;
    modelo.traverse((o) => { if (o.isSkinnedMesh) { o.material = [mat.suit, mat.skin]; o.castShadow = true; o.frustumCulled = false; } });
    // acessórios: posicionados em relação à pose de ligação (frente = +X, para cima = +Y) e presos ao osso
    // com attach, que mantém a posição de mundo; daí em diante acompanham a animação
    root.updateMatrixWorld(true);
    const osso = (n) => modelo.getObjectByName(n);
    const pos = (n) => osso(n).getWorldPosition(new THREE.Vector3());
    const prender = (malha, nomeOsso, x, y, z) => { malha.position.set(x, y, z); root.add(malha); root.updateMatrixWorld(true); osso(nomeOsso).attach(malha); return malha; };
    const tronco = pos('spine_03'), pescoco = pos('neck_01'), cabeca = pos('Head');
    const placa = prender(new THREE.Mesh(new THREE.PlaneGeometry(10, 5).rotateY(-Math.PI / 2), mat.placa), 'spine_03', tronco.x - 5.6, tronco.y, tronco.z);   // nas costas
    prender(new THREE.Mesh(new THREE.TorusGeometry(2.6, 0.9, 6, 12).rotateX(Math.PI / 2), mat.coleira), 'neck_01', pescoco.x, pescoco.y, pescoco.z);
    const luz = prender(new THREE.Mesh(new THREE.SphereGeometry(1.1, 8, 6), mat.luz), 'neck_01', pescoco.x + 3, pescoco.y, pescoco.z);
    for (const lado of [-1, 1]) prender(new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.2, 1.2), mat.olho), 'Head', cabeca.x + 3.3, cabeca.y + 4.5, cabeca.z + lado * 1.3);
    const mixer = new THREE.AnimationMixer(modelo);
    return {
      root, corpo, luz, placa, mixer, atual: null, acao: null,
      // troca de pose com crossfade; pose sem clipe → Idle_Loop; a corrida anima conforme a velocidade (px/s)
      pose(nome, velocidade = 0) {
        let clipe = POSE_CLIPE[nome] && m.clipes.has(POSE_CLIPE[nome]) ? POSE_CLIPE[nome] : 'Idle_Loop';
        if (!m.clipes.has(clipe)) return;
        if (clipe !== this.atual) {
          const nova = mixer.clipAction(m.clipes.get(clipe));
          nova.reset();
          nova.setLoop(UMA_VEZ.has(clipe) ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
          nova.clampWhenFinished = UMA_VEZ.has(clipe);
          nova.play();
          if (this.acao) nova.crossFadeFrom(this.acao, FADE, false);
          this.acao = nova; this.atual = clipe;
        }
        this.acao.timeScale = clipe === POSE_CLIPE.walk ? Math.min(1.8, Math.max(0.5, velocidade / CORRIDA_1X)) : 1;
      },
      avancar(dt) { mixer.update(dt); },
    };
  }

  TN.Detento = { ALTURA: 60, POSE_CLIPE, carregar, criar };
})();
