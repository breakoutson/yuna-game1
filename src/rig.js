import * as THREE from 'three';

// 좌표 규약: 캐릭터 정면은 로컬 +Z, 위는 +Y.
// 따라서 캐릭터의 "왼쪽"은 로컬 +X, "오른쪽"은 로컬 -X.
//
// hips (루트, 캐릭터 위치/이동 기준)
// ├─ torso
// │  └─ head (eyes, nose, ears, mouth / 헤어는 clothing.js가 부착)
// ├─ leftShoulder  → leftElbow
// ├─ rightShoulder → rightElbow
// ├─ leftHip       → leftKnee
// └─ rightHip      → rightKnee

export const HIP_HEIGHT = 0.98;

export const SKIN_COLOR = 0xf6d2b8;
const SHIRT_COLOR = 0xfff3c4;
const PELVIS_COLOR = 0xe8e8ef;
const SHOE_COLOR = 0x5b4a6b;

function mat(color) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.75 });
}

function box(w, h, d, color) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color));
  mesh.castShadow = true;
  return mesh;
}

function sphere(r, color) {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(r, 24, 16), mat(color));
  mesh.castShadow = true;
  return mesh;
}

function joint(name, parent, x, y, z) {
  const g = new THREE.Group();
  g.name = name;
  g.position.set(x, y, z);
  parent.add(g);
  return g;
}

function addPart(parent, mesh, x, y, z) {
  mesh.position.set(x, y, z);
  parent.add(mesh);
  return mesh;
}

function buildFace(head) {
  const headMesh = addPart(head, sphere(0.3, SKIN_COLOR), 0, 0.3, 0);
  headMesh.name = 'headMesh';

  for (const side of [1, -1]) {
    addPart(head, sphere(0.04, 0x2b2233), side * 0.1, 0.33, 0.265).name = 'eye';

    // 귀: 좌우 측면에만 (옆모습 구분)
    const ear = addPart(head, sphere(0.07, SKIN_COLOR), side * 0.3, 0.3, 0);
    ear.scale.set(0.5, 1, 0.8);
    ear.name = side > 0 ? 'leftEar' : 'rightEar';
  }

  // 코: 정면(+Z)에만 튀어나옴 (앞/뒤 구분)
  const nose = addPart(head, box(0.06, 0.07, 0.09, 0xeab89c), 0, 0.26, 0.31);
  nose.name = 'nose';

  addPart(head, box(0.1, 0.025, 0.02, 0xd46a7e), 0, 0.17, 0.27).name = 'mouth';
}

function buildArm(hips, side, prefix) {
  const shoulder = joint(`${prefix}Shoulder`, hips, side * 0.36, 0.64, 0);
  addPart(shoulder, box(0.15, 0.32, 0.15, SHIRT_COLOR), 0, -0.14, 0);

  const elbow = joint(`${prefix}Elbow`, shoulder, 0, -0.3, 0);
  addPart(elbow, box(0.13, 0.28, 0.13, SKIN_COLOR), 0, -0.14, 0);
  addPart(elbow, sphere(0.08, SKIN_COLOR), 0, -0.3, 0);

  return { shoulder, elbow };
}

function buildLeg(hips, side, prefix) {
  const hip = joint(`${prefix}Hip`, hips, side * 0.13, -0.06, 0);
  addPart(hip, box(0.18, 0.44, 0.18, SKIN_COLOR), 0, -0.22, 0);

  const knee = joint(`${prefix}Knee`, hip, 0, -0.44, 0);
  addPart(knee, box(0.17, 0.4, 0.17, SKIN_COLOR), 0, -0.2, 0);
  // 발은 앞쪽(+Z)으로 더 길게: 방향 구분 보조
  addPart(knee, box(0.19, 0.08, 0.28, SHOE_COLOR), 0, -0.44, 0.04);

  hip.userData.knee = knee;
  return { hip, knee };
}

export function createRig() {
  const hips = new THREE.Group();
  hips.name = 'hips';
  hips.position.y = HIP_HEIGHT;
  addPart(hips, box(0.5, 0.22, 0.3, PELVIS_COLOR), 0, -0.03, 0);

  const torso = joint('torso', hips, 0, 0.08, 0);
  addPart(torso, box(0.55, 0.6, 0.32, SHIRT_COLOR), 0, 0.3, 0);

  const head = joint('head', torso, 0, 0.62, 0);
  buildFace(head);

  const leftArm = buildArm(hips, 1, 'left');
  const rightArm = buildArm(hips, -1, 'right');
  const leftLeg = buildLeg(hips, 1, 'left');
  const rightLeg = buildLeg(hips, -1, 'right');

  const joints = {
    hips,
    torso,
    head,
    leftShoulder: leftArm.shoulder,
    leftElbow: leftArm.elbow,
    rightShoulder: rightArm.shoulder,
    rightElbow: rightArm.elbow,
    leftHip: leftLeg.hip,
    leftKnee: leftLeg.knee,
    rightHip: rightLeg.hip,
    rightKnee: rightLeg.knee,
  };

  return { root: hips, joints };
}

// X축 양(+)의 회전 = 다리/팔이 뒤(-Z)로 감.
// amount: 0(정지)~1(걷기), strideScale: 옷이 허용하는 보폭 비율.
export function applyWalkPose(rig, phase, amount, strideScale = 1) {
  const j = rig.joints;
  const s = Math.sin(phase);
  const legSwing = 0.6 * strideScale * amount * s;

  j.leftHip.rotation.x = -legSwing;
  j.rightHip.rotation.x = legSwing;

  const kneeBend = 0.7 * strideScale * amount;
  j.leftKnee.rotation.x = kneeBend * Math.max(0, -Math.cos(phase));
  j.rightKnee.rotation.x = kneeBend * Math.max(0, Math.cos(phase));

  const armSwing = 0.7 * amount * s;
  j.leftShoulder.rotation.x = armSwing;
  j.rightShoulder.rotation.x = -armSwing;
  j.leftElbow.rotation.x = -0.25 * amount;
  j.rightElbow.rotation.x = -0.25 * amount;

  j.hips.position.y = HIP_HEIGHT + 0.03 * amount * Math.abs(Math.cos(phase));
}
