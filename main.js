import * as THREE from './libs/three.module.js';
import { GLTFLoader } from './libs/GLTFLoader.js'
import { OrbitControls } from './libs/OrbitControls.js'

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xaaaaaa);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth/window.innerHeight, 0.1, 1000);
camera.position.set(5, 3, 8);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

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
let barrelIn; // dolna część lufy
let barrelOut // górna końcowa część lufy
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
    
    barrelIn = meshList[6]; //przypisujemy dolną część lufy
    barrelOut = meshList[7]; //przypisujemy końcówkę lufy
  },
  undefined,
  (error) => {
    console.error('Błąd ładowania modelu:', error);
  }
);


//sterowanie lufą
let elevation = 0;

document.addEventListener('keydown', (e) => {
  if (!barrelIn || !barrelOut) return;

  if (e.key === 'w') {
    elevation = Math.min(elevation + 1, 45); // max 45 stopni
  } else if (e.key === 's') {
    elevation = Math.max(elevation - 1, 0); // min 0 stopni
  }

  barrelIn.rotation.z = -THREE.MathUtils.degToRad(elevation); // ruch po osi Z
  barrelOut.rotation.z = -THREE.MathUtils.degToRad(elevation);
});





function animate() {
  requestAnimationFrame(animate);
  renderer.render(scene, camera);
}
animate();

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth/window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
