import * as THREE from 'three';

// 로블록스식 3인칭 조작 원칙
// 1. 카메라 방향(cameraYaw/cameraPitch)은 캐릭터 회전과 완전히 독립적이다.
//    카메라는 캐릭터의 "위치"만 따라가고 character.rotation 은 절대 읽지 않는다.
//    (읽으면 캐릭터 자동회전 ↔ 카메라 추적이 되먹임되어 빙글빙글 도는 버그가 생긴다)
// 2. 화면 드래그 = 카메라가 캐릭터 주위를 궤도 회전, 휠/핀치 = 줌.
// 3. 이동키는 항상 현재 카메라(화면) 기준 전/후/좌/우로 계산한다.
// 4. 캐릭터는 이동 방향으로 자동 회전한다 (턴 키 없음).
//
// 각도 규약: yaw 는 +Y 축 기준, yaw=0 이면 +Z 방향. 방향 벡터 = (sin yaw, 0, cos yaw).

export const MOVE_KEYS = {
  forward: ['KeyW', 'ArrowUp'],
  back: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
};

const ALL_MOVE_KEYS = new Set(Object.values(MOVE_KEYS).flat());

// 카메라가 타깃으로부터 떨어진 오프셋. cameraYaw 방향 쪽에 카메라가 위치한다.
export function cameraOffset(yaw, pitch, distance, out = new THREE.Vector3()) {
  const horizontal = Math.cos(pitch) * distance;
  return out.set(Math.sin(yaw) * horizontal, Math.sin(pitch) * distance, Math.cos(yaw) * horizontal);
}

// inputX: 오른쪽 +1 / 왼쪽 -1, inputZ: 앞(화면 안쪽) +1 / 뒤 -1
export function moveDirectionFromInput(cameraYaw, inputX, inputZ, out = new THREE.Vector3()) {
  const fx = -Math.sin(cameraYaw);
  const fz = -Math.cos(cameraYaw);
  const rx = Math.cos(cameraYaw);
  const rz = -Math.sin(cameraYaw);
  out.set(fx * inputZ + rx * inputX, 0, fz * inputZ + rz * inputX);
  if (out.lengthSq() > 0) out.normalize();
  return out;
}

export function yawFromDirection(dir) {
  return Math.atan2(dir.x, dir.z);
}

export function wrapAngle(a) {
  return THREE.MathUtils.euclideanModulo(a + Math.PI, Math.PI * 2) - Math.PI;
}

export function dampAngle(current, target, lambda, dt) {
  const diff = wrapAngle(target - current);
  return wrapAngle(current + diff * (1 - Math.exp(-lambda * dt)));
}

export class ThirdPersonController {
  constructor({
    camera,
    character,
    domElement = null,
    walkSpeed = 3.2,
    getSpeedScale = () => 1,
    cameraYaw = Math.PI,
    cameraPitch = 0.35,
    distance = 6,
  }) {
    this.camera = camera;
    this.character = character;
    this.walkSpeed = walkSpeed;
    this.getSpeedScale = getSpeedScale;

    this.cameraYaw = cameraYaw;
    this.cameraPitch = cameraPitch;
    this.distance = distance;
    this.minPitch = 0.05;
    this.maxPitch = 1.35;
    this.minDistance = 2.5;
    this.maxDistance = 14;
    this.orbitSpeed = 0.006;
    this.turnLambda = 12;
    this.targetOffset = new THREE.Vector3(0, 0.35, 0);

    this.pressed = new Set();
    this.moving = false;
    this.moveDirection = new THREE.Vector3();

    this._target = new THREE.Vector3();
    this._offset = new THREE.Vector3();
    this._pointers = new Map();
    this._pinchDistance = 0;
    this._listeners = [];

    if (domElement) this._bindDom(domElement);
    this.updateCamera();
  }

  getInput() {
    const has = (codes) => codes.some((c) => this.pressed.has(c));
    const x = (has(MOVE_KEYS.right) ? 1 : 0) - (has(MOVE_KEYS.left) ? 1 : 0);
    const z = (has(MOVE_KEYS.forward) ? 1 : 0) - (has(MOVE_KEYS.back) ? 1 : 0);
    return { x, z };
  }

  orbit(dx, dy) {
    this.cameraYaw = wrapAngle(this.cameraYaw - dx * this.orbitSpeed);
    this.cameraPitch = THREE.MathUtils.clamp(
      this.cameraPitch + dy * this.orbitSpeed,
      this.minPitch,
      this.maxPitch,
    );
  }

  zoom(factor) {
    this.distance = THREE.MathUtils.clamp(this.distance * factor, this.minDistance, this.maxDistance);
  }

  update(dt) {
    const { x, z } = this.getInput();
    this.moving = x !== 0 || z !== 0;

    if (this.moving) {
      moveDirectionFromInput(this.cameraYaw, x, z, this.moveDirection);
      const speed = this.walkSpeed * this.getSpeedScale();
      this.character.position.addScaledVector(this.moveDirection, speed * dt);
      const targetYaw = yawFromDirection(this.moveDirection);
      this.character.rotation.y = dampAngle(this.character.rotation.y, targetYaw, this.turnLambda, dt);
    }

    this.updateCamera();
  }

  getTarget(out = this._target) {
    return out.copy(this.character.position).add(this.targetOffset);
  }

  updateCamera() {
    const target = this.getTarget();
    cameraOffset(this.cameraYaw, this.cameraPitch, this.distance, this._offset);
    this.camera.position.copy(target).add(this._offset);
    this.camera.lookAt(target);
  }

  _on(target, type, fn, opts) {
    target.addEventListener(type, fn, opts);
    this._listeners.push(() => target.removeEventListener(type, fn, opts));
  }

  _bindDom(el) {
    const win = el.ownerDocument.defaultView;
    el.style.touchAction = 'none';

    this._on(win, 'keydown', (e) => {
      if (e.target instanceof win.HTMLInputElement) return;
      if (!ALL_MOVE_KEYS.has(e.code)) return;
      this.pressed.add(e.code);
      e.preventDefault();
    });
    this._on(win, 'keyup', (e) => this.pressed.delete(e.code));
    this._on(win, 'blur', () => this.pressed.clear());

    this._on(el, 'contextmenu', (e) => e.preventDefault());

    this._on(el, 'pointerdown', (e) => {
      el.setPointerCapture(e.pointerId);
      this._pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this._pointers.size === 2) this._pinchDistance = this._currentPinchDistance();
    });

    this._on(el, 'pointermove', (e) => {
      const prev = this._pointers.get(e.pointerId);
      if (!prev) return;
      const dx = e.clientX - prev.x;
      const dy = e.clientY - prev.y;
      prev.x = e.clientX;
      prev.y = e.clientY;

      if (this._pointers.size === 1) {
        this.orbit(dx, dy);
      } else if (this._pointers.size === 2) {
        const d = this._currentPinchDistance();
        if (this._pinchDistance > 0 && d > 0) this.zoom(this._pinchDistance / d);
        this._pinchDistance = d;
      }
    });

    const release = (e) => {
      this._pointers.delete(e.pointerId);
      this._pinchDistance = this._pointers.size === 2 ? this._currentPinchDistance() : 0;
    };
    this._on(el, 'pointerup', release);
    this._on(el, 'pointercancel', release);

    this._on(
      el,
      'wheel',
      (e) => {
        e.preventDefault();
        this.zoom(Math.exp(e.deltaY * 0.001));
      },
      { passive: false },
    );
  }

  _currentPinchDistance() {
    const [a, b] = [...this._pointers.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  dispose() {
    for (const off of this._listeners) off();
    this._listeners = [];
  }
}
