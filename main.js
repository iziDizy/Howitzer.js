import * as THREE from './libs/three.module.js';
import { GLTFLoader } from './libs/GLTFLoader.js'
import { OrbitControls } from './libs/OrbitControls.js'

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xaaaaaa);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(5, 3, 8);

const listener = new THREE.AudioListener();
camera.add(listener);

const explosionSoundBuffer = new Audio();
const shotSoundBuffer = new Audio();
const audioLoader = new THREE.AudioLoader();

audioLoader.load('./sounds/explosion.mp3', (buffer) => {
  explosionSoundBuffer.buffer = buffer;
});

audioLoader.load('./sounds/shot.mp3', (buffer) => {
  shotSoundBuffer.buffer = buffer;
});

const repairSound = new Audio('./sounds/repair.mp3');
repairSound.loop = true;

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

//Cooldown
let lastShotTime = 0;
const shotCooldown = 1000; // 1000 ms = 1 sekunda

//Stan lufy
let barrelWear = 96; // 0 to nowa lufa, 100 to zużyta
const maxBarrelWear = 100;
const minShellPower = 0.4; // minimalna siła 40%

const barrelWearBar = document.getElementById('barrel-wear-bar');
const barrelWearStatus = document.getElementById('barrel-wear-status');

//typ prochu
let powderType = 'nitro'; // 'nitro' lub 'black'


// Światło
const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 1);
hemiLight.position.set(0, 20, 0);
scene.add(hemiLight);

const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
dirLight.position.set(3, 10, 10);
scene.add(dirLight);

// Podłoże
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(100, 100),
  new THREE.MeshStandardMaterial({ color: 0x555555 })
);
ground.rotation.x = -Math.PI / 2;
scene.add(ground);

// Kontrolki kamery
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 1, 0);
controls.update();

// Wczytywanie modelu
const loader = new GLTFLoader();
let barrelInner; // dolna część lufy
let barrelOuter; // górna końcowa część lufy
let initialBarrelPosition;
let howitzerModel = null; // reference to the loaded model
loader.load(
  'm144_155mm_howitzer.glb',
  (gltf) => {
    const model = gltf.scene;
    model.scale.set(1, 1, 1);
    model.position.y = 0;
    scene.add(model);
    howitzerModel = model;

    let meshList = [];
    //let currentIndex = 0;

    console.log('Model:', model);
    model.traverse((child) => {
      if (child.isMesh) {
        meshList.push(child);
      }
    });
    console.log('Znaleziono mesh-y:', meshList.map(m => m.name));

    // document.addEventListener('keydown', (e) => {
    //   if (e.key === 'n' && meshList.length > 0) {
    //     const selected = meshList[currentIndex];
    //     console.log('Wybrany mesh:', selected.name || '(brak nazwy)', selected);

    //     selected.rotation.x += 0.1; // testowy obrót

    //     currentIndex = (currentIndex + 1) % meshList.length; // przejdź do następnego
    //   }
    // });

    barrelInner = meshList[6]; //przypisujemy dolną część lufy
    barrelOuter = meshList[7]; //przypisujemy końcówkę lufy
    initialBarrelPosition = barrelOuter.position.clone(); // zapisz oryginalną pozycję lufy

  },
  undefined,
  (error) => {
    console.error('Błąd ładowania modelu:', error);
  }
);

//sterowanie lufą
let elevation = 0;

// SETTINGS MENU LOGIC
const settingsBtn = document.getElementById('settings-btn');
const settingsModal = document.getElementById('settings-modal');
const closeSettingsBtn = document.getElementById('close-settings');
const volumeSlider = document.getElementById('volume-slider');
const volumeValue = document.getElementById('volume-value');
const graphicsQuality = document.getElementById('graphics-quality');
const invertYCheckbox = document.getElementById('invert-y');
const mouseSensitivitySlider = document.getElementById('mouse-sensitivity');
const mouseSensitivityValue = document.getElementById('mouse-sensitivity-value');
const showHudCheckbox = document.getElementById('show-hud');
const fullscreenBtn = document.getElementById('fullscreen-btn');
const resetSettingsBtn = document.getElementById('reset-settings');
const hudDiv = document.getElementById('hud');

// Default settings
const DEFAULTS = {
  volume: 1,
  graphics: 'high',
  invertY: false,
  mouseSensitivity: 1,
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

mouseSensitivitySlider.addEventListener('input', (e) => {
  const val = parseFloat(e.target.value);
  controls.rotateSpeed = val;
  mouseSensitivityValue.textContent = val.toFixed(1);
});

showHudCheckbox.addEventListener('change', (e) => {
  hudDiv.style.display = e.target.checked ? 'block' : 'none';
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
  mouseSensitivitySlider.value = DEFAULTS.mouseSensitivity;
  controls.rotateSpeed = DEFAULTS.mouseSensitivity;
  mouseSensitivityValue.textContent = DEFAULTS.mouseSensitivity.toFixed(1);
  showHudCheckbox.checked = DEFAULTS.showHud;
  hudDiv.style.display = DEFAULTS.showHud ? 'block' : 'none';
});

settingsBtn.addEventListener('click', () => {
  settingsModal.style.display = 'block';
});
closeSettingsBtn.addEventListener('click', () => {
  settingsModal.style.display = 'none';
});
volumeSlider.addEventListener('input', (e) => {
  const vol = parseFloat(e.target.value);
  setAllVolumes(vol);
  volumeValue.textContent = Math.round(vol * 100) + '%';
});
graphicsQuality.addEventListener('change', (e) => {
  applyGraphicsQuality(e.target.value);
});
// Initialize settings
setAllVolumes(parseFloat(volumeSlider.value));
applyGraphicsQuality(graphicsQuality.value);
controls.rotateSpeed = parseFloat(mouseSensitivitySlider.value);
mouseSensitivityValue.textContent = mouseSensitivitySlider.value;
hudDiv.style.display = showHudCheckbox.checked ? 'block' : 'none';
invertY = invertYCheckbox.checked;

document.addEventListener('keydown', (e) => {
  if (!barrelInner || !barrelOuter) return;

  if (e.key === 'w') {
    elevation = Math.min(elevation + (invertY ? -1 : 1), 45); // max 45 deg
  } else if (e.key === 's') {
    elevation = Math.max(elevation - (invertY ? -1 : 1), 0); // min 0 deg
  }

  barrelInner.rotation.z = -THREE.MathUtils.degToRad(elevation); // Z axis
  barrelOuter.rotation.z = -THREE.MathUtils.degToRad(elevation);
});

//naprawa lufy
let isRepairing = false;
const repairDuration = 3000; // ms
const repairOverlay = document.getElementById('repair-overlay');
const repairProgress = document.getElementById('repair-progress');

function startRepair() {
  if (isRepairing || barrelWear === 0) return;

  isRepairing = true;
  reloadStatus.textContent = 'REPAIRING...';
  repairOverlay.style.display = 'block';
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
      repairOverlay.style.display = 'none';
      repairSound.pause();
      repairSound.currentTime = 0;
      hideRepairWarning(); //ukrycie komunikatu o wymaganej naprawie
    }
  }

  updateRepair();
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'r') {
    startRepair();
  }
});

//komunikat o wymaganej naprawie
const repairWarning = document.getElementById('repair-warning');

function showRepairWarning() {
  repairWarning.style.display = 'block';
}

function hideRepairWarning() {
  repairWarning.style.display = 'none';
}

//ustawianie prochu
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


//obsługa strzału
const shells = [];
const gravity = new THREE.Vector3(0, -9.81, 0);

document.addEventListener('keydown', (e) => {
  if (e.key === ' ') { // SPACJA = STRZAŁ
    const now = performance.now();

    if (isRepairing || barrelWear >= maxBarrelWear) {
      reloadStatus.textContent = 'BARREL WORN';
      showRepairWarning();
      return;
    };

    if (now - lastShotTime < shotCooldown) return; // cooldown

    lastShotTime = now; // aktualizacja czasu ostatniego strzału
    hideRepairWarning();

    const shell = createShell();
    const { start, direction } = getShellSpawn(barrelOuter);

    // Parametry zależne od typu prochu
    let speed, wear;
    if (powderType === 'black') {
      speed = 30;
      wear = 10;
    } else {
      speed = 50;
      wear = 5;
    }

    // Zużyj lufę
    barrelWear = Math.min(barrelWear + wear, maxBarrelWear);

    // Oblicz moc pocisku (mniejsza przy zużyciu)
    const wearFactor = 1 - (barrelWear / maxBarrelWear) * (1 - minShellPower);

    shell.position.copy(start);
    scene.add(shell);

    shells.push({
      mesh: shell,
      velocity: direction.multiplyScalar(speed * wearFactor),
    });

    // dźwięk wystrzału
    const shotSound = new THREE.PositionalAudio(listener);
    shotSound.setBuffer(shotSoundBuffer.buffer);
    shotSound.setRefDistance(5);
    shotSound.setVolume(typeof window._globalSoundVolume === 'number' ? window._globalSoundVolume : 0.3);
    barrelOuter.add(shotSound);
    shotSound.play();

    animateRecoil(barrelOuter);

  }
});

//tworzenie pocisku
function createShell() {
  const geometry = new THREE.SphereGeometry(0.1, 8, 8); // rozmiar pocisku
  const material = new THREE.MeshStandardMaterial({ color: 0xffaa00 });
  const shell = new THREE.Mesh(geometry, material);
  return shell;
}

//pobieranie pozycji dla wylotu z lufy
function getShellSpawn(barrelOuter) {
  const direction = new THREE.Vector3();

  // Pozycja globalna końcówki lufy
  const localOffset = new THREE.Vector3(2.5, 5, 1.55); // -Z w lokalnym układzie lufy
  const worldOffset = localOffset.clone().applyMatrix4(barrelOuter.matrixWorld); // przekształcamy do świata

  const worldOrigin = new THREE.Vector3();
  barrelOuter.getWorldPosition(worldOrigin); // globalna pozycja lufy

  const spawn = worldOffset; // końcowy punkt startowy pocisku

  // Kierunek "do przodu" lufy w przestrzeni świata
  direction.set(1, 2.4, 0);
  barrelOuter.localToWorld(direction);
  direction.sub(barrelOuter.getWorldPosition(new THREE.Vector3())).normalize();

  return { start: spawn, direction };
}

function animateRecoil(barrel, amount = 0.6, duration = 0.2) {
  const recoilAxis = new THREE.Vector3(-0.5, -2, 0);
  recoilAxis.applyQuaternion(barrel.quaternion); // przekształć do świata

  const startTime = performance.now();

  function animate() {
  requestAnimationFrame(animate);

  for (let i = shells.length - 1; i >= 0; i--) {
    const shell = shells[i];

    shell.velocity.add(gravity.clone().multiplyScalar(deltaTime));
    shell.mesh.position.add(shell.velocity.clone().multiplyScalar(deltaTime));

    // Wybuch po uderzeniu w ziemię
    if (shell.mesh.position.y <= 0) {
      createExplosion(shell.mesh.position);
      scene.remove(shell.mesh);
      shells.splice(i, 1);
    }
  }

  const now = performance.now();
  const reloadProgress = Math.min((now - lastShotTime) / shotCooldown, 1);
  reloadBar.style.transform = `scaleX(${reloadProgress})`;
  if (!isRepairing) {
    if (barrelWear >= maxBarrelWear) {
      showRepairWarning();
      reloadStatus.textContent = 'BARREL WORN';
      reloadStatus.style.color = 'red';
      reloadBar.style.background = 'red';
    } else {
      reloadStatus.textContent = reloadProgress < 1 ? 'RELOADING...' : 'READY';
      reloadStatus.style.color = 'white';
      reloadBar.style.background = reloadProgress < 1 ? 'red' : 'limegreen';
    }
  }

  // Aktualizacja HUD lufy
  barrelWearBar.style.width = `${barrelWear}%`;
  barrelWearStatus.textContent = `${Math.round(barrelWear)}%`;

  // ruch haubicy po płaszczyźnie
  if (howitzerModel) {
    let moved = false;
    let dx = 0, dz = 0;
    if (moveState.left)  { dx -= MOVE_SPEED; moved = true; }
    if (moveState.right) { dx += MOVE_SPEED; moved = true; }
    if (moveState.up)    { dz -= MOVE_SPEED; moved = true; }
    if (moveState.down)  { dz += MOVE_SPEED; moved = true; }
    if (moved) {
      // blok na krawędziach - dla 100x100 
      howitzerModel.position.x = Math.max(-49, Math.min(49, howitzerModel.position.x + dx));
      howitzerModel.position.z = Math.max(-49, Math.min(49, howitzerModel.position.z + dz));
    }
    // rotacja
    howitzerModel.rotation.y = howitzerRotation;
    
    // aktualizuj cel kamery względem pozycji haubicy
    if (followHowitzerView && howitzerModel) {
      const distance = 8; 
      const height = 4;   
      
      const angle = howitzerModel.rotation.y + Math.PI;

      // lock kamery za i nad haubicą
      const camX = howitzerModel.position.x - Math.sin(angle) * distance;
      const camZ = howitzerModel.position.z - Math.cos(angle) * distance;
      const camY = howitzerModel.position.y + height;
      camera.position.set(camX, camY, camZ);

      //perspektywa przed haubicę
      const lookDistance = 4;
      const lookAtAngle = howitzerModel.rotation.y;
      const lookAtX = howitzerModel.position.x + Math.sin(lookAtAngle) * lookDistance;
      const lookAtZ = howitzerModel.position.z + Math.cos(lookAtAngle) * lookDistance;
      const lookAtY = howitzerModel.position.y + 2;
      camera.lookAt(lookAtX, lookAtY, lookAtZ);
    } else {
      controls.target.set(howitzerModel.position.x, howitzerModel.position.y + 1, howitzerModel.position.z);
      controls.update();
    }
  }

  renderer.render(scene, camera);
}

  animate();
}

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

const reloadBar = document.getElementById('reload-bar'); //pobranie paska przeładowania
const reloadStatus = document.getElementById('reload-status'); //pobranie statusu (tekst)


const deltaTime = 1 / 60;
function animate() {
  requestAnimationFrame(animate);

  for (let i = shells.length - 1; i >= 0; i--) {
    const shell = shells[i];

    shell.velocity.add(gravity.clone().multiplyScalar(deltaTime));
    shell.mesh.position.add(shell.velocity.clone().multiplyScalar(deltaTime));

    // Wybuch po uderzeniu w ziemię
    if (shell.mesh.position.y <= 0) {
      createExplosion(shell.mesh.position);
      scene.remove(shell.mesh);
      shells.splice(i, 1);
    }
  }

  const now = performance.now();
  const reloadProgress = Math.min((now - lastShotTime) / shotCooldown, 1);
  reloadBar.style.transform = `scaleX(${reloadProgress})`;
  if (!isRepairing) {
    if (barrelWear >= maxBarrelWear) {
      showRepairWarning();
      reloadStatus.textContent = 'BARREL WORN';
      reloadStatus.style.color = 'red';
      reloadBar.style.background = 'red';
    } else {
      reloadStatus.textContent = reloadProgress < 1 ? 'RELOADING...' : 'READY';
      reloadStatus.style.color = 'white';
      reloadBar.style.background = reloadProgress < 1 ? 'red' : 'limegreen';
    }
  }

  // Aktualizacja HUD lufy
  barrelWearBar.style.width = `${barrelWear}%`;
  barrelWearStatus.textContent = `${Math.round(barrelWear)}%`;

  // Move howitzer on ground
  if (howitzerModel) {
    let moved = false;
    let dx = 0, dz = 0;
    if (moveState.left)  { dx -= MOVE_SPEED; moved = true; }
    if (moveState.right) { dx += MOVE_SPEED; moved = true; }
    if (moveState.up)    { dz -= MOVE_SPEED; moved = true; }
    if (moveState.down)  { dz += MOVE_SPEED; moved = true; }
    if (moved) {
      // Clamp to ground size (assuming 100x100 plane)
      howitzerModel.position.x = Math.max(-49, Math.min(49, howitzerModel.position.x + dx));
      howitzerModel.position.z = Math.max(-49, Math.min(49, howitzerModel.position.z + dz));
    }
    // Always apply rotation
    howitzerModel.rotation.y = howitzerRotation;
    // Always update camera target to follow howitzer
    if (followHowitzerView && howitzerModel) {
      const distance = 8; // distance behind
      const height = 4;   // height above
      // Add 180 degrees (Math.PI) to the angle to get behind
      const angle = howitzerModel.rotation.y + Math.PI;

      // Camera position: behind and above the howitzer
      const camX = howitzerModel.position.x - Math.sin(angle) * distance;
      const camZ = howitzerModel.position.z - Math.cos(angle) * distance;
      const camY = howitzerModel.position.y + height;
      camera.position.set(camX, camY, camZ);

      // Look at a point in front of the howitzer (original facing direction)
      const lookDistance = 4;
      const lookAtAngle = howitzerModel.rotation.y;
      const lookAtX = howitzerModel.position.x + Math.sin(lookAtAngle) * lookDistance;
      const lookAtZ = howitzerModel.position.z + Math.cos(lookAtAngle) * lookDistance;
      const lookAtY = howitzerModel.position.y + 2;
      camera.lookAt(lookAtX, lookAtY, lookAtZ);
    } else {
      controls.target.set(howitzerModel.position.x, howitzerModel.position.y + 1, howitzerModel.position.z);
      controls.update();
    }
  }

  renderer.render(scene, camera);
}
animate();

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Movement state
let moveState = { left: false, right: false, up: false, down: false };
const MOVE_SPEED = 0.15;

document.addEventListener('keydown', (e) => {
  // Arrow key movement
  if (howitzerModel) {
    if (e.key === 'ArrowLeft') moveState.left = true;
    if (e.key === 'ArrowRight') moveState.right = true;
    if (e.key === 'ArrowUp') moveState.up = true;
    if (e.key === 'ArrowDown') moveState.down = true;
  }
  if (!barrelInner || !barrelOuter) return;

  if (e.key === 'w') {
    elevation = Math.min(elevation + (invertY ? -1 : 1), 45); // max 45 deg
  } else if (e.key === 's') {
    elevation = Math.max(elevation - (invertY ? -1 : 1), 0); // min 0 deg
  }

  barrelInner.rotation.z = -THREE.MathUtils.degToRad(elevation); // oś Z
  barrelOuter.rotation.z = -THREE.MathUtils.degToRad(elevation);
});

document.addEventListener('keyup', (e) => {
  if (howitzerModel) {
    if (e.key === 'ArrowLeft') moveState.left = false;
    if (e.key === 'ArrowRight') moveState.right = false;
    if (e.key === 'ArrowUp') moveState.up = false;
    if (e.key === 'ArrowDown') moveState.down = false;
  }
});

let howitzerRotation = 0; 
const ROTATE_STEP = Math.PI / 36; 
// listenery na rotację
const rotateLeftBtn = document.getElementById('rotate-left-btn');
const rotateRightBtn = document.getElementById('rotate-right-btn');
if (rotateLeftBtn && rotateRightBtn) {
  rotateLeftBtn.addEventListener('click', () => {
    if (howitzerModel) {
      howitzerRotation += ROTATE_STEP;
      howitzerModel.rotation.y = howitzerRotation;
    }
  });
  rotateRightBtn.addEventListener('click', () => {
    if (howitzerModel) {
      howitzerRotation -= ROTATE_STEP;
      howitzerModel.rotation.y = howitzerRotation;
    }
  });
}

// rotacja klawiszami
document.addEventListener('keydown', (e) => {
  if (howitzerModel) {
    if (e.key === 'q' || e.key === 'Q') {
      howitzerRotation += ROTATE_STEP;
      howitzerModel.rotation.y = howitzerRotation;
    }
    if (e.key === 'e' || e.key === 'E') {
      howitzerRotation -= ROTATE_STEP;
      howitzerModel.rotation.y = howitzerRotation;
    }
  }
  // ruch po płaszczyźnie strzałkami
  if (howitzerModel) {
    if (e.key === 'ArrowLeft') moveState.left = true;
    if (e.key === 'ArrowRight') moveState.right = true;
    if (e.key === 'ArrowUp') moveState.up = true;
    if (e.key === 'ArrowDown') moveState.down = true;
  }
});

// śledź kamerę
let followHowitzerView = false;
document.addEventListener('keydown', (e) => {
  if (e.key === 'v' || e.key === 'V') {
    followHowitzerView = !followHowitzerView;
  }
});
