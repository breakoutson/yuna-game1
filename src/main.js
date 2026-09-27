import './style.css';
import * as THREE from 'three';
import { createScene } from './scene.js';
import { createRig, applyWalkPose } from './rig.js';
import { createWardrobe, CATEGORY_LABELS } from './clothing.js';
import { ThirdPersonController } from './controls.js';

const app = document.querySelector('#app');

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
app.appendChild(renderer.domElement);

const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 200);
const { scene, sun } = createScene();

const rig = createRig();
scene.add(rig.root);

const wardrobe = createWardrobe(rig);
wardrobe.equip('skirt');
wardrobe.equip('longHair');

const controller = new ThirdPersonController({
  camera,
  character: rig.root,
  domElement: renderer.domElement,
  getSpeedScale: () => 0.5 + 0.5 * wardrobe.getStrideScale(),
});

function buildPanel() {
  const panel = document.createElement('div');
  panel.className = 'panel';
  panel.innerHTML = '<h1>유나의 옷장</h1>';

  for (const [category, outfits] of Object.entries(wardrobe.itemsByCategory())) {
    const section = document.createElement('section');
    section.innerHTML = `<h2>${CATEGORY_LABELS[category] ?? category}</h2>`;
    const row = document.createElement('div');
    row.className = 'row';
    for (const { id, item } of outfits) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = item.label;
      btn.dataset.id = id;
      btn.style.setProperty('--swatch', `#${item.color.toString(16).padStart(6, '0')}`);
      btn.addEventListener('click', () => {
        wardrobe.equip(id);
        refresh();
        btn.blur();
      });
      row.appendChild(btn);
    }
    section.appendChild(row);
    panel.appendChild(section);
  }

  const help = document.createElement('p');
  help.className = 'help';
  help.innerHTML = '이동: WASD / 화살표 · 카메라: 드래그 · 줌: 휠 / 핀치';
  panel.appendChild(help);

  function refresh() {
    const active = new Set(Object.values(wardrobe.equipped));
    for (const btn of panel.querySelectorAll('button')) {
      btn.classList.toggle('active', active.has(btn.dataset.id));
    }
  }
  refresh();
  document.body.appendChild(panel);
}
buildPanel();

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

const timer = new THREE.Timer();
timer.connect(document);
let walkPhase = 0;
let walkAmount = 0;

renderer.setAnimationLoop((time) => {
  timer.update(time);
  const dt = Math.min(timer.getDelta(), 0.05);
  controller.update(dt);

  const stride = wardrobe.getStrideScale();
  walkAmount = THREE.MathUtils.damp(walkAmount, controller.moving ? 1 : 0, 10, dt);
  if (walkAmount > 0.01) walkPhase += dt * 9;
  applyWalkPose(rig, walkPhase, walkAmount, stride);

  sun.position.set(rig.root.position.x + 6, 12, rig.root.position.z + 8);
  sun.target.position.copy(rig.root.position);

  renderer.render(scene, camera);
});

// 개발 중 콘솔 디버깅용
if (import.meta.env.DEV) window.__game = { rig, wardrobe, controller, camera, scene };
