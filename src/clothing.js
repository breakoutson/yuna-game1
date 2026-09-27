import * as THREE from 'three';

// 새 옷을 추가할 때는 이 설정 객체에 항목만 추가하면 된다.
// - 하의류(legwear): leftHip / rightHip 에 부착 → 다리와 함께 접힘
// - 치마/원피스류(skirt, dress): hips 에만 부착 → 허리 기준으로 통째로 움직임
// - strideScale: 옷이 보폭을 제한하는 정도 (1 = 정상, 치마는 좁게)
export const CLOTHING_ITEMS = {
  shorts: {
    label: '반바지',
    category: 'bottom',
    shape: 'legwear',
    length: 'short',
    attachTo: ['leftHip', 'rightHip'],
    strideScale: 1.0,
    color: 0x2f6690,
  },
  pants: {
    label: '긴바지',
    category: 'bottom',
    shape: 'legwear',
    length: 'long',
    attachTo: ['leftHip', 'rightHip'],
    strideScale: 0.9,
    color: 0x3d405b,
  },
  skirt: {
    label: '치마',
    category: 'bottom',
    shape: 'skirt',
    attachTo: ['hips'],
    strideScale: 0.42,
    color: 0xd8558f,
  },
  dress: {
    label: '원피스',
    category: 'bottom',
    shape: 'dress',
    attachTo: ['hips'],
    strideScale: 0.5,
    color: 0x9b5de5,
  },

  // 헤어도 같은 방식(관절 자식 + visible 토글)으로 관리한다.
  shortHair: {
    label: '짧은 머리',
    category: 'hair',
    shape: 'shortHair',
    attachTo: ['head'],
    color: 0x4a2f22,
  },
  longHair: {
    label: '긴 머리',
    category: 'hair',
    shape: 'longHair',
    attachTo: ['head'],
    color: 0x7a4a2a,
  },
};

export const CATEGORY_LABELS = { bottom: '하의', hair: '헤어' };

export const ATTACH_RULES = {
  legwear: ['leftHip', 'rightHip'],
  skirt: ['hips'],
  dress: ['hips'],
  shortHair: ['head'],
  longHair: ['head'],
};

function mat(color, side = THREE.FrontSide) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.8, side });
}

function mesh(geometry, material, x, y, z) {
  const m = new THREE.Mesh(geometry, material);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

// 각 빌더는 관절 하나에 붙일 메쉬 목록을 [{ joint, mesh }] 형태로 돌려준다.
// joint 는 attachTo 로 지정된 관절 자신이거나, 그 관절의 하위 관절이어야 한다.
const BUILDERS = {
  legwear(item, hipJoint) {
    const m = mat(item.color);
    const parts = [];
    const bottom = item.length === 'long' ? -0.46 : -0.28;
    const top = 0.15;
    parts.push({
      joint: hipJoint,
      mesh: mesh(new THREE.BoxGeometry(0.27, top - bottom, 0.32), m, 0, (top + bottom) / 2, 0),
    });
    if (item.length === 'long') {
      // 정강이 부분은 해당 다리의 무릎 관절에 붙여야 무릎과 함께 접힌다.
      parts.push({
        joint: hipJoint.userData.knee,
        mesh: mesh(new THREE.BoxGeometry(0.21, 0.38, 0.21), m, 0, -0.19, 0),
      });
    }
    return parts;
  },

  skirt(item, hips) {
    const skirt = mesh(
      new THREE.CylinderGeometry(0.3, 0.47, 0.42, 28, 1, true),
      mat(item.color, THREE.DoubleSide),
      0, -0.1, 0,
    );
    const band = mesh(new THREE.CylinderGeometry(0.305, 0.305, 0.06, 28), mat(0xffffff), 0, 0.1, 0);
    return [{ joint: hips, mesh: skirt }, { joint: hips, mesh: band }];
  },

  dress(item, hips) {
    const m = mat(item.color, THREE.DoubleSide);
    const bodice = mesh(new THREE.BoxGeometry(0.58, 0.54, 0.35), m, 0, 0.39, 0);
    const skirt = mesh(new THREE.CylinderGeometry(0.31, 0.52, 0.5, 28, 1, true), m, 0, -0.13, 0);
    const bow = mesh(new THREE.SphereGeometry(0.06, 12, 8), mat(0xffd6e8), 0, 0.14, 0.19);
    return [{ joint: hips, mesh: bodice }, { joint: hips, mesh: skirt }, { joint: hips, mesh: bow }];
  },

  // 헤어는 완전한 회전체 금지: 뒤통수 볼륨과 한쪽으로 쏠린 앞머리로 비대칭을 만든다.
  shortHair(item, head) {
    const m = mat(item.color);
    const cap = mesh(new THREE.SphereGeometry(0.32, 24, 12, 0, Math.PI * 2, 0, Math.PI * 0.45), m, 0, 0.32, 0);
    const backVolume = mesh(new THREE.SphereGeometry(0.28, 20, 14), m, 0, 0.34, -0.14);
    backVolume.scale.set(0.95, 0.9, 0.85);
    const sideSwoop = mesh(new THREE.SphereGeometry(0.15, 16, 12), m, 0.22, 0.5, 0.06);
    const fringe = mesh(new THREE.BoxGeometry(0.26, 0.09, 0.08), m, 0.08, 0.46, 0.27);
    fringe.rotation.z = -0.35;
    const tuft = mesh(new THREE.ConeGeometry(0.05, 0.14, 8), m, -0.06, 0.66, -0.04);
    tuft.rotation.z = 0.5;
    return [cap, backVolume, sideSwoop, fringe, tuft].map((mesh) => ({ joint: head, mesh }));
  },

  longHair(item, head) {
    const m = mat(item.color);
    const cap = mesh(new THREE.SphereGeometry(0.325, 24, 12, 0, Math.PI * 2, 0, Math.PI * 0.42), m, 0, 0.32, 0);
    const backFall = mesh(new THREE.BoxGeometry(0.58, 0.78, 0.18), m, 0, 0.11, -0.28);
    const sideLock = mesh(new THREE.BoxGeometry(0.1, 0.46, 0.12), m, -0.28, 0.14, 0.17);
    const fringe = mesh(new THREE.BoxGeometry(0.3, 0.1, 0.08), m, -0.06, 0.45, 0.27);
    fringe.rotation.z = 0.3;
    const ponytail = mesh(new THREE.CapsuleGeometry(0.07, 0.3, 6, 12), m, 0.34, 0.3, -0.14);
    ponytail.rotation.z = 0.25;
    const ribbon = mesh(new THREE.TorusGeometry(0.07, 0.025, 8, 16), mat(0xff7eb6), 0.3, 0.5, -0.14);
    ribbon.rotation.x = Math.PI / 2;
    return [cap, backFall, sideLock, fringe, ponytail, ribbon].map((mesh) => ({ joint: head, mesh }));
  },
};

function assertAttachRule(id, item) {
  const expected = ATTACH_RULES[item.shape];
  if (!expected) throw new Error(`[clothing] ${id}: 알 수 없는 shape "${item.shape}"`);
  const ok = expected.length === item.attachTo.length && expected.every((j) => item.attachTo.includes(j));
  if (!ok) {
    throw new Error(`[clothing] ${id}: ${item.shape} 는 [${expected}] 에 부착해야 함 (현재 [${item.attachTo}])`);
  }
}

// 모든 옷을 한 번만 관절에 부착하고, 이후에는 visible 만 전환한다.
// 옷을 바꿀 때 Object3D.add() 로 재부착하면 원래 관절에서 떨어져 나가므로 절대 다시 add 하지 않는다.
export function createWardrobe(rig, items = CLOTHING_ITEMS) {
  const outfits = {};
  const equipped = {};

  for (const [id, item] of Object.entries(items)) {
    assertAttachRule(id, item);
    const meshes = [];
    for (const jointName of item.attachTo) {
      const joint = rig.joints[jointName];
      if (!joint) throw new Error(`[clothing] ${id}: 관절 "${jointName}" 없음`);
      for (const part of BUILDERS[item.shape](item, joint)) {
        part.mesh.name = `${id}@${part.joint.name}`;
        part.mesh.visible = false;
        part.joint.add(part.mesh);
        meshes.push(part.mesh);
      }
    }
    outfits[id] = { id, item, meshes };
  }

  function equip(id) {
    const target = outfits[id];
    if (!target) throw new Error(`[clothing] 알 수 없는 옷 "${id}"`);
    const { category } = target.item;
    for (const outfit of Object.values(outfits)) {
      if (outfit.item.category !== category) continue;
      const show = outfit === target;
      for (const m of outfit.meshes) m.visible = show;
    }
    equipped[category] = id;
  }

  function getStrideScale() {
    let scale = 1;
    for (const id of Object.values(equipped)) {
      const s = outfits[id].item.strideScale;
      if (s !== undefined) scale = Math.min(scale, s);
    }
    return scale;
  }

  function itemsByCategory() {
    const groups = {};
    for (const outfit of Object.values(outfits)) {
      (groups[outfit.item.category] ??= []).push(outfit);
    }
    return groups;
  }

  return { outfits, equipped, equip, getStrideScale, itemsByCategory };
}
