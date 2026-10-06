const RICE_HIT_SCALE = 0.9;
const GLOVE_SIZE = 0.168;
const MAX_ON_GROUND = 4;
const SPAWN_EVERY = 0.42;
const RICE_STAY_MIN = 2;
const RICE_STAY_MAX = 3;
const POP_TIME = 0.34;
const BYE_TIME = 0.24;
const FLY_TIME = 0.55;
const MAX_HANDS = 4;
const TIME_CHOICES = [20, 30, 60];
const RANK_KEY = "riceHarvestRanks";
const RANK_KEEP = 20;
const GLOVE_SCALE_KEY = "riceHarvestGloveScale";
const RICE_SCALE_KEY = "riceHarvestRiceScale";

let frameImg;
let riceImg;
let gloveImg;
let basketImg;
let startImg;
let howtoImg;
let titleImg;
let assetError = false;

let video;
let handpose;
let predictions = [];
let modelReady = false;
let startTime = 0;
let roundSeconds = 60;
let phase = "home";
let mode = null;
let gameOver = false;
let endAnim = 0;
let newRecord = false;
let timeButtons = [];
let modeButtons = [];
let endButtons = [];
let homeMenu = [];
let howtoClose = null;
let homeButton = null;

let score = 0;
let score2 = 0;
let scorePop = 0;
let scorePop2 = 0;
let ranks = loadRanks();
let bestScore = ranks.length ? ranks[0].score : 0;
let rankReady = false;
let nameFocused = false;
let rices = [];
let spawnAcc = 0;

let trackedHands = [];
let handEver = false;
let videoGeom = null;
let bgm;
let bgmStarting = false;
let gloveScale = loadScale(GLOVE_SCALE_KEY);
let riceScale = loadScale(RICE_SCALE_KEY);

function preload() {
  frameImg = loadImage("assets/frame.png", () => {}, () => {
    assetError = true;
  });
  riceImg = loadImage("assets/rice.png", () => {}, () => {
    assetError = true;
  });
  gloveImg = loadImage("assets/glove.png", () => {}, () => {
    assetError = true;
  });
  basketImg = loadImage("assets/basket.png", () => {}, () => {
    assetError = true;
  });
  startImg = loadImage("assets/btn_start.png");
  howtoImg = loadImage("assets/btn_howto.png");
  titleImg = loadImage("assets/title.png");
}

function setup() {
  createCanvas(windowWidth, windowHeight);
  pixelDensity(1);
  frameRate(30);
  textFont('Jua, "Malgun Gothic", sans-serif');
  textStyle(BOLD);
  strokeJoin(ROUND);

  if (document.fonts && document.fonts.load) {
    document.fonts.load('bold 72px Jua');
  }

  bgm = new Audio("assets/bgm.mp3");
  bgm.loop = true;
  bgm.preload = "auto";
  setupNameForm();
  setupSizeSliders();

  video = createCapture(
    {
      video: {
        width: 640,
        height: 480,
        facingMode: "user"
      },
      audio: false
    },
    startHandpose
  );
  video.hide();
}

function startHandpose() {
  if (handpose || typeof ml5 === "undefined" || !ml5.handPose) return;

  handpose = ml5.handPose(
    {
      maxHands: MAX_HANDS,
      flipHorizontal: false
    },
    () => {
      handpose.detectStart(video, (results) => {
        predictions = results || [];
      });
      modelReady = true;
    }
  );
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}

function draw() {
  const dt = Math.min(deltaTime || 16, 48) / 1000;
  background(183, 221, 243);

  drawWebcam();
  drawFrame();
  if (mode === "versus") drawSplit();

  if (modelReady && phase !== "done") updateHands();

  if (phase === "play") {
    updateRices(dt);
    if ((millis() - startTime) / 1000 >= roundSeconds) {
      finishGame();
    } else if ((millis() - startTime) / 1000 > 0.35) {
      spawnRice(dt);
    }
  }

  if (gameOver) {
    endAnim = Math.min(1, endAnim + dt / 0.35);
  }
  scorePop = Math.max(0, scorePop - dt * 2.4);
  scorePop2 = Math.max(0, scorePop2 - dt * 2.4);

  drawRices(false);
  drawBasket();
  drawRices(true);
  drawGlove();
  drawHud();
  if (phase !== "home" && phase !== "howto") drawStatus();
  syncNameForm();

  if (phase === "done") drawEnding();
  if (phase === "home" || phase === "howto") drawHome();
  if (phase === "howto") drawHowto();
  if (phase === "mode") drawModeSelect();
  if (phase === "time" || (phase === "done" && !usesQuickEnd())) drawTimeSelect();
  if (phase === "done" && usesQuickEnd()) drawSoloEndActions();
  else endButtons = [];
  updatePointer();
}

function videoReady() {
  return video && video.elt && video.elt.readyState >= 2 && video.elt.videoWidth > 0;
}

function coverBox(srcW, srcH) {
  const scale = Math.max(width / srcW, height / srcH);
  const dw = srcW * scale;
  const dh = srcH * scale;
  return {
    dx: (width - dw) / 2,
    dy: (height - dh) / 2,
    dw,
    dh,
    iw: srcW,
    ih: srcH
  };
}

function drawWebcam() {
  if (!videoReady()) return;
  const geom = coverBox(video.elt.videoWidth, video.elt.videoHeight);
  videoGeom = geom;
  push();
  translate(width, 0);
  scale(-1, 1);
  imageMode(CORNER);
  image(video, geom.dx, geom.dy, geom.dw, geom.dh);
  pop();
}

function drawFrame() {
  if (!frameImg || frameImg.width < 2) return;
  const box = coverBox(frameImg.width, frameImg.height);
  imageMode(CORNER);
  image(frameImg, box.dx, box.dy, box.dw, box.dh);
}

function pointOf(point) {
  if (!point) return null;
  if (Array.isArray(point)) return { x: point[0], y: point[1] };
  if (typeof point.x === "number") return { x: point.x, y: point.y };
  return null;
}

function palmCenter(pred) {
  // 손목과 네 손가락 밑동의 평균이 손바닥 중앙이다.
  if (!pred) return null;
  const named = [
    pred.wrist,
    pred.index_finger_mcp,
    pred.middle_finger_mcp,
    pred.ring_finger_mcp,
    pred.pinky_finger_mcp
  ];
  if (named[0] && named[1]) {
    let x = 0;
    let y = 0;
    for (let i = 0; i < named.length; i++) {
      const p = pointOf(named[i]);
      if (!p) return null;
      x += p.x;
      y += p.y;
    }
    return { x: x / named.length, y: y / named.length };
  }

  const landmarks = pred.landmarks || pred.keypoints;
  if (!landmarks || landmarks.length < 18) return null;
  const ids = [0, 5, 9, 13, 17];
  let x = 0;
  let y = 0;
  for (let i = 0; i < ids.length; i++) {
    const p = pointOf(landmarks[ids[i]]);
    if (!p) return null;
    x += p.x;
    y += p.y;
  }
  return { x: x / ids.length, y: y / ids.length };
}

function videoPointToScreen(vx, vy) {
  if (!videoGeom) return null;
  const geom = videoGeom;
  let fx = vx;
  let fy = vy;
  if (Math.abs(vx) > 2 || Math.abs(vy) > 2) {
    fx = vx / geom.iw;
    fy = vy / geom.ih;
  }
  return {
    x: width - (geom.dx + fx * geom.dw),
    y: geom.dy + fy * geom.dh
  };
}

function handLabel(pred) {
  if (!pred) return "";
  let value = pred.handedness;
  if (Array.isArray(value)) value = value[0];
  if (value && typeof value === "object") {
    value = value.categoryName || value.displayName || value.label || "";
  }
  if (typeof value !== "string") return "";
  if (/left/i.test(value)) return "Left";
  if (/right/i.test(value)) return "Right";
  return "";
}

function detectedPalms() {
  const found = [];
  const limit = Math.min(predictions.length, MAX_HANDS);
  for (let i = 0; i < limit; i++) {
    const palm = palmCenter(predictions[i]);
    if (!palm) continue;
    const screen = videoPointToScreen(palm.x, palm.y);
    if (!screen) continue;
    const label = handLabel(predictions[i]);
    // 모델은 뒤집지 않은 영상을 본다. 아이가 든 왼손은 Right로 표시된다.
    let mirror = null;
    if (label === "Right") mirror = true;
    if (label === "Left") mirror = false;
    found.push({ x: screen.x, y: screen.y, mirror });
  }
  return found;
}

function updateHands() {
  const detected = detectedPalms();
  const now = millis();
  const maxMatch = Math.min(width, height) * 0.35;
  const pairs = [];

  for (let t = 0; t < trackedHands.length; t++) {
    for (let d = 0; d < detected.length; d++) {
      pairs.push({
        t,
        d,
        dist: dist(trackedHands[t].x, trackedHands[t].y, detected[d].x, detected[d].y)
      });
    }
  }
  pairs.sort((a, b) => a.dist - b.dist);

  const usedTrack = {};
  const usedDetect = {};
  for (let i = 0; i < pairs.length; i++) {
    const pair = pairs[i];
    if (usedTrack[pair.t] || usedDetect[pair.d] || pair.dist > maxMatch) continue;
    usedTrack[pair.t] = true;
    usedDetect[pair.d] = true;
    const track = trackedHands[pair.t];
    const point = detected[pair.d];
    track.x = lerp(track.x, point.x, 0.55);
    track.y = lerp(track.y, point.y, 0.55);
    if (point.mirror === true || point.mirror === false) track.mirror = point.mirror;
    track.seen = now;
    track.visible = true;
  }

  const next = [];
  for (let t = 0; t < trackedHands.length; t++) {
    if (usedTrack[t] || now - trackedHands[t].seen < 280) {
      if (!usedTrack[t]) trackedHands[t].visible = true;
      next.push(trackedHands[t]);
    }
  }

  for (let d = 0; d < detected.length && next.length < MAX_HANDS; d++) {
    if (usedDetect[d]) continue;
    next.push({
      x: detected[d].x,
      y: detected[d].y,
      mirror: detected[d].mirror,
      seen: now,
      visible: true
    });
  }

  resolveMirrors(next);
  if (next.length > 0) handEver = true;
  trackedHands = next;
}

function resolveMirrors(hands) {
  const sides = [[], []];
  for (let i = 0; i < hands.length; i++) {
    sides[hands[i].x < width / 2 ? 0 : 1].push(hands[i]);
  }
  for (let s = 0; s < sides.length; s++) {
    const side = sides[s];
    if (side.length < 2) continue;
    let leftIndex = 0;
    for (let i = 1; i < side.length; i++) {
      if (side[i].x < side[leftIndex].x) leftIndex = i;
    }
    for (let i = 0; i < side.length; i++) side[i].mirror = i === leftIndex;
  }
}

function riceBaseSize() {
  return Math.min(width, height) * 0.15;
}

function basketLayout() {
  const aspect = basketImg && basketImg.width > 2 ? basketImg.width / basketImg.height : 1.2;
  const h = Math.min(width, height) * 0.38;
  const w = h * aspect;
  const bottom = height - Math.max(6, height * 0.012);
  return {
    x: width / 2,
    y: bottom - h / 2,
    w,
    h
  };
}

function basketMouth() {
  const b = basketLayout();
  return { x: b.x, y: b.y - b.h * 0.02 };
}

function drawSplit() {
  const thickness = Math.max(16, width * 0.016);
  rectMode(CENTER);
  noStroke();
  fill(255, 248, 220, 120);
  rect(width / 2, height / 2, thickness, height);
  rectMode(CORNER);
}

function easeOutBack(t) {
  const c1 = 2.2;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

function makeRice() {
  const size = riceBaseSize() * random(0.92, 1.08);
  const spot = riceSpot(size * riceScale);
  return {
    x: spot.x,
    y: spot.y,
    size,
    state: "grow",
    age: 0,
    stay: random(RICE_STAY_MIN, RICE_STAY_MAX),
    pop: 0,
    bye: 0,
    flyT: 0,
    sx: 0,
    sy: 0,
    scale: 0,
    wobble: random(-1, 1),
    dead: false
  };
}

function riceSpot(size) {
  const y0 = height * 0.5;
  const y1 = height * 0.9;
  const margin = Math.max(size * 0.65, width * 0.06);
  const basket = basketLayout();

  for (let attempt = 0; attempt < 16; attempt++) {
    const x = random(margin, Math.max(margin + 10, width - margin));
    const y = random(y0, y1);
    const overBasket =
      y > basket.y - basket.h * 0.5 && Math.abs(x - basket.x) < basket.w * 0.42;
    const crowded = rices.some(
      (other) => other.state !== "fly" && dist(other.x, other.y, x, y) < (size + other.size) * 0.48
    );
    if (!overBasket && !crowded) return { x, y };
  }

  return {
    x: random(margin, Math.max(margin + 10, width - margin)),
    y: random(y0, y1)
  };
}

function groundCount() {
  let count = 0;
  for (let i = 0; i < rices.length; i++) {
    if (rices[i].state !== "fly") count += 1;
  }
  return count;
}

function spawnRice(dt) {
  spawnAcc += dt;
  if (spawnAcc < SPAWN_EVERY || groundCount() >= MAX_ON_GROUND) return;
  spawnAcc = 0;
  rices.push(makeRice());
}

function shownScale(rice) {
  return Math.max(0, rice.scale);
}

function catchingHand(rice) {
  const shown = rice.size * shownScale(rice) * riceScale;
  const hit = shown * RICE_HIT_SCALE;
  if (hit < 12) return null;
  const gloveHalf = Math.min(width, height) * GLOVE_SIZE * 0.5;
  const reach = Math.max(6, hit / 2 + gloveHalf * (gloveScale - 1));
  for (let i = 0; i < trackedHands.length; i++) {
    const hand = trackedHands[i];
    if (!hand.visible) continue;
    if (Math.abs(hand.x - rice.x) < reach && Math.abs(hand.y - rice.y) < reach) return hand;
  }
  return null;
}

function playerFromHand(hand) {
  if (mode !== "versus" || !hand) return 1;
  return hand.x < width / 2 ? 1 : 2;
}

function launchToBasket(rice, hand) {
  rice.state = "fly";
  rice.sx = rice.x;
  rice.sy = rice.y;
  rice.flyT = 0;
  rice.scale = 1;
  rice.player = playerFromHand(hand);
}

function tryCatch(rice) {
  const hand = catchingHand(rice);
  if (hand) launchToBasket(rice, hand);
}

function awardPoint(player) {
  if (mode === "versus" && player === 2) {
    score2 += 1;
    scorePop2 = 1;
    return;
  }
  score += 1;
  scorePop = 1;
}

function updateRices(dt) {
  for (let i = rices.length - 1; i >= 0; i--) {
    const rice = rices[i];
    if (rice.state === "grow") {
      rice.pop += dt / POP_TIME;
      rice.scale = easeOutBack(Math.min(1, rice.pop));
      if (rice.pop >= 1) {
        rice.state = "idle";
        rice.age = 0;
        rice.scale = 1;
      } else if (rice.pop > 0.35) {
        tryCatch(rice);
      }
    } else if (rice.state === "idle") {
      rice.age += dt;
      rice.scale = 1;
      const hand = catchingHand(rice);
      if (hand) {
        launchToBasket(rice, hand);
      } else if (rice.age >= rice.stay) {
        rice.state = "bye";
        rice.bye = 0;
      }
    } else if (rice.state === "bye") {
      rice.bye += dt / BYE_TIME;
      const t = Math.min(1, rice.bye);
      rice.scale = lerp(1, 0.12, t);
      if (t >= 1) rice.dead = true;
      else if (rice.scale > 0.45) tryCatch(rice);
    } else {
      rice.flyT += dt / FLY_TIME;
      const t = Math.min(1, rice.flyT);
      const mouth = basketMouth();
      const arc = Math.min(width, height) * 0.2;
      rice.x = lerp(rice.sx, mouth.x, t);
      rice.y = lerp(rice.sy, mouth.y, t) - Math.sin(t * Math.PI) * arc;
      rice.scale = t > 0.7 ? lerp(1, 0.22, (t - 0.7) / 0.3) : 1;
      if (t >= 1) {
        awardPoint(rice.player || 1);
        rice.dead = true;
      }
    }
    if (rice.dead) rices.splice(i, 1);
  }
}

function finishGame() {
  if (gameOver) return;
  gameOver = true;
  phase = "done";
  endAnim = 0;
  stopBgm();
  for (let i = rices.length - 1; i >= 0; i--) {
    if (rices[i].state === "fly") {
      awardPoint(rices[i].player || 1);
      rices.splice(i, 1);
    }
  }
  if (mode === "solo") {
    newRecord = score > bestScore;
    rankReady = false;
    nameFocused = false;
  }
}

function drawRices(flying) {
  if (!riceImg || riceImg.width < 2) return;
  imageMode(CENTER);
  for (let i = 0; i < rices.length; i++) {
    const rice = rices[i];
    const isFlying = rice.state === "fly";
    if (isFlying !== flying) continue;
    const rot = isFlying
      ? (rice.flyT - 0.4) * 0.9
      : Math.sin((rice.age + rice.pop) * 2.2) * 0.06 * rice.wobble;
    const drawSize = rice.size * shownScale(rice) * riceScale;
    if (drawSize < 2) continue;
    push();
    translate(rice.x, rice.y);
    rotate(rot);
    image(riceImg, 0, 0, drawSize, drawSize);
    pop();
  }
}

function drawBasket() {
  if (!basketImg || basketImg.width < 2) return;
  const b = basketLayout();
  imageMode(CENTER);
  image(basketImg, b.x, b.y, b.w, b.h);
}

function drawGlove() {
  if (gameOver || !gloveImg || gloveImg.width < 2) return;
  const g = Math.min(width, height) * GLOVE_SIZE * gloveScale;
  imageMode(CENTER);
  for (let i = 0; i < trackedHands.length; i++) {
    const hand = trackedHands[i];
    if (!hand.visible) continue;
    push();
    translate(hand.x, hand.y);
    if (hand.mirror) scale(-1, 1);
    image(gloveImg, 0, 0, g, g);
    pop();
  }
}

function remainingSeconds() {
  if (phase !== "play") return phase === "done" ? 0 : roundSeconds;
  return Math.max(0, roundSeconds - (millis() - startTime) / 1000);
}

function hudLayout() {
  const timeText = Math.ceil(remainingSeconds()) + "초";
  let scoreSize = Math.min(width * 0.052, height * 0.086);
  textStyle(BOLD);
  textSize(scoreSize);
  const timeSize = scoreSize * 0.62;
  textSize(timeSize);
  const timeWidth = textWidth(timeText) + width * 0.06;
  textSize(scoreSize);
  const scoreText = "수확한 벼: " + score;
  while (scoreSize > 24 && textWidth(scoreText) > width - timeWidth * 2) {
    scoreSize *= 0.92;
    textSize(scoreSize);
  }
  return {
    scoreSize,
    timeSize: scoreSize * 0.62,
    scoreY: scoreSize * 0.62 + 12,
    timeText
  };
}

function drawCuteText(str, x, y, size, align) {
  textAlign(align || CENTER, CENTER);
  textStyle(BOLD);
  textSize(size);
  stroke(122, 64, 16);
  strokeWeight(Math.max(4, size * 0.1));
  fill(255, 214, 48);
  text(str, x, y);
}

function usesQuickEnd() {
  return mode === "solo" || mode === "free";
}

function drawHud() {
  if (phase === "done") return;
  if (mode === "versus") {
    drawVersusHud();
    return;
  }
  if (mode === "free") {
    drawFreeHud();
    return;
  }
  if (mode !== "solo") return;

  const hud = hudLayout();
  const pop = 1 + scorePop * 0.18;
  drawCuteText("수확한 벼: " + score, width / 2, hud.scoreY, hud.scoreSize * pop, CENTER);
  const bestSize = hud.scoreSize * 0.58;
  drawCuteText(
    "최고 점수: " + bestScore + "점",
    width / 2,
    hud.scoreY + hud.scoreSize * 0.92,
    bestSize,
    CENTER
  );
  if (phase === "play" || phase === "done") {
    drawCuteText(hud.timeText, width - Math.max(18, width * 0.028), hud.scoreY, hud.timeSize, RIGHT);
  }
}

function drawFreeHud() {
  const hud = hudLayout();
  const pop = 1 + scorePop * 0.18;
  drawCuteText("수확한 벼: " + score, width / 2, hud.scoreY, hud.scoreSize * pop, CENTER);
  if (phase === "play" || phase === "done") {
    drawCuteText(hud.timeText, width - Math.max(18, width * 0.028), hud.scoreY, hud.timeSize, RIGHT);
  }
}

function drawVersusHud() {
  const scoreSize = Math.min(width * 0.034, height * 0.056);
  const timeSize = scoreSize * 0.78;
  const y = scoreSize * 0.85 + 16;
  drawCuteText("1P 점수: " + score, width * 0.03, y, scoreSize * (1 + scorePop * 0.16), LEFT);
  drawCuteText("2P 점수: " + score2, width * 0.7, y, scoreSize * (1 + scorePop2 * 0.16), LEFT);
  if (phase === "play" || phase === "done") {
    drawCuteText(Math.ceil(remainingSeconds()) + "초", width / 2, y, timeSize, CENTER);
  }
}

function fitTextSize(str, wanted, maxWidth) {
  textStyle(BOLD);
  let size = wanted;
  textSize(size);
  while (size > 20 && textWidth(str) > maxWidth) {
    size *= 0.94;
    textSize(size);
  }
  return size;
}

function drawHint(str, y) {
  const size = Math.min(width * 0.042, height * 0.058);
  textStyle(BOLD);
  textSize(size);
  const boxW = textWidth(str) + size * 1.5;
  const boxH = size * 1.75;
  rectMode(CENTER);
  noStroke();
  fill(0, 0, 0, 88);
  rect(width / 2, y, boxW, boxH, boxH / 2);
  drawCuteText(str, width / 2, y, size, CENTER);
  rectMode(CORNER);
}

function drawStatus() {
  if (phase === "done") return;
  if (assetError) {
    drawHint("그림 파일을 찾지 못했어요", height * 0.5);
    return;
  }
  if (location.protocol === "file:") {
    drawHint("로컬 서버로 열어 주세요", height * 0.46);
    return;
  }
  if (typeof ml5 === "undefined") {
    drawHint("손 인식 준비를 확인해 주세요", height * 0.46);
    return;
  }
  if (!videoReady()) {
    drawHint("카메라를 허용해 주세요", height * 0.46);
    return;
  }
  if (!modelReady) {
    drawHint("손을 찾고 있어요", height * 0.46);
    return;
  }
  if (phase === "play" && !handEver) {
    drawHint("손을 보여 주세요!", height * 0.4);
  }
}

function drawEnding() {
  const t = 1 - Math.pow(1 - Math.min(1, endAnim), 3);
  noStroke();
  fill(0, 0, 0, 150 * t);
  rectMode(CORNER);
  rect(0, 0, width, height);

  const pop = 0.9 + 0.1 * t;
  if (mode === "versus") {
    drawVersusEnding(pop);
    return;
  }
  if (mode === "free") {
    drawFreeEnding(pop);
    return;
  }

  const message = "최고의 농부! 정말 잘했어요!";
  const messageSize = fitTextSize(
    message,
    Math.min(width * 0.05, height * 0.068) * pop,
    width * 0.9
  );
  drawCuteText(message, width / 2, height * 0.12, messageSize, CENTER);

  if (!rankReady) {
    const scoreText = "수확한 벼: " + score;
    const scoreSize = fitTextSize(
      scoreText,
      Math.min(width * 0.055, height * 0.072) * pop,
      width * 0.9
    );
    drawCuteText(scoreText, width / 2, height * 0.185, scoreSize, CENTER);
    return;
  }

  if (newRecord) {
    const recordSize = fitTextSize(
      "새로운 최고 기록!",
      Math.min(width * 0.04, height * 0.052) * pop,
      width * 0.9
    );
    drawCuteText("새로운 최고 기록!", width / 2, height * 0.18, recordSize, CENTER);
  }
  drawRankCard(ranks.slice(0, 5), width / 2, height * (newRecord ? 0.32 : 0.29), false);
}

function drawFreeEnding(pop) {
  const message = "최고의 농부!";
  const messageSize = fitTextSize(
    message,
    Math.min(width * 0.08, height * 0.11) * pop,
    width * 0.9
  );
  drawCuteText(message, width / 2, height * 0.3, messageSize, CENTER);

  const scoreText = "수확한 벼: " + score;
  const scoreSize = fitTextSize(
    scoreText,
    Math.min(width * 0.06, height * 0.08) * pop,
    width * 0.9
  );
  drawCuteText(scoreText, width / 2, height * 0.4, scoreSize, CENTER);
}

function drawVersusEnding(pop) {
  let message = "무승부!";
  if (score > score2) message = "1P 승리!";
  else if (score2 > score) message = "2P 승리!";
  const messageSize = fitTextSize(
    message,
    Math.min(width * 0.09, height * 0.13) * pop,
    width * 0.9
  );
  drawCuteText(message, width / 2, height * 0.2, messageSize, CENTER);

  const scoreText = "1P " + score + "점    2P " + score2 + "점";
  const scoreSize = fitTextSize(
    scoreText,
    Math.min(width * 0.06, height * 0.09) * pop,
    width * 0.9
  );
  drawCuteText(scoreText, width / 2, height * 0.33, scoreSize, CENTER);
}

function layoutButtons(labels, y, widthRatio, maxW) {
  const btnW = Math.min(width * widthRatio, maxW);
  const btnH = Math.min(height * 0.15, 150);
  const gap = Math.min(width, height) * 0.03;
  const total = labels.length * btnW + (labels.length - 1) * gap;
  const startX = width / 2 - total / 2 + btnW / 2;
  const buttons = [];
  for (let i = 0; i < labels.length; i++) {
    buttons.push({
      label: labels[i].label,
      value: labels[i].value,
      seconds: labels[i].seconds,
      home: !!labels[i].home,
      x: startX + i * (btnW + gap),
      y,
      w: btnW,
      h: btnH
    });
  }
  return buttons;
}

function layoutHomeButton(timeButtons) {
  const h = Math.min(timeButtons[0].h * 0.72, 96);
  const w = Math.min(width * 0.32, 430);
  const gap = Math.min(width, height) * 0.02;
  const last = timeButtons[timeButtons.length - 1];
  const sideX = last.x + last.w / 2 + gap + w / 2;
  const button = {
    label: "🏠 홈으로 돌아가기",
    home: true,
    x: width / 2,
    y: last.y,
    w: w,
    h: h
  };
  if (sideX + w / 2 <= width - 16) {
    button.x = sideX;
    button.y = last.y;
    return button;
  }
  button.y = last.y + last.h / 2 + gap + h / 2;
  button.w = Math.min(width * 0.46, 460);
  return button;
}

function layoutTimeButtons(y) {
  return layoutButtons(
    TIME_CHOICES.map((seconds) => ({ label: seconds + "초", seconds: seconds })),
    y,
    0.22,
    280
  );
}

function drawSoloEndActions() {
  endButtons = layoutButtons(
    [
      { label: "도전하기", value: "retry" },
      { label: "🏠 홈으로 돌아가기", value: "home", home: true }
    ],
    height * 0.54,
    0.34,
    460
  );
  homeButton = null;
  for (let i = 0; i < endButtons.length; i++) drawTimeButton(endButtons[i]);
}

function drawTimeSelect() {
  const askingName = phase === "done" && mode === "solo" && !rankReady;
  const titleY = phase === "done" ? height * 0.42 : height * 0.38;
  const buttonY = height * 0.54;
  if (!askingName) {
    const title = "시간을 선택해주세요!";
    const titleSize = fitTextSize(title, Math.min(width * 0.055, height * 0.08), width * 0.9);
    drawCuteText(title, width / 2, titleY, titleSize, CENTER);
  }

  timeButtons = layoutTimeButtons(buttonY);
  for (let i = 0; i < timeButtons.length; i++) drawTimeButton(timeButtons[i]);
  if (phase === "done") {
    homeButton = layoutHomeButton(timeButtons);
    drawTimeButton(homeButton);
  } else {
    homeButton = null;
  }
}

function layoutHomeMenu() {
  const gap = Math.min(width, height) * 0.05;
  let size = Math.min(height * 0.46, width * 0.34, 500);
  if (size * 2 + gap > width - 48) size = (width - 48 - gap) / 2;
  const y = height * 0.52;
  const left = width / 2 - (size + gap) / 2;
  const right = width / 2 + (size + gap) / 2;
  return [
    { kind: "start", img: startImg, x: left, y: y, w: size, h: size },
    { kind: "howto", img: howtoImg, x: right, y: y, w: size, h: size }
  ];
}

function drawHomeTitle(buttons) {
  if (!titleImg || titleImg.width < 2 || !buttons.length) return;
  const buttonTop = buttons[0].y - buttons[0].h / 2;
  const aspect = titleImg.width / titleImg.height;
  const topPad = height * 0.04;
  const gap = Math.min(width, height) * 0.015;
  let titleH = buttonTop - topPad - gap;
  if (titleH < 48) return;
  titleH = Math.min(titleH, height * 0.26);
  let titleW = titleH * aspect;
  const maxW = Math.min(width * 0.72, 980);
  if (titleW > maxW) {
    titleW = maxW;
    titleH = titleW / aspect;
  }
  image(titleImg, width / 2, topPad + titleH / 2, titleW, titleH);
}

function drawHome() {
  homeMenu = layoutHomeMenu();
  imageMode(CENTER);
  drawHomeTitle(homeMenu);
  for (let i = 0; i < homeMenu.length; i++) {
    const button = homeMenu[i];
    if (!button.img || button.img.width < 2) continue;
    const over = phase === "home" && pointInButton(mouseX, mouseY, button);
    const scale = over ? 1.08 : 1;
    image(button.img, button.x, button.y, button.w * scale, button.h * scale);
  }
}

function drawHowto() {
  noStroke();
  fill(0, 0, 0, 150);
  rectMode(CORNER);
  rect(0, 0, width, height);

  const lines = [
    "손을 카메라에 보여 주세요.",
    "곡식을 손으로 잡으면 바구니로 들어가요.",
    "바구니에 들어가면 점수가 올라가요.",
    "혼자 하거나 친구와 함께 할 수 있어요."
  ];
  const title = "게임 방법";
  const titleSize = fitTextSize(title, Math.min(width * 0.06, height * 0.08), width * 0.7);
  const lineSize = Math.min(width * 0.032, height * 0.042);
  const boxW = Math.min(width * 0.72, 980);
  const boxH = titleSize * 2.2 + lines.length * lineSize * 1.7 + Math.min(height * 0.16, 150);
  const boxY = height * 0.46;
  rectMode(CENTER);
  stroke(122, 64, 16);
  strokeWeight(8);
  fill(255, 248, 220, 246);
  rect(width / 2, boxY, boxW, boxH, 36);
  noStroke();
  const top = boxY - boxH / 2;
  drawCuteText(title, width / 2, top + titleSize * 1.15, titleSize, CENTER);
  fill(122, 64, 16);
  noStroke();
  textAlign(CENTER, CENTER);
  textStyle(BOLD);
  textSize(lineSize);
  for (let i = 0; i < lines.length; i++) {
    text(lines[i], width / 2, top + titleSize * 2.2 + lineSize * 1.7 * (i + 0.6));
  }
  const closeH = Math.min(height * 0.1, 96);
  const closeW = Math.min(boxW * 0.42, 280);
  howtoClose = {
    label: "닫기",
    x: width / 2,
    y: top + boxH - closeH * 0.85,
    w: closeW,
    h: closeH
  };
  drawTimeButton(howtoClose);
  rectMode(CORNER);
}

function drawModeSelect() {
  const title = "모드를 선택해주세요!";
  const titleSize = fitTextSize(title, Math.min(width * 0.055, height * 0.08), width * 0.9);
  drawCuteText(title, width / 2, height * 0.38, titleSize, CENTER);
  modeButtons = layoutButtons(
    [
      { label: "1인용(점수 없음)", value: "free" },
      { label: "1인용(점수 기록)", value: "solo" },
      { label: "2인용(1:1 대결)", value: "versus" }
    ],
    height * 0.54,
    0.28,
    420
  );
  for (let i = 0; i < modeButtons.length; i++) drawTimeButton(modeButtons[i]);
}

function drawTimeButton(button) {
  const over = pointInButton(mouseX, mouseY, button);
  rectMode(CENTER);
  stroke(122, 64, 16);
  strokeWeight(Math.max(5, button.h * 0.08));
  if (button.home) fill(over ? color(186, 230, 120) : color(126, 196, 74));
  else fill(over ? color(255, 236, 130) : color(255, 214, 48));
  rect(button.x, button.y, button.w, button.h, button.h * 0.32);
  noStroke();
  fill(122, 64, 16);
  textAlign(CENTER, CENTER);
  textStyle(BOLD);
  const labelMax = button.home ? button.w * 0.76 : button.w * 0.88;
  const labelSize = fitTextSize(button.label, button.h * (button.home ? 0.32 : 0.36), labelMax);
  textSize(labelSize);
  text(button.label, button.x, button.y);
  rectMode(CORNER);
}

function pointInButton(x, y, button) {
  return Math.abs(x - button.x) < button.w / 2 && Math.abs(y - button.y) < button.h / 2;
}

function updatePointer() {
  if (phase === "play") {
    cursor(ARROW);
    return;
  }
  let buttons = modeButtons;
  if (phase === "home") buttons = homeMenu;
  if (phase === "howto") buttons = howtoClose ? [howtoClose] : [];
  if (phase === "time") buttons = timeButtons;
  if (phase === "done") buttons = usesQuickEnd() ? endButtons : timeButtons;
  let over = false;
  for (let i = 0; i < buttons.length; i++) {
    if (pointInButton(mouseX, mouseY, buttons[i])) over = true;
  }
  if (phase === "done" && !usesQuickEnd() && homeButton && pointInButton(mouseX, mouseY, homeButton)) over = true;
  cursor(over ? HAND : ARROW);
}

function chooseMode(x, y) {
  for (let i = 0; i < modeButtons.length; i++) {
    const button = modeButtons[i];
    if (pointInButton(x, y, button)) {
      mode = button.value;
      phase = "time";
      return;
    }
  }
}

function chooseTime(x, y) {
  if (phase !== "time" && phase !== "done") return;
  if (phase === "done" && homeButton && pointInButton(x, y, homeButton)) {
    goHome();
    return;
  }
  for (let i = 0; i < timeButtons.length; i++) {
    const button = timeButtons[i];
    if (pointInButton(x, y, button)) {
      startRound(button.seconds);
      return;
    }
  }
}

function clearRanks() {
  ranks = [];
  bestScore = 0;
  try {
    localStorage.removeItem(RANK_KEY);
    localStorage.removeItem("riceHarvestBest");
  } catch (error) {}
}

function goHome() {
  mode = null;
  roundSeconds = 60;
  score = 0;
  score2 = 0;
  scorePop = 0;
  scorePop2 = 0;
  newRecord = false;
  rankReady = false;
  nameFocused = false;
  rices = [];
  spawnAcc = 0;
  gameOver = false;
  endAnim = 0;
  phase = "home";
  homeButton = null;
  endButtons = [];
  clearRanks();
}

function startRound(seconds) {
  roundSeconds = seconds;
  score = 0;
  score2 = 0;
  scorePop = 0;
  scorePop2 = 0;
  newRecord = false;
  rankReady = false;
  nameFocused = false;
  rices = [];
  spawnAcc = 0;
  gameOver = false;
  endAnim = 0;
  phase = "play";
  startTime = millis();
  playBgm();
}

function loadRanks() {
  let list = [];
  try {
    const raw = JSON.parse(localStorage.getItem(RANK_KEY) || "[]");
    if (Array.isArray(raw)) {
      list = raw.filter((item) => item && typeof item.name === "string" && isFinite(item.score));
    }
  } catch (error) {
    list = [];
  }
  if (!list.length) {
    try {
      const oldBest = parseInt(localStorage.getItem("riceHarvestBest"), 10);
      if (!isNaN(oldBest) && oldBest > 0) list = [{ name: "최고기록", score: oldBest }];
    } catch (error) {}
  }
  list.sort((a, b) => b.score - a.score);
  return list.slice(0, RANK_KEEP);
}

function saveRanks() {
  try {
    localStorage.setItem(RANK_KEY, JSON.stringify(ranks));
  } catch (error) {}
}

function addRank(name, points) {
  ranks.push({ name: name, score: points });
  ranks.sort((a, b) => b.score - a.score);
  ranks = ranks.slice(0, RANK_KEEP);
  bestScore = ranks.length ? ranks[0].score : 0;
  saveRanks();
}

function clampScale(value) {
  const n = parseFloat(value);
  if (!isFinite(n)) return 1;
  return Math.min(1.8, Math.max(0.6, n));
}

function loadScale(key) {
  try {
    return clampScale(localStorage.getItem(key));
  } catch (error) {
    return 1;
  }
}

function saveScale(key, value) {
  try {
    localStorage.setItem(key, String(value));
  } catch (error) {}
}

function bindSizeSlider(id, key, apply) {
  const input = document.getElementById(id);
  if (!input) return;
  const stored = loadScale(key);
  input.value = String(Math.round(stored * 100));
  apply(stored);
  input.addEventListener("input", () => {
    const scale = clampScale(Number(input.value) / 100);
    apply(scale);
    saveScale(key, scale);
  });
}

function setupSizeSliders() {
  bindSizeSlider("glove-size", GLOVE_SCALE_KEY, (scale) => {
    gloveScale = scale;
  });
  bindSizeSlider("rice-size", RICE_SCALE_KEY, (scale) => {
    riceScale = scale;
  });
}

function setupNameForm() {
  const form = document.getElementById("name-card");
  const input = document.getElementById("farmer-name");
  if (!form || !input) return;
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    submitName();
  });
  input.addEventListener("keydown", (event) => {
    event.stopPropagation();
  });
}

function syncNameForm() {
  const form = document.getElementById("name-card");
  const input = document.getElementById("farmer-name");
  if (!form || !input) return;
  const show = phase === "done" && mode === "solo" && !rankReady;
  const note = document.getElementById("record-note");
  if (note) note.style.display = show && newRecord ? "block" : "none";
  form.classList.toggle("show", show);
  if (show && !nameFocused) {
    nameFocused = true;
    input.value = "";
    input.focus();
  }
  if (!show) nameFocused = false;
}

function submitName() {
  if (phase !== "done" || mode !== "solo" || rankReady) return;
  const input = document.getElementById("farmer-name");
  if (!input) return;
  const name = input.value.trim().slice(0, 8);
  if (!name) {
    input.focus();
    return;
  }
  addRank(name, score);
  rankReady = true;
  input.value = "";
}

function drawRankCard(entries, cx, cy, compact) {
  const shown = entries.slice(0, compact ? 3 : 5);
  const rowSize = compact
    ? Math.min(width * 0.018, height * 0.028)
    : Math.min(width * 0.024, height * 0.032);
  const titleSize = rowSize * 1.2;
  const rows = Math.max(shown.length, 1);
  const gap = rowSize * 1.28;
  const boxW = compact ? Math.min(width * 0.26, 320) : Math.min(width * 0.42, 520);
  const boxH = titleSize * 1.7 + rows * gap + rowSize * 0.7;
  rectMode(CENTER);
  stroke(122, 64, 16);
  strokeWeight(Math.max(3, rowSize * 0.14));
  fill(255, 248, 220, compact ? 228 : 242);
  rect(cx, cy, boxW, boxH, Math.max(16, rowSize));
  noStroke();
  fill(122, 64, 16);
  textAlign(CENTER, CENTER);
  textStyle(BOLD);
  textSize(titleSize);
  const top = cy - boxH / 2;
  text("명예의 전당", cx, top + titleSize);
  textSize(rowSize);
  if (!shown.length) {
    text("아직 기록이 없어요", cx, top + titleSize + gap);
    rectMode(CORNER);
    return;
  }
  for (let i = 0; i < shown.length; i++) {
    const line = i + 1 + "위  " + shown[i].name + "  " + shown[i].score + "점";
    text(line, cx, top + titleSize + gap * (i + 1));
  }
  rectMode(CORNER);
}

function bgmIsPlaying() {
  return !!(bgm && !bgm.paused && !bgm.ended);
}

function playBgm() {
  if (!bgm || bgmStarting || bgmIsPlaying()) return;
  bgmStarting = true;
  bgm.pause();
  try {
    bgm.currentTime = 0;
  } catch (error) {}
  bgm.loop = true;
  const started = bgm.play();
  if (started && started.then) {
    started.then(function () {
      bgmStarting = false;
    }).catch(function () {
      bgmStarting = false;
    });
  } else {
    bgmStarting = false;
  }
}

function stopBgm() {
  if (!bgm) return;
  bgmStarting = false;
  bgm.pause();
  try {
    bgm.currentTime = 0;
  } catch (error) {}
}

function mousePressed() {
  onPointer(mouseX, mouseY);
}

function touchStarted() {
  onPointer(mouseX, mouseY);
  return false;
}

function chooseSoloEnd(x, y) {
  for (let i = 0; i < endButtons.length; i++) {
    const button = endButtons[i];
    if (!pointInButton(x, y, button)) continue;
    if (button.home) goHome();
    else startRound(roundSeconds);
    return;
  }
}

function chooseHome(x, y) {
  for (let i = 0; i < homeMenu.length; i++) {
    const button = homeMenu[i];
    if (!pointInButton(x, y, button)) continue;
    if (button.kind === "start") phase = "mode";
    else phase = "howto";
    return;
  }
}

function closeHowto(x, y) {
  if (howtoClose && pointInButton(x, y, howtoClose)) phase = "home";
}

function onPointer(x, y) {
  if (phase === "play") return;
  if (phase === "home") {
    chooseHome(x, y);
    return;
  }
  if (phase === "howto") {
    closeHowto(x, y);
    return;
  }
  if (phase === "mode") {
    chooseMode(x, y);
    return;
  }
  if (phase === "done" && usesQuickEnd()) {
    chooseSoloEnd(x, y);
    return;
  }
  chooseTime(x, y);
}
