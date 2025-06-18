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

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

//Cooldown
let lastShotTime = 0;
const shotCooldown = 1000; // 1000 ms = 1 sekunda

//Stan lufy
let barrelWear = 96; // 0 to nowa lufa, 100 to zużyta
const maxBarrelWear = 100;
const wearPerShot = 5; // ile % na strzał
const minShellPower = 0.4; // minimalna siła 40%

const barrelWearBar = document.getElementById('barrel-wear-bar');
const barrelWearStatus = document.getElementById('barrel-wear-status');


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
loader.load(
  'm144_155mm_howitzer.glb',
  (gltf) => {
    const model = gltf.scene;
    model.scale.set(1, 1, 1);
    model.position.y = 0;
    scene.add(model);

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

document.addEventListener('keydown', (e) => {
  if (!barrelInner || !barrelOuter) return;

  if (e.key === 'w') {
    elevation = Math.min(elevation + 1, 45); // max 45 stopni
  } else if (e.key === 's') {
    elevation = Math.max(elevation - 1, 0); // min 0 stopni
  }

  barrelInner.rotation.z = -THREE.MathUtils.degToRad(elevation); // ruch po osi Z
  barrelOuter.rotation.z = -THREE.MathUtils.degToRad(elevation);
});

//naprawa lufy
document.addEventListener('keydown', (e) => {
  if (e.key === 'r') {
    barrelWear = 0;
    hideRepairWarning(); //ukrycie komunikatu o wymaganej naprawie
  }
});

//kouminkat o wymaganej naprawie
const repairWarning = document.getElementById('repair-warning');

function showRepairWarning() {
  repairWarning.style.display = 'block';
}

function hideRepairWarning() {
  repairWarning.style.display = 'none';
}


//obsługa strzału
const shells = [];
const gravity = new THREE.Vector3(0, -9.81, 0); // lub -Z, zależnie od sceny
const shellSpeed = 40;

document.addEventListener('keydown', (e) => {
  if (e.key === ' ') { // SPACJA = STRZAŁ
    const now = performance.now();

    if (barrelWear >= maxBarrelWear) {
      reloadStatus.textContent = 'BARREL WORN';
      showRepairWarning();
      return;
    };

    if (now - lastShotTime < shotCooldown) return; // cooldown

    lastShotTime = now; // aktualizacja czasu ostatniego strzału
    hideRepairWarning();

    const shell = createShell();
    const { start, direction } = getShellSpawn(barrelOuter);

    // Zużyj lufę
    barrelWear = Math.min(barrelWear + wearPerShot, maxBarrelWear);

    // Oblicz moc pocisku (mniejsza przy zużyciu)
    const wearFactor = 1 - (barrelWear / maxBarrelWear) * (1 - minShellPower);

    shell.position.copy(start);
    scene.add(shell);

    shells.push({
      mesh: shell,
      velocity: direction.multiplyScalar(shellSpeed * wearFactor),
    });

    // dźwięk wystrzału
    const shotSound = new THREE.PositionalAudio(listener);
    shotSound.setBuffer(shotSoundBuffer.buffer);
    shotSound.setRefDistance(5);
    shotSound.setVolume(0.3);
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
  const start = new THREE.Vector3();
  const direction = new THREE.Vector3();

  // Pozycja globalna końcówki lufy
  const localOffset = new THREE.Vector3(0, -1.4, 1.55); // -Z w lokalnym układzie lufy
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


function animateRecoil(barrel, amount = 0.2, duration = 0.2) {
  const recoilAxis = new THREE.Vector3(-0.5, -2, 0);
  recoilAxis.applyQuaternion(barrel.quaternion); // przekształć do świata

  const start = 0;
  const end = amount;
  const startTime = performance.now();

  function animate() {
    const elapsed = (performance.now() - startTime) / 1000;
    const t = Math.min(elapsed / duration, 1);
    const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic

    const offset = recoilAxis.clone().multiplyScalar((1 - eased) * amount);

    barrel.position.copy(initialBarrelPosition.clone().add(offset));

    if (t < 1) {
      requestAnimationFrame(animate);
    } else {
      barrel.position.copy(initialBarrelPosition); // reset
    }
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

  // Dźwięk wybuchu
  const explosionSound = new THREE.PositionalAudio(listener);
  explosionSound.setBuffer(explosionSoundBuffer.buffer);
  explosionSound.setRefDistance(10);
  explosionSound.setVolume(1);
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

  // Aktualizacja HUD lufy
  barrelWearBar.style.width = `${barrelWear}%`;
  barrelWearStatus.textContent = `${Math.round(barrelWear)}%`;


  renderer.render(scene, camera);
}
animate();

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
