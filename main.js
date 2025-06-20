import * as THREE from './libs/three.module.js';
import { GLTFLoader } from './libs/GLTFLoader.js'
import { OrbitControls } from './libs/OrbitControls.js'

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xaaaaaa);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(3, 3, 180);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const clock = new THREE.Clock();

// --- Dźwięk ---
const listener = new THREE.AudioListener();
camera.add(listener);

const explosionSoundBuffer = new Audio();
const shotSoundBuffer = new Audio();
const audioLoader = new THREE.AudioLoader();

const repairSound = new Audio('./sounds/repair.mp3');
repairSound.loop = true;

// --- Stan rozgrywki ---
// Cooldown
let lastShotTime = 0;
const shotCooldown = 1000; // 1000 ms = 1 sekunda

// Stan lufy
let barrelWear = 80; // 0 to nowa lufa, 100 to zużyta
const maxBarrelWear = 100;
const minShellPower = 0.4; // minimalna siła 40%

// Typ prochu
let powderType = 'nitro'; // 'nitro' lub 'black'

// Wiatr
let wind = new THREE.Vector3(0, 0, 0); // domyślnie brak wiatru

// Sterowanie
let elevation = 0;
let howitzerRotation = 0;
let thirdPersonEnabled = false;

// Naprawa
let isRepairing = false;
const repairDuration = 3000; // ms

// --- Referencje do obiektów 3D ---
let barrelInner; // dolna część lufy
let barrelOuter; // górna końcowa część lufy
let initialBarrelPosition;
let howitzerModel; // załadowany model
const shells = [];
const targets = [];

// --- Światło ---
const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 1);
hemiLight.position.set(0, 20, 0);
scene.add(hemiLight);

const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
dirLight.position.set(3, 10, 10);
scene.add(dirLight);

// --- Podłoże ---
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(175, 400, 500),
  new THREE.MeshStandardMaterial({ color: 0x555555 })
);
ground.rotation.x = -Math.PI / 2;
scene.add(ground);

// --- Kontrolki kamery ---
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 1, 170);
controls.update();

// --- Flaga ---
const flagUniforms = {
  time: { value: 0 },
  windStrength: { value: 1 }
};
const flagMaterial = new THREE.ShaderMaterial({
  uniforms: flagUniforms,
  side: THREE.DoubleSide,
  vertexShader: `
    uniform float time;
    uniform float windStrength;
    varying vec2 vUv;
    
    void main() {
      vUv = uv;
      vec3 pos = position;

      float wave = sin(pos.y * 10.0 + time * 5.0) * 0.02 * windStrength;
      pos.z += wave * (uv.x);

      gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
    }
  `,
  fragmentShader: `
    varying vec2 vUv;

    void main() {
      if (vUv.y > 0.5) {
        gl_FragColor = vec4(1.0, 1.0, 1.0, 1.0);
      } else {
        gl_FragColor = vec4(0.8, 0.0, 0.0, 1.0);
      }
    }
  `
});
const flagGeometry = new THREE.PlaneGeometry(0.6, 0.4, 20, 10);
flagGeometry.translate(0.3, 0, 0);

const flag = new THREE.Mesh(flagGeometry, flagMaterial);

const poleGeometry = new THREE.CylinderGeometry(0.02, 0.02, 2.5, 8);
const poleMaterial = new THREE.MeshStandardMaterial({ color: 0x555555 });
const flagPole = new THREE.Mesh(poleGeometry, poleMaterial);
flagPole.position.set(-3, 1.25, 170);
scene.add(flagPole);

flagPole.add(flag);
flag.position.set(0, 1.25, 0);

// --- Cele do trafienia ---
const targetPositions = [
  new THREE.Vector3(20, 0, 50),
  new THREE.Vector3(-40, 0, 100),
  new THREE.Vector3(0, 0, -40)
];
const targetGeometry = new THREE.BoxGeometry(2, 2, 2);
const targetMaterial = new THREE.MeshStandardMaterial({ color: 0xff0000 });

targetPositions.forEach(pos => {
  const target = new THREE.Mesh(targetGeometry, targetMaterial.clone());
  target.position.copy(pos);
  target.visible = true;
  scene.add(target);
  targets.push(target);
});


// --- Ładowanie dźwięków ---
audioLoader.load('./sounds/explosion.mp3', (buffer) => {
  explosionSoundBuffer.buffer = buffer;
});

audioLoader.load('./sounds/shot.mp3', (buffer) => {
  shotSoundBuffer.buffer = buffer;
});

// --- Wczytywanie modelu ---
const loader = new GLTFLoader();
loader.load(
  'm144_155mm_howitzer.glb',
  (gltf) => {
    const model = gltf.scene;
    model.scale.set(1, 1, 1);
    model.position.set(0, 0, 170);
    scene.add(model);
    howitzerModel = model;

    let meshList = [];
    console.log('Model:', model);
    model.traverse((child) => {
      if (child.isMesh) {
        meshList.push(child);
      }
    });
    console.log('Znaleziono mesh-y:', meshList.map(m => m.name));

    barrelInner = meshList[6];
    barrelOuter = meshList[7];
    initialBarrelPosition = barrelOuter.position.clone();

  },
  undefined,
  (error) => {
    console.error('Błąd ładowania modelu:', error);
  }
);


// Referencje do elementów DOM
const barrelWearBar = document.getElementById('barrel-wear-bar');
const barrelWearStatus = document.getElementById('barrel-wear-status');
const reloadBar = document.getElementById('reload-bar');
const reloadStatus = document.getElementById('reload-status');
const repairOverlay = document.getElementById('repair-overlay');
const repairProgress = document.getElementById('repair-progress');
const repairWarning = document.getElementById('repair-warning');
const hudDiv = document.getElementById('hud');

// Menu ustawień
const settingsBtn = document.getElementById('settings-btn');
const settingsModal = document.getElementById('settings-modal');
const closeSettingsBtn = document.getElementById('close-settings');
const volumeSlider = document.getElementById('volume-slider');
const volumeValue = document.getElementById('volume-value');
const graphicsQuality = document.getElementById('graphics-quality');
const invertYCheckbox = document.getElementById('invert-y');
const showHudCheckbox = document.getElementById('show-hud');
const fullscreenBtn = document.getElementById('fullscreen-btn');
const resetSettingsBtn = document.getElementById('reset-settings');

// Wiatr
const windCanvas = document.getElementById('wind-canvas');
const ctx = windCanvas.getContext('2d');
const windDirLabel = document.getElementById('wind-dir-label');
const windStrengthLabel = document.getElementById('wind-strength-label');


// Logika menu ustawień
const DEFAULTS = {
  volume: 1,
  graphics: 'high',
  invertY: false,
  showHud: true
};

function setAllVolumes(vol) {
  if (repairSound instanceof Audio) {
    repairSound.volume = vol;
  } else if (repairSound.setVolume) {
    repairSound.setVolume(vol);
  }
  window._globalSoundVolume = vol;
}

function applyGraphicsQuality(val) {
  if (val === 'low') {
    renderer.setPixelRatio(0.5);
    renderer.shadowMap.enabled = false;
    ground.material.color.set(0x333333);
  } else {
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = true;
    ground.material.color.set(0x555555);
  }
  renderer.setSize(window.innerWidth, window.innerHeight);
}

let invertY = false;
invertYCheckbox.addEventListener('change', (e) => {
  invertY = e.target.checked;
});

showHudCheckbox.addEventListener('change', (e) => {
  if (e.target.checked) {
    hudDiv.classList.remove('hidden');
  } else {
    hudDiv.classList.add('hidden');
  }
});

fullscreenBtn.addEventListener('click', () => {
  if (!document.fullscreenElement) {
    document.body.requestFullscreen();
  } else {
    document.exitFullscreen();
  }
});

resetSettingsBtn.addEventListener('click', () => {
  volumeSlider.value = DEFAULTS.volume;
  volumeValue.textContent = '100%';
  setAllVolumes(DEFAULTS.volume);
  graphicsQuality.value = DEFAULTS.graphics;
  applyGraphicsQuality(DEFAULTS.graphics);
  invertYCheckbox.checked = DEFAULTS.invertY;
  invertY = DEFAULTS.invertY;
  showHudCheckbox.checked = DEFAULTS.showHud;
  if (DEFAULTS.showHud) {
    hudDiv.classList.remove('hidden');
  } else {
    hudDiv.classList.add('hidden');
  }
});

settingsBtn.addEventListener('click', () => {
  settingsModal.classList.remove('hidden');
});
closeSettingsBtn.addEventListener('click', () => {
  settingsModal.classList.add('hidden');
});
volumeSlider.addEventListener('input', (e) => {
  const vol = parseFloat(e.target.value);
  setAllVolumes(vol);
  volumeValue.textContent = Math.round(vol * 100) + '%';
});
graphicsQuality.addEventListener('change', (e) => {
  applyGraphicsQuality(e.target.value);
});

// Inicjalizacja ustawień (pozostawiona w tym samym miejscu)
setAllVolumes(parseFloat(volumeSlider.value));
applyGraphicsQuality(graphicsQuality.value);
if (showHudCheckbox.checked) {
  hudDiv.classList.remove('hidden');
} else {
  hudDiv.classList.add('hidden');
}
invertY = invertYCheckbox.checked;

// Komunikaty i ostrzeżenia
function showRepairWarning() {
  repairWarning.classList.remove('hidden');
}

function hideRepairWarning() {
  repairWarning.classList.add('hidden');
}


// Sterowanie lufą
document.addEventListener('keydown', (e) => {
  if (!barrelInner || !barrelOuter) return;

  let change = 0;
  if (e.key === 'w') {
    change = invertY ? -1 : 1; // Jeśli invertY jest true, zmiana to -1, w przeciwnym razie 1
  } else if (e.key === 's') {
    change = invertY ? 1 : -1; // Jeśli invertY jest true, zmiana to 1, w przeciwnym razie -1
  }

  // Jeśli nastąpiła zmiana, aktualizujemy elewację
  if (change !== 0) {
    elevation += change;
    // Upewniamy się, że elewacja pozostaje w zakresie 0-45 stopni
    elevation = Math.max(0, Math.min(elevation, 45));

    barrelInner.rotation.z = -THREE.MathUtils.degToRad(elevation);
    barrelOuter.rotation.z = -THREE.MathUtils.degToRad(elevation);
  }
});

// Naprawa lufy
function startRepair() {
  if (isRepairing || barrelWear === 0) return;

  isRepairing = true;
  reloadStatus.textContent = 'REPAIRING...';
  repairOverlay.classList.remove('hidden');
  repairProgress.textContent = '0%';

  repairSound.currentTime = 0;
  repairSound.play().catch(e => console.warn('Nie można odtworzyć dźwięku:', e));

  const startTime = performance.now();

  function updateRepair() {
    const now = performance.now();
    const elapsed = now - startTime;
    const progress = Math.min(elapsed / repairDuration, 1);
    repairProgress.textContent = `${Math.floor(progress * 100)}%`;

    if (progress < 1) {
      requestAnimationFrame(updateRepair);
    } else {
      barrelWear = 0;
      isRepairing = false;
      repairOverlay.classList.add('hidden');
      repairSound.pause();
      repairSound.currentTime = 0;
      hideRepairWarning();
    }
  }

  updateRepair();
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'r') {
    startRepair();
  }
});

// Ustawianie prochu
function setPowder(type) {
  if (type === 'black' || type === 'nitro') {
    powderType = type;
    document.getElementById('powder-status').textContent = `POWDER: ${type.toUpperCase()}`;
  }
}

document.addEventListener('keydown', (e) => {
  if (e.key === '1') setPowder('black');
  if (e.key === '2') setPowder('nitro');
});

// Obsługa strzału
const gravity = new THREE.Vector3(0, -9.81, 0);

document.addEventListener('keydown', (e) => {
  if(isRepairing)return;
  if (e.key === ' ') { // SPACJA = STRZAŁ
    const now = performance.now();

    if (isRepairing || barrelWear >= maxBarrelWear) {
      reloadStatus.textContent = 'BARREL WORN';
      showRepairWarning();
      return;
    };

    if (now - lastShotTime < shotCooldown) return;

    lastShotTime = now;
    hideRepairWarning();

    const shell = createShell();
    const { start, direction } = getShellSpawn(barrelOuter);

    let speed, wear;
    if (powderType === 'black') {
      speed = 30;
      wear = 10;
    } else {
      speed = 50;
      wear = 5;
    }

    barrelWear = Math.min(barrelWear + wear, maxBarrelWear);
    const wearFactor = 1 - (barrelWear / maxBarrelWear) * (1 - minShellPower);

    shell.position.copy(start);
    scene.add(shell);

    shells.push({
      mesh: shell,
      velocity: direction.multiplyScalar(speed * wearFactor),
    });

    const shotSound = new THREE.PositionalAudio(listener);
    shotSound.setBuffer(shotSoundBuffer.buffer);
    shotSound.setRefDistance(5);
    shotSound.setVolume(typeof window._globalSoundVolume === 'number' ? window._globalSoundVolume : 1);
    barrelOuter.add(shotSound);
    shotSound.play();

    animateRecoil(barrelOuter);
  }
});

// Funkcje pomocnicze strzału
function createShell() {
  const geometry = new THREE.SphereGeometry(0.1, 8, 8);
  const material = new THREE.MeshStandardMaterial({ color: 0xffaa00 });
  const shell = new THREE.Mesh(geometry, material);
  return shell;
}

function getShellSpawn(barrelOuter) {
  const direction = new THREE.Vector3();
  const localOffset = new THREE.Vector3(2.5, 5, 1.55);
  const worldOffset = localOffset.clone().applyMatrix4(barrelOuter.matrixWorld);

  const worldOrigin = new THREE.Vector3();
  barrelOuter.getWorldPosition(worldOrigin);

  const spawn = worldOffset;

  direction.set(1, 2.4, 0);
  barrelOuter.localToWorld(direction);
  direction.sub(barrelOuter.getWorldPosition(new THREE.Vector3())).normalize();

  return { start: spawn, direction };
}

function animateRecoil(barrel, amount = 0.6, duration = 0.2) {
  const recoilAxis = new THREE.Vector3(-0.5, -2, 0);
  recoilAxis.applyQuaternion(barrel.quaternion);

  const startTime = performance.now();

  function animate() {
    const elapsed = (performance.now() - startTime) / 1000;
    const t = Math.min(elapsed / duration, 1);
    const eased = 1 - Math.pow(1 - t, 3);

    const offset = recoilAxis.clone().multiplyScalar((1 - eased) * amount);

    barrel.position.copy(initialBarrelPosition.clone().add(offset));

    if (t < 1) {
      requestAnimationFrame(animate);
    } else {
      barrel.position.copy(initialBarrelPosition);
    }
  }

  animate();
}

// Efekty i kolizje
function createExplosion(position) {
  const explosion = new THREE.Mesh(
    new THREE.SphereGeometry(0.5, 16, 16),
    new THREE.MeshBasicMaterial({ color: 0xffaa00, transparent: true, opacity: 1 })
  );

  explosion.position.copy(position);
  scene.add(explosion);

  const explosionSound = new THREE.PositionalAudio(listener);
  explosionSound.setBuffer(explosionSoundBuffer.buffer);
  explosionSound.setRefDistance(10);
  explosionSound.setVolume(typeof window._globalSoundVolume === 'number' ? window._globalSoundVolume : 1);
  explosion.position.copy(position);
  explosion.add(explosionSound);
  explosionSound.play();

  createCrater(position);

  const startTime = performance.now();

  function animateExplosion() {
    const elapsed = (performance.now() - startTime) / 1000;
    const duration = 0.5;

    if (elapsed < duration) {
      const scale = 1 + elapsed * 2;
      explosion.scale.set(scale, scale, scale);
      explosion.material.opacity = 1 - elapsed / duration;
      requestAnimationFrame(animateExplosion);
    } else {
      scene.remove(explosion);
    }
  }

  animateExplosion();
}

function createCrater(position) {
  const crater = new THREE.Mesh(
    new THREE.CircleGeometry(0.5 + Math.random() * 0.3, 16),
    new THREE.MeshBasicMaterial({
      color: 0x333333,
      opacity: 0.6,
      transparent: true,
      depthWrite: false,
    })
  );
  crater.rotation.x = -Math.PI / 2;
  crater.position.copy(position);
  crater.position.y = 0.01;

  scene.add(crater);
}

function onTargetHit(target) {
  target.visible = false;
  createExplosion(target.position);
  setTimeout(() => {
    target.visible = true;
  }, 15000);
}

function checkTargetHits(projectile) {
  for (const target of targets) {
    if (!target.visible) continue;

    const projectileBox = new THREE.Box3().setFromObject(projectile);
    const targetBox = new THREE.Box3().setFromObject(target);

    if (projectileBox.intersectsBox(targetBox)) {
      onTargetHit(target);
      return true;
    }
  }
  return false;
}

// Obsługa wiatru
function updateFlagDirection() {
  if (wind.length() === 0) return;

  const windClone = wind.clone().normalize();
  const angle = Math.atan2(windClone.x, windClone.z);
  flag.rotation.y = angle + 1.5 + Math.PI;
}

const center = { x: windCanvas.width / 2, y: windCanvas.height / 2 };
const maxStrength = 10;

function drawWindSelector(x, y) {
  ctx.clearRect(0, 0, windCanvas.width, windCanvas.height);
  ctx.strokeStyle = '#444';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(center.x, 0);
  ctx.lineTo(center.x, windCanvas.height);
  ctx.moveTo(0, center.y);
  ctx.lineTo(windCanvas.width, center.y);
  ctx.stroke();
  ctx.fillStyle = 'white';
  ctx.font = '12px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('N', center.x, 10);
  ctx.fillText('S', center.x, windCanvas.height - 5);
  ctx.fillText('W', 10, center.y + 4);
  ctx.fillText('E', windCanvas.width - 10, center.y + 4);
  ctx.strokeStyle = 'lime';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(center.x, center.y);
  ctx.lineTo(x, y);
  ctx.stroke();
  ctx.fillStyle = 'lime';
  ctx.beginPath();
  ctx.arc(x, y, 4, 0, Math.PI * 2);
  ctx.fill();
}

function setWindFromCanvas(e) {
  const rect = windCanvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  const dx = x - center.x;
  const dy = y - center.y;
  const distance = Math.sqrt(dx * dx + dy * dy);
  const maxDistance = windCanvas.width / 2;
  const strength = Math.min(distance / maxDistance, 1) * maxStrength;
  const angle = Math.atan2(dx, -dy);
  wind.x = -(Math.sin(angle) * strength);
  wind.z = Math.cos(angle) * strength;
  const angleDeg = (THREE.MathUtils.radToDeg(angle) + 360) % 360;
  windDirLabel.textContent = `${angleDeg.toFixed(0)}°`;
  windStrengthLabel.textContent = strength.toFixed(2);
  drawWindSelector(x, y);
}

windCanvas.addEventListener('mousedown', (e) => {
  setWindFromCanvas(e);
  function moveHandler(ev) {
    setWindFromCanvas(ev);
  }
  function upHandler() {
    document.removeEventListener('mousemove', moveHandler);
    document.removeEventListener('mouseup', upHandler);
  }
  document.addEventListener('mousemove', moveHandler);
  document.addEventListener('mouseup', upHandler);
});
drawWindSelector(center.x, center.y); // początkowy rysunek

// Sterowanie haubicą
document.addEventListener('keydown', (e) => {
  if (!howitzerModel) return;
  const moveStep = 0.1;
  switch (e.key) {
    case 'ArrowUp': howitzerModel.position.z -= moveStep; break;
    case 'ArrowDown': howitzerModel.position.z += moveStep; break;
    case 'ArrowLeft': howitzerModel.position.x -= moveStep; break;
    case 'ArrowRight': howitzerModel.position.x += moveStep; break;
    case 'q': case 'Q': howitzerRotation += 2; break;
    case 'e': case 'E': howitzerRotation -= 2; break;
    case 'v': case 'V': thirdPersonEnabled = !thirdPersonEnabled; break;
  }
  howitzerModel.rotation.y = THREE.MathUtils.degToRad(howitzerRotation);
});

document.addEventListener('click', (e) => {
  if (!howitzerModel) return;
  if (e.target.id === 'rotate-left-btn') {
    howitzerRotation += 2;
  } else if (e.target.id === 'rotate-right-btn') {
    howitzerRotation -= 2;
  }
  howitzerModel.rotation.y = THREE.MathUtils.degToRad(howitzerRotation);
});


//Główna pętla animacji
function animate() {
  requestAnimationFrame(animate);

  const deltaTime = clock.getDelta();
  const now = performance.now();
  const reloadProgress = Math.min((now - lastShotTime) / shotCooldown, 1);

  // Aktualizacja fizyki pocisków
  for (let i = shells.length - 1; i >= 0; i--) {
    const shell = shells[i];
    shell.velocity.add(gravity.clone().multiplyScalar(deltaTime));
    shell.velocity.add(wind.clone().multiplyScalar(deltaTime));
    shell.mesh.position.add(shell.velocity.clone().multiplyScalar(deltaTime));
    if (checkTargetHits(shell.mesh)) {
      scene.remove(shell.mesh);
      shells.splice(i, 1);
      continue;
    }
    if (shell.mesh.position.y <= 0) {
      createExplosion(shell.mesh.position);
      scene.remove(shell.mesh);
      shells.splice(i, 1);
    }
  }

  // Obrót haubicy
  if (howitzerModel) {
    howitzerModel.rotation.y = THREE.MathUtils.degToRad(howitzerRotation);
  }

  // Kierunek flagi
  updateFlagDirection();
  flagUniforms.time.value = now / 1000;
  flagUniforms.windStrength.value = wind.length();

  // Aktualizacja UI
  reloadBar.style.width = `${reloadProgress * 100}%`;
  if (!isRepairing) {
    if (barrelWear >= maxBarrelWear) {
      showRepairWarning();
      reloadStatus.textContent = 'BARREL WORN';
      reloadStatus.style.color = 'red';
      reloadBar.style.background = 'red'
    } else {
      reloadStatus.textContent = reloadProgress < 1 ? 'RELOADING...' : 'READY';
      reloadStatus.style.color = 'white';
      reloadBar.style.background = reloadProgress < 1 ? 'red' : 'limegreen';
    }
  }

  barrelWearBar.style.width = `${barrelWear}%`;
  barrelWearStatus.textContent = `${Math.round(barrelWear)}%`;

  // Kamera TPP
  if (howitzerModel && thirdPersonEnabled) {
    const offset = new THREE.Vector3(-1, 3, 4);
    offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), howitzerModel.rotation.y);
    camera.position.copy(howitzerModel.position).add(offset);
    const lookDirection = new THREE.Vector3(-0.7, 2, -1);
    lookDirection.applyEuler(howitzerModel.rotation);
    const target = new THREE.Vector3().copy(howitzerModel.position).add(lookDirection);
    camera.lookAt(target);
  }

  renderer.render(scene, camera);
}

// Uruchomienie pętli
animate();