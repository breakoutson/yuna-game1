import * as THREE from 'three';

const SKY_COLOR = 0xbfe6ff;

function landmark(scene, geometry, color, x, z, y = 0) {
  const m = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color, roughness: 0.8 }));
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  scene.add(m);
  return m;
}

function tree(scene, x, z) {
  landmark(scene, new THREE.CylinderGeometry(0.15, 0.2, 1, 8), 0x8d6346, x, z, 0.5);
  landmark(scene, new THREE.ConeGeometry(0.8, 1.6, 10), 0x5cb85c, x, z, 1.8);
}

export function createScene() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(SKY_COLOR);
  scene.fog = new THREE.Fog(SKY_COLOR, 25, 60);

  scene.add(new THREE.HemisphereLight(0xffffff, 0x8fbf7f, 1.4));

  const sun = new THREE.DirectionalLight(0xffffff, 2.2);
  sun.position.set(6, 12, 8);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const s = sun.shadow.camera;
  s.left = -15;
  s.right = 15;
  s.top = 15;
  s.bottom = -15;
  s.near = 1;
  s.far = 40;
  scene.add(sun);
  scene.add(sun.target);

  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(40, 64),
    new THREE.MeshStandardMaterial({ color: 0x9fd78a, roughness: 1 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const grid = new THREE.GridHelper(40, 40, 0x7fbf6a, 0x8cc97a);
  grid.position.y = 0.005;
  scene.add(grid);

  // 이동과 방향을 눈으로 확인하기 위한 랜드마크
  landmark(scene, new THREE.BoxGeometry(1, 1, 1), 0xff8fab, 0, 6, 0.5);
  landmark(scene, new THREE.BoxGeometry(1, 1, 1), 0x9d8df1, 6, 0, 0.5);
  landmark(scene, new THREE.SphereGeometry(0.6, 20, 14), 0xffd166, -6, 0, 0.6);
  landmark(scene, new THREE.CylinderGeometry(0.5, 0.5, 1.2, 16), 0x4cc9f0, 0, -6, 0.6);
  for (const [x, z] of [[-9, 9], [10, 7], [-11, -6], [8, -10], [3, 13], [-4, -13]]) tree(scene, x, z);

  return { scene, sun };
}
