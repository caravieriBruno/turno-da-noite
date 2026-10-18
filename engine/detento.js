// DETENTO glTF: o personagem do visual novo (manequim CC0 da Quaternius, em assets/detento.glb.js).
// Decodifica o modelo embutido, normaliza (cerca de 60 de altura, pés em y=0, olhando para +X, igual ao
// boneco de caixas), separa pele e uniforme e cria instâncias com o próprio AnimationMixer.
// A animação é só visual e local: não entra em g.data e não passa pela rede.
// Roda igual no navegador e no Node (tools/teste_detento.js). Precisa de THREE.GLTFLoader e THREE.SkeletonUtils.
(function () {
  // pose do r.character → clipe (o asset só tem estes, ver tools/preparar_detento.js)
  const POSE_CLIPE = {
    idle: 'Idle_Loop', walk: 'Jog_Fwd_Loop', dead: 'Death01', lie: 'Death01', sit: 'Sitting_Idle_Loop',
    crouch: 'Crouch_Idle_Loop', fall: 'Jump_Loop', arms: 'Push_Loop', aim: 'Pistol_Aim_Neutral',
    hold: 'Idle_Torch_Loop', work: 'Interact', pull: 'Push_Loop', statue: 'A_TPose', dance: 'Dance_Loop',
    swing: 'Sword_Attack', gun: 'Pistol_Idle_Loop', shoot: 'Pistol_Shoot', drive: 'Driving_Loop', hit: 'Hit_Chest',
    jump: 'Jump_Start', land: 'Jump_Land',
  };
  const UMA_VEZ = new Set(['Death01', 'Sword_Attack', 'Pistol_Shoot', 'Hit_Chest', 'Jump_Start', 'Jump_Land']);   // tocam uma vez e param no último quadro
  const SEGUE = { Jump_Start: 'Jump_Loop' };             // clipe de uma vez que emenda num loop (o impulso do pulo vira o pulo)
  // walk e crouch escolhem o clipe pela velocidade (px/s); CORRIDA_1X etc. são a velocidade em que cada um anima em 1x
  const ANDAR_MAX = 90, SPRINT_MIN = 330, ARRASTO_MIN = 20;
  const VEL_1X = { Walk_Loop: 60, Jog_Fwd_Loop: 170, Sprint_Loop: 330, Crouch_Fwd_Loop: 80 };
  const OSSOS_PELE = /^(Head|neck_01|hand_[lr])$|^(index|middle|pinky|ring|thumb)_/;
  const CORRIDA_1X = 170;                                // px/s em que a corrida anima em 1x
  const FADE = 0.15;
  const DEITAR_RAPIDO = 3;                               // lie: a queda da morte em ~0,4 s (jogos de reflexo)
  // a morte deita o corpo para trás (cabeça em -X); durante a queda (0,7 a 1,2 s do clipe) o corpo é
  // empurrado para a frente até ficar centrado na posição, como o boneco de caixas deitado
  const RECUO_MORTE = 23, QUEDA_INI = 0.7, QUEDA_FIM = 1.2;

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
    for (const n of ['spine_03', 'neck_01', 'Head']) osso(n);   // os acessórios se prendem a estes (criar)
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
      root, corpo, luz, placa, mixer, atual: null, acao: null, nome: null,
      // troca de pose com crossfade; pose sem clipe → Idle_Loop; walk e crouch escolhem o clipe pela velocidade
      // (px/s), e a corrida anima conforme ela; `pull` é o empurrar tocado ao contrário
      pose(nome, velocidade = 0) {
        const padrao = POSE_CLIPE[nome] && m.clipes.has(POSE_CLIPE[nome]) ? POSE_CLIPE[nome] : 'Idle_Loop';
        let clipe = padrao;
        if (nome === 'walk' && velocidade > 0) clipe = velocidade < ANDAR_MAX ? 'Walk_Loop' : velocidade >= SPRINT_MIN ? 'Sprint_Loop' : 'Jog_Fwd_Loop';
        else if (nome === 'crouch' && velocidade > ARRASTO_MIN) clipe = 'Crouch_Fwd_Loop';
        if (!m.clipes.has(clipe)) clipe = padrao;
        if (!m.clipes.has(clipe)) return;
        // a mesma pose mantida depois de o clipe de uma vez emendar no loop (jump → Jump_Loop) continua no loop
        if (nome === this.nome && SEGUE[clipe] === this.atual) clipe = this.atual;
        this.nome = nome;
        this.tocar(clipe);
        this.acao.timeScale = VEL_1X[clipe] ? Math.min(1.8, Math.max(0.5, (velocidade || VEL_1X[clipe]) / VEL_1X[clipe]))
          : nome === 'lie' ? DEITAR_RAPIDO : nome === 'pull' ? -1 : 1;
      },
      tocar(clipe) {
        if (clipe === this.atual) return;
        const nova = mixer.clipAction(m.clipes.get(clipe));
        // clipe de uma vez (morte, tiro, golpe...) recomeça do início; clipe em loop continua de onde estava
        // (troca rápida walk/idle, como um bot hesitando ou a rede a 30 snapshots/s, não pode reiniciar a corrida)
        if (UMA_VEZ.has(clipe)) nova.reset();
        else { nova.stopFading(); nova.enabled = true; nova.paused = false; }
        nova.setLoop(UMA_VEZ.has(clipe) ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
        nova.clampWhenFinished = UMA_VEZ.has(clipe);
        nova.play();
        if (this.acao) nova.crossFadeFrom(this.acao, FADE, false);
        this.acao = nova; this.atual = clipe;
      },
      avancar(dt) {
        mixer.update(dt);
        // o impulso do pulo acabou: emenda no loop do pulo (com crossfade)
        const seg = SEGUE[this.atual];
        if (seg && m.clipes.has(seg) && this.acao.time >= this.acao.getClip().duration - FADE) { this.tocar(seg); this.acao.timeScale = 1; }
        const k = this.atual === POSE_CLIPE.dead ? Math.min(1, Math.max(0, (this.acao.time - QUEDA_INI) / (QUEDA_FIM - QUEDA_INI))) : 0;
        corpo.position.x = RECUO_MORTE * k;
      },
    };
  }

  TN.Detento = { ALTURA: 60, CORRIDA_1X, POSE_CLIPE, carregar, criar };
})();
