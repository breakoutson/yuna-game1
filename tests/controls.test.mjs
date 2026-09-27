// 헤드리스 검증: node tests/controls.test.mjs
// 캐릭터 초기 방향 8가지 × 카메라 시점 × 이동 입력 4가지 전수 검사 + 리그/옷 부착 규칙 검사
import * as THREE from 'three';
import { createRig } from '../src/rig.js';
import { createWardrobe, CLOTHING_ITEMS } from '../src/clothing.js';
import {
  ThirdPersonController,
  cameraOffset,
  moveDirectionFromInput,
  yawFromDirection,
  wrapAngle,
} from '../src/controls.js';

const DEG = Math.PI / 180;
const failures = [];
let checks = 0;

function check(ok, message) {
  checks++;
  if (!ok) failures.push(message);
  return ok;
}

// ---------------------------------------------------------------------------
// 1. 이동 방향 전수 검사
// ---------------------------------------------------------------------------

const CHARACTER_YAWS = Array.from({ length: 8 }, (_, i) => i * 45 * DEG);

// rel: 캐릭터 기준 상대 시점, abs: 캐릭터와 무관한 자유 시점
const VIEWS = [
  { name: '정면', rel: 0, pitch: 0.35 },
  { name: '후면', rel: Math.PI, pitch: 0.35 },
  { name: '좌측', rel: Math.PI / 2, pitch: 0.35 },
  { name: '우측', rel: -Math.PI / 2, pitch: 0.35 },
  { name: '자유1(낮은 시점)', abs: 0.7, pitch: 0.08 },
  { name: '자유2(비스듬히)', abs: -2.3, pitch: 0.9 },
  { name: '자유3(거의 탑뷰)', abs: 3.9, pitch: 1.3 },
];

// screen: 화면 NDC 에서 기대하는 이동 방향 (x 오른쪽 +, y 위 +)
const INPUTS = [
  { name: '상', keys: ['KeyW', 'ArrowUp'], input: { x: 0, z: 1 }, screen: [0, 1] },
  { name: '하', keys: ['KeyS', 'ArrowDown'], input: { x: 0, z: -1 }, screen: [0, -1] },
  { name: '좌', keys: ['KeyA', 'ArrowLeft'], input: { x: -1, z: 0 }, screen: [-1, 0] },
  { name: '우', keys: ['KeyD', 'ArrowRight'], input: { x: 1, z: 0 }, screen: [1, 0] },
];

function project(point, cam) {
  return point.clone().project(cam);
}

const summary = {};

for (const charYaw of CHARACTER_YAWS) {
  for (const view of VIEWS) {
    for (const input of INPUTS) {
      for (const key of input.keys) {
        const label = `캐릭터 ${Math.round(charYaw / DEG)}° / ${view.name} / ${input.name}(${key})`;
        const rig = createRig();
        const character = rig.root;
        character.position.set(2.5, character.position.y, -1.5);
        character.rotation.y = charYaw;

        const camera = new THREE.PerspectiveCamera(55, 16 / 9, 0.1, 200);
        const cameraYaw = wrapAngle(view.abs ?? charYaw + view.rel);
        const controller = new ThirdPersonController({
          camera,
          character,
          cameraYaw,
          cameraPitch: view.pitch,
        });

        // 키를 누른 순간의 화면(카메라) 스냅샷
        camera.updateMatrixWorld();
        const viewCam = camera.clone();
        viewCam.updateMatrixWorld();
        const camDirBefore = camera.getWorldDirection(new THREE.Vector3());

        const start = character.position.clone();
        controller.pressed.add(key);
        controller.update(1 / 30);
        const end = character.position.clone();

        const a = project(start, viewCam);
        const b = project(end, viewCam);
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const len = Math.hypot(dx, dy);
        const [ex, ey] = input.screen;
        const cos = len > 0 ? (dx * ex + dy * ey) / len : -1;

        let ok = check(
          cos > Math.cos(1 * DEG),
          `${label}: 화면 이동 (${dx.toFixed(4)}, ${dy.toFixed(4)}) 이 기대 방향 (${ex}, ${ey}) 과 다름`,
        );

        // 캐릭터의 초기 방향과 무관하게, 이동 벡터는 카메라 기준 계산값과 같아야 함
        const expectedDir = moveDirectionFromInput(cameraYaw, input.input.x, input.input.z);
        const actualDir = end.clone().sub(start).normalize();
        ok &= check(
          actualDir.distanceTo(expectedDir) < 1e-9,
          `${label}: 월드 이동 방향이 카메라 기준 계산과 다름`,
        );

        // 계속 누르고 있으면 캐릭터는 이동 방향으로 자동 회전
        for (let i = 0; i < 60; i++) controller.update(1 / 60);
        const facingError = Math.abs(wrapAngle(character.rotation.y - yawFromDirection(expectedDir)));
        ok &= check(facingError < 1 * DEG, `${label}: 캐릭터가 이동 방향을 보지 않음 (오차 ${(facingError / DEG).toFixed(2)}°)`);

        // 캐릭터가 도는 동안 카메라 방향은 그대로여야 함 (위치만 추적)
        const camDirAfter = camera.getWorldDirection(new THREE.Vector3());
        ok &= check(controller.cameraYaw === cameraYaw, `${label}: 캐릭터 회전 때문에 cameraYaw 가 바뀜`);
        ok &= check(camDirAfter.distanceTo(camDirBefore) < 1e-9, `${label}: 카메라 바라보는 방향이 바뀜`);
        const expectedCamPos = controller
          .getTarget(new THREE.Vector3())
          .add(cameraOffset(cameraYaw, view.pitch, controller.distance));
        ok &= check(camera.position.distanceTo(expectedCamPos) < 1e-9, `${label}: 카메라가 캐릭터 위치를 추적하지 않음`);

        const row = (summary[view.name] ??= { pass: 0, total: 0 });
        row.total++;
        if (ok) row.pass++;
      }
    }
  }
}

// ---------------------------------------------------------------------------
// 2. 카메라 궤도 회전 후에도 이동이 화면 기준인지 (드래그 시뮬레이션)
// ---------------------------------------------------------------------------
{
  const rig = createRig();
  const camera = new THREE.PerspectiveCamera(55, 16 / 9, 0.1, 200);
  const controller = new ThirdPersonController({ camera, character: rig.root });
  let orbitOk = true;
  for (let step = 0; step < 24; step++) {
    controller.orbit(137, step % 2 ? 25 : -25);
    controller.updateCamera();
    camera.updateMatrixWorld();
    const viewCam = camera.clone();
    viewCam.updateMatrixWorld();
    const start = rig.root.position.clone();
    controller.pressed.clear();
    controller.pressed.add('KeyW');
    controller.update(1 / 30);
    const a = project(start, viewCam);
    const b = project(rig.root.position, viewCam);
    orbitOk &= check(b.y - a.y > 0 && Math.abs(b.x - a.x) < 1e-9, `궤도 회전 ${step}단계 후 W 가 화면 위쪽이 아님`);
  }
  summary['드래그 궤도 24단계'] = { pass: orbitOk ? 24 : 0, total: 24 };
}

// ---------------------------------------------------------------------------
// 3. 리그 계층 / 옷 부착 규칙 / 얼굴·헤어 비대칭
// ---------------------------------------------------------------------------
{
  const failuresBefore = failures.length;
  const rig = createRig();
  const j = rig.joints;
  const expectedParent = {
    torso: 'hips', head: 'torso',
    leftShoulder: 'hips', leftElbow: 'leftShoulder',
    rightShoulder: 'hips', rightElbow: 'rightShoulder',
    leftHip: 'hips', leftKnee: 'leftHip',
    rightHip: 'hips', rightKnee: 'rightHip',
  };
  for (const [name, parent] of Object.entries(expectedParent)) {
    check(j[name].parent === j[parent], `리그: ${name} 의 부모가 ${parent} 가 아님`);
  }
  check(j.hips.parent === null, '리그: hips 가 루트가 아님');

  const wardrobe = createWardrobe(rig);
  const originalParents = new Map();
  for (const { id, item, meshes } of Object.values(wardrobe.outfits)) {
    for (const m of meshes) {
      originalParents.set(m, m.parent);
      const allowed = item.attachTo.flatMap((n) => [j[n], ...j[n].children.filter((c) => c.isGroup)]);
      check(allowed.includes(m.parent), `옷: ${id} 메쉬가 지정 관절(${item.attachTo}) 밖에 붙음 (${m.parent?.name})`);
      if (item.category === 'bottom' && item.shape !== 'legwear') {
        check(m.parent === j.hips, `옷: ${id} 는 hips 에만 붙어야 함`);
      }
      if (item.shape === 'legwear') {
        check(m.parent !== j.hips, `옷: ${id} 가 hips 에 붙음 (다리와 함께 접히지 않음)`);
      }
    }
  }

  // 여러 번 갈아입혀도 부모 관절이 그대로이고, 카테고리당 한 벌만 보이는지
  const ids = Object.keys(CLOTHING_ITEMS);
  for (let round = 0; round < 3; round++) {
    for (const id of ids) {
      wardrobe.equip(id);
      const { category } = CLOTHING_ITEMS[id];
      const visibleIds = Object.values(wardrobe.outfits)
        .filter((o) => o.item.category === category && o.meshes.every((m) => m.visible))
        .map((o) => o.id);
      check(visibleIds.length === 1 && visibleIds[0] === id, `옷: ${id} 착용 후 보이는 옷 ${visibleIds}`);
    }
  }
  for (const [m, parent] of originalParents) {
    check(m.parent === parent, `옷: ${m.name} 이 갈아입기 후 원래 관절에서 떨어짐`);
  }

  wardrobe.equip('shorts');
  const shortsStride = wardrobe.getStrideScale();
  wardrobe.equip('skirt');
  const skirtStride = wardrobe.getStrideScale();
  check(skirtStride < shortsStride, `옷: 치마 보폭(${skirtStride}) 이 반바지(${shortsStride}) 보다 좁지 않음`);

  // 코는 정면(+Z)에만, 귀는 좌우 측면에만
  const nose = j.head.getObjectByName('nose');
  const leftEar = j.head.getObjectByName('leftEar');
  const rightEar = j.head.getObjectByName('rightEar');
  check(nose.position.z > 0.25 && Math.abs(nose.position.x) < 1e-9, '얼굴: 코가 정면 중앙에 없음');
  check(leftEar.position.x > 0.25 && rightEar.position.x < -0.25, '얼굴: 귀가 좌우 측면에 없음');
  check(Math.abs(leftEar.position.z) < 0.05 && Math.abs(rightEar.position.z) < 0.05, '얼굴: 귀가 앞/뒤로 치우침');

  // 헤어는 앞뒤·좌우 모두 비대칭이어야 함 (머리 로컬 좌표 바운딩 박스로 판정)
  j.hips.updateMatrixWorld(true);
  const headInv = j.head.matrixWorld.clone().invert();
  for (const hairId of ['shortHair', 'longHair']) {
    const bbox = new THREE.Box3();
    for (const m of wardrobe.outfits[hairId].meshes) {
      m.geometry.computeBoundingBox();
      bbox.union(m.geometry.boundingBox.clone().applyMatrix4(m.matrixWorld).applyMatrix4(headInv));
    }
    const frontBack = Math.abs(bbox.max.z + bbox.min.z);
    const leftRight = Math.abs(bbox.max.x + bbox.min.x);
    check(frontBack > 0.02, `헤어: ${hairId} 가 앞뒤 대칭 (차이 ${frontBack.toFixed(3)})`);
    check(leftRight > 0.02, `헤어: ${hairId} 가 좌우 대칭 (차이 ${leftRight.toFixed(3)})`);
  }
  summary['리그/옷/얼굴 규칙'] = { pass: failures.length === failuresBefore ? 1 : 0, total: 1 };
}

// ---------------------------------------------------------------------------
console.log('\n이동 방향 검증 (캐릭터 방향 8 × 시점 7 × 입력 4 × 키 2종[WASD/화살표])\n');
const rows = Object.entries(summary).map(([name, { pass, total }]) => ({
  시점: name,
  통과: `${pass}/${total}`,
  결과: pass === total ? 'OK' : 'FAIL',
}));
console.table(rows);
console.log(`\n총 검사 항목: ${checks}개, 실패: ${failures.length}개`);

if (failures.length) {
  console.log('\n실패 목록 (최대 30개):');
  for (const f of failures.slice(0, 30)) console.log(' - ' + f);
  process.exit(1);
}
console.log('모든 검증 통과 ✅');
