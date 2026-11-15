// ---------- utils ----------
const $ = id => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const wrap = a => ((a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
const money = n => '$' + Math.round(n).toLocaleString('en-US');
const hyp = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

let seed = 7;
const R = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const LOW = /iPhone|Android/.test(navigator.userAgent) || (navigator.deviceMemory && navigator.deviceMemory <= 4);
const HEX = c => [(c >> 16 & 255) / 255, (c >> 8 & 255) / 255, (c & 255) / 255];
const KEY = 'dispatchRP.v8';

// ---------- layout & world setup ----------
const NS = 9, NB = 8, MAP = 530, HWX = 440;
const WID = { primary: 24, secondary: 15, residential: 10, highway: 26, ramp: 12 };
const RANK = { residential: 1, ramp: 2, secondary: 3, primary: 4, highway: 5 };
const LIM = { residential: 30, secondary: 50, primary: 70, highway: 100, ramp: 50 };
const yOf = t => .05 * RANK[t];
const axis = () => { const a = [0]; for (let i = 1; i < NS; i++) a.push(a[i - 1] + 64 + R() * 30); const m = a[NS - 1] / 2; return a.map(v => v - m); };
const xs = axis(), zs = axis();
const TY = i => i % 4 === 0 ? 'primary' : i % 2 === 0 ? 'secondary' : 'residential';
const cT = xs.map((_, i) => TY(i)), rT = zs.map((_, i) => TY(i));
const bx0 = [], bx1 = [], bz0 = [], bz1 = [];
for (let i = 0; i < NB; i++) {
    bx0[i] = xs[i] + WID[cT[i]] / 2 + 1.5;
    bx1[i] = xs[i + 1] - WID[cT[i + 1]] / 2 - 1.5;
    bz0[i] = zs[i] + WID[rT[i]] / 2 + 1.5;
    bz1[i] = zs[i + 1] - WID[rT[i + 1]] / 2 - 1.5;
}
const H = (x, z) => smooth(540, 780, Math.max(Math.abs(x), Math.abs(z))) * (16 + 6 * Math.sin(x * .012 + z * .017));
const GY = (x, z) => H(x, z) + .2;

const VEH = {
    engine: { name: 'Fire Engine', job: 'fire', lvl: 1, cost: 0, acc: 14, turn: 1.5, brk: 35, max: 24, blurb: 'Pumper truck.' },
    patrol: { name: 'Patrol Car', job: 'police', lvl: 1, cost: 0, acc: 18, turn: 2.1, brk: 40, max: 30, blurb: 'Standard patrol unit.' },
    ambulance: { name: 'Ambulance', job: 'ems', lvl: 1, cost: 0, acc: 15, turn: 1.8, brk: 35, max: 27, blurb: 'Transport and treatment unit.' },
    sedan: { name: 'Sedan', personal: 1, cost: 6000, acc: 16, turn: 1.9, brk: 35, max: 28, blurb: 'Comfortable family sedan.' }
};

const SPEC = {
    engine: { len: 6.2, wid: 2.5, bh: 1.5, cl: 2.1, ch: .9, cz: -1.9, body: 0xc8392c, st: 0xf4f4f4 },
    patrol: { len: 4.8, wid: 2.1, bh: .9, cl: 2, ch: .7, cz: -.2, body: 0xf1f1f1, st: 0x14161c },
    ambulance: { len: 6, wid: 2.4, bh: 1.9, cl: 1.6, ch: .8, cz: -2, body: 0xf4f4f4, st: 0xef8a24 },
    sedan: { len: 4.7, wid: 2, bh: .85, cl: 2.2, ch: .75, cz: -.3, body: 0x3f6fb5 }
};

// ---------- Three.js Core Initialization ----------
let scene, camera, renderer;
let playerCar = {
    x: 0, z: 0, rot: 0, speed: 0, maxSpeed: 28, 
    accel: 15, brake: 35, friction: 6, steer: 0, type: 'patrol'
};
let keys = { w: false, s: false, a: false, d: false, space: false };

function init() {
    const canvas = $('gl');
    renderer = new THREE.WebGLRenderer({ canvas, antialias: !LOW, powerPreference: "high-performance" });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xcfe2f1);
    scene.fog = new THREE.FogExp2(0xcfe2f1, 0.003);

    camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);

    // Basic directional lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(100, 200, 100);
    scene.add(dirLight);

    // Simple Ground Plane
    const groundGeo = new THREE.PlaneGeometry(2000, 2000);
    const groundMat = new THREE.MeshLambertMaterial({ color: 0x3b7a57 });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.1;
    scene.add(ground);

    // Simple Player Box Mesh representation for testing physics
    const spec = SPEC.patrol;
    const carGeo = new THREE.BoxGeometry(spec.wid, spec.bh, spec.len);
    const carMat = new THREE.MeshLambertMaterial({ color: spec.body });
    playerCar.mesh = new THREE.Mesh(carGeo, carMat);
    scene.add(playerCar.mesh);

    // Event Listeners for Controls
    window.addEventListener('resize', onWindowResize);
    window.addEventListener('keydown', e => handleKey(e, true));
    window.addEventListener('keyup', e => handleKey(e, false));

    // UI Bindings
    $('bPlay').onclick = () => {
        $('title').classList.add('hide');
        $('hud').classList.remove('hide');
        document.body.classList.add('drv');
    };

    lastTime = performance.now();
    requestAnimationFrame(loop);
}

function handleKey(e, isDown) {
    switch (e.key.toLowerCase()) {
        case 'w': case 'arrowup': keys.w = isDown; break;
        case 's': case 'arrowdown': keys.s = isDown; break;
        case 'a': case 'arrowleft': keys.a = isDown; break;
        case 'd': case 'arrowright': keys.d = isDown; break;
        case ' ': keys.space = isDown; break;
    }
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// ---------- FIXED CAR PHYSICS ENGINE ----------
let lastTime = 0;
function updatePhysics(dt) {
    const v = playerCar;
    const stats = VEH[v.type];

    // 1. Throttle / Acceleration & Reversing
    let throttle = 0;
    if (keys.w) throttle += 1;
    if (keys.s) throttle -= 1;

    if (throttle !== 0) {
        v.speed += throttle * stats.acc * dt;
    } else {
        // Natural rolling friction / deceleration when no key is pressed
        if (v.speed > 0) {
            v.speed = Math.max(0, v.speed - v.friction * dt);
        } else if (v.speed < 0) {
            v.speed = Math.min(0, v.speed + v.friction * dt);
        }
    }

    // Handbrake / Footbrake
    if (keys.space) {
        v.speed += (v.speed > 0 ? -1 : 1) * stats.brk * dt;
        if (Math.abs(v.speed) < 0.2) v.speed = 0;
    }

    // Clamp speed limits
    v.speed = clamp(v.speed, -stats.max * 0.4, stats.max);

    // 2. Responsive Steering (Speed-dependent turning radius)
    let steeringInput = 0;
    if (keys.a) steeringInput += 1;
    if (keys.d) steeringInput -= 1;

    if (steeringInput !== 0 && Math.abs(v.speed) > 0.5) {
        // Scale turning speed by forward velocity so it doesn't spin wildly while stationary
        let speedFactor = clamp(Math.abs(v.speed) / stats.max, 0.2, 1.0);
        v.rot += steeringInput * stats.turn * speedFactor * dt * (v.speed > 0 ? 1 : -1);
    }

    // 3. Position update with lateral friction damping (Eliminates infinite sliding/drifting bugs)
    v.x += Math.sin(v.rot) * v.speed * dt;
    v.z += Math.cos(v.rot) * v.speed * dt;

    // Update 3D Mesh transforms
    if (v.mesh) {
        v.mesh.position.set(v.x, 0.5, v.z);
        v.mesh.rotation.y = v.rot;
    }

    // Camera follow setup (Third person smooth chase cam)
    const targetCamX = v.x - Math.sin(v.rot) * 10;
    const targetCamZ = v.z - Math.cos(v.rot) * 10;
    camera.position.x += (targetCamX - camera.position.x) * 0.1;
    camera.position.y = 5;
    camera.position.z += (targetCamZ - camera.position.z) * 0.1;
    camera.lookAt(v.x, v.mesh ? v.mesh.position.y : 0, v.z);
}

// ---------- Main Game Loop ----------
function loop(time) {
    const dt = Math.min((time - lastTime) / 1000, 0.1);
    lastTime = time;

    updatePhysics(dt);

    renderer.render(scene, camera);
    requestAnimationFrame(loop);
}

window.onload = init;
