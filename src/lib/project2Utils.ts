import * as THREE from 'three';
import type { DestinationPoint, OriginPreset, TravelMode } from '@/lib/project2Data';

const EARTH_RADIUS_KM = 6371;
const EARTH_MAP_WIDTH = 1024;
const EARTH_MAP_HEIGHT = 512;

const LANDMASSES = [
  [
    [180, 240],
    [330, 150],
    [460, 120],
    [520, 180],
    [500, 280],
    [430, 360],
    [350, 420],
    [250, 380],
  ],
  [
    [580, 170],
    [700, 120],
    [850, 130],
    [970, 200],
    [1090, 230],
    [1160, 320],
    [1090, 420],
    [890, 410],
    [760, 360],
    [680, 300],
  ],
  [
    [760, 470],
    [860, 440],
    [930, 480],
    [980, 590],
    [930, 720],
    [850, 790],
    [740, 730],
    [710, 590],
  ],
  [
    [1210, 620],
    [1310, 560],
    [1430, 590],
    [1480, 670],
    [1400, 760],
    [1280, 760],
    [1190, 690],
  ],
  [
    [1520, 260],
    [1640, 220],
    [1750, 280],
    [1820, 370],
    [1710, 420],
    [1600, 390],
    [1510, 320],
  ],
] as const;

const RIDGE_CHAINS = [
  [
    [278, 210],
    [336, 176],
    [402, 172],
    [458, 208],
  ],
  [
    [612, 206],
    [708, 186],
    [814, 194],
    [924, 234],
  ],
  [
    [776, 508],
    [828, 476],
    [900, 500],
    [934, 566],
  ],
  [
    [1544, 278],
    [1630, 252],
    [1722, 292],
  ],
  [
    [1288, 598],
    [1378, 624],
    [1450, 670],
  ],
] as const;

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value));
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function smoothstep(min: number, max: number, value: number) {
  const t = clamp01((value - min) / (max - min));
  return t * t * (3 - 2 * t);
}

function fract(value: number) {
  return value - Math.floor(value);
}

function hash2(x: number, y: number) {
  return fract(Math.sin(x * 127.1 + y * 311.7) * 43758.5453123);
}

function valueNoise(x: number, y: number) {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const xf = x - x0;
  const yf = y - y0;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);

  const a = hash2(x0, y0);
  const b = hash2(x0 + 1, y0);
  const c = hash2(x0, y0 + 1);
  const d = hash2(x0 + 1, y0 + 1);

  return lerp(lerp(a, b, u), lerp(c, d, u), v);
}

function fbm(x: number, y: number, octaves = 4) {
  let total = 0;
  let amplitude = 0.55;
  let frequency = 1;
  let maxValue = 0;

  for (let index = 0; index < octaves; index += 1) {
    total += valueNoise(x * frequency, y * frequency) * amplitude;
    maxValue += amplitude;
    amplitude *= 0.5;
    frequency *= 2.03;
  }

  return total / maxValue;
}

function createCanvasTexture(canvas: HTMLCanvasElement, colorSpace?: THREE.ColorSpace) {
  const texture = new THREE.CanvasTexture(canvas);
  if (colorSpace) texture.colorSpace = colorSpace;
  texture.anisotropy = 8;
  return texture;
}

function createCanvas(width = EARTH_MAP_WIDTH, height = EARTH_MAP_HEIGHT) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function drawPolygonPath(
  ctx: CanvasRenderingContext2D,
  points: readonly (readonly [number, number])[],
  scaleX: number,
  scaleY: number,
  closePath = true,
) {
  ctx.beginPath();
  points.forEach(([x, y], index) => {
    const px = x * scaleX;
    const py = y * scaleY;
    if (index === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  });
  if (closePath) ctx.closePath();
}

export interface EarthMaterialMaps {
  colorMap: THREE.CanvasTexture;
  bumpMap: THREE.CanvasTexture;
  roughnessMap: THREE.CanvasTexture;
}

function normalizeText(input: string) {
  return input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(input: string) {
  const normalized = normalizeText(input);
  if (!normalized) return [];
  return normalized.split(' ').filter(Boolean);
}

export function scoreDestination(query: string, point: DestinationPoint) {
  const normalizedQuery = normalizeText(query);
  if (!normalizedQuery) return 0;

  const corpus = [
    point.name,
    point.englishName,
    point.country,
    point.city,
    point.region,
    point.category,
    point.grade,
    point.description,
    point.tagline,
    ...point.tags,
    ...point.aliases,
    ...point.highlights,
  ];

  const normalizedCorpus = corpus.map(normalizeText);
  let score = 0;

  for (const entry of normalizedCorpus) {
    if (entry === normalizedQuery) score += 120;
    if (entry.includes(normalizedQuery)) score += 70;
  }

  const queryTokens = tokenize(query);
  const uniqueQueryTokens = new Set(queryTokens);
  for (const token of uniqueQueryTokens) {
    for (const entry of normalizedCorpus) {
      if (entry.includes(token)) score += token.length >= 4 ? 22 : 12;
    }
  }

  if (point.aliases.some((alias) => normalizeText(alias) === normalizedQuery)) {
    score += 80;
  }

  if (normalizedQuery.includes('浪漫') && point.tags.some((tag) => /浪漫|日落|海岛/.test(tag))) score += 16;
  if (normalizedQuery.includes('古迹') && /古迹|遗产/.test(point.category)) score += 18;
  if (normalizedQuery.includes('雪山') && point.tags.some((tag) => /雪山|高山/.test(tag))) score += 18;
  if (normalizedQuery.includes('极光') && point.tags.some((tag) => /极光/.test(tag))) score += 20;

  return score;
}

export function searchDestinations(query: string, points: readonly DestinationPoint[], limit = 3) {
  const ranked = points
    .map((point) => ({ point, score: scoreDestination(query, point) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return ranked;
}

export function latLngToVector3(lat: number, lng: number, radius = 1) {
  const latRad = THREE.MathUtils.degToRad(lat);
  const lngRad = THREE.MathUtils.degToRad(lng);
  return new THREE.Vector3(
    radius * Math.cos(latRad) * Math.sin(lngRad),
    radius * Math.sin(latRad),
    radius * Math.cos(latRad) * Math.cos(lngRad),
  );
}

export function vector3ToLatLng(vector: THREE.Vector3) {
  const normalized = vector.clone().normalize();
  const lat = THREE.MathUtils.radToDeg(Math.asin(normalized.y));
  const lng = THREE.MathUtils.radToDeg(Math.atan2(normalized.x, normalized.z));
  return { lat, lng };
}

export function haversineDistanceKm(
  fromLat: number,
  fromLng: number,
  toLat: number,
  toLng: number,
) {
  const dLat = THREE.MathUtils.degToRad(toLat - fromLat);
  const dLng = THREE.MathUtils.degToRad(toLng - fromLng);
  const fromLatRad = THREE.MathUtils.degToRad(fromLat);
  const toLatRad = THREE.MathUtils.degToRad(toLat);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(fromLatRad) * Math.cos(toLatRad) * Math.sin(dLng / 2) ** 2;

  return 2 * EARTH_RADIUS_KM * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function buildArcPoints(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
  steps = 64,
) {
  const start = latLngToVector3(from.lat, from.lng, 1.02);
  const end = latLngToVector3(to.lat, to.lng, 1.02);
  const angle = start.angleTo(end);
  const points: THREE.Vector3[] = [];

  for (let index = 0; index <= steps; index += 1) {
    const t = index / steps;
    const vector = start.clone().lerp(end, t).normalize();
    const lift = 1.02 + Math.sin(t * Math.PI) * Math.max(0.08, angle * 0.18);
    points.push(vector.multiplyScalar(lift));
  }

  return points;
}

export function createEarthMaterialMaps(style: 'realistic' | 'grid'): EarthMaterialMaps {
  const colorCanvas = createCanvas();
  const bumpCanvas = createCanvas();
  const roughnessCanvas = createCanvas();
  const maskCanvas = createCanvas();
  const ridgeCanvas = createCanvas();

  const colorCtx = colorCanvas.getContext('2d');
  const bumpCtx = bumpCanvas.getContext('2d');
  const roughCtx = roughnessCanvas.getContext('2d');
  const maskCtx = maskCanvas.getContext('2d');
  const ridgeCtx = ridgeCanvas.getContext('2d');

  if (!colorCtx || !bumpCtx || !roughCtx || !maskCtx || !ridgeCtx) {
    return {
      colorMap: createCanvasTexture(colorCanvas, THREE.SRGBColorSpace),
      bumpMap: createCanvasTexture(bumpCanvas),
      roughnessMap: createCanvasTexture(roughnessCanvas),
    };
  }

  const scaleX = EARTH_MAP_WIDTH / 2048;
  const scaleY = EARTH_MAP_HEIGHT / 1024;

  const oceanGradient = colorCtx.createLinearGradient(0, 0, EARTH_MAP_WIDTH, EARTH_MAP_HEIGHT);
  oceanGradient.addColorStop(0, style === 'realistic' ? '#0a3154' : '#0f335f');
  oceanGradient.addColorStop(0.45, style === 'realistic' ? '#0c5688' : '#155189');
  oceanGradient.addColorStop(1, style === 'realistic' ? '#04101d' : '#09172a');
  colorCtx.fillStyle = oceanGradient;
  colorCtx.fillRect(0, 0, EARTH_MAP_WIDTH, EARTH_MAP_HEIGHT);

  if (style === 'grid') {
    colorCtx.globalAlpha = 0.18;
    colorCtx.strokeStyle = '#8ec5ff';
    colorCtx.lineWidth = 1;
    for (let x = 0; x <= EARTH_MAP_WIDTH; x += 64) {
      colorCtx.beginPath();
      colorCtx.moveTo(x, 0);
      colorCtx.lineTo(x, EARTH_MAP_HEIGHT);
      colorCtx.stroke();
    }
    for (let y = 0; y <= EARTH_MAP_HEIGHT; y += 48) {
      colorCtx.beginPath();
      colorCtx.moveTo(0, y);
      colorCtx.lineTo(EARTH_MAP_WIDTH, y);
      colorCtx.stroke();
    }
    colorCtx.globalAlpha = 1;
  }

  maskCtx.fillStyle = '#ffffff';
  LANDMASSES.forEach((points) => {
    drawPolygonPath(maskCtx, points, scaleX, scaleY);
    maskCtx.fill();
  });

  ridgeCtx.strokeStyle = 'rgba(255,255,255,0.95)';
  ridgeCtx.lineCap = 'round';
  ridgeCtx.lineJoin = 'round';
  ridgeCtx.shadowBlur = 18;
  ridgeCtx.shadowColor = 'rgba(255,255,255,0.28)';
  RIDGE_CHAINS.forEach((chain, index) => {
    ridgeCtx.lineWidth = (index % 2 === 0 ? 22 : 16) * scaleX;
    drawPolygonPath(ridgeCtx, chain, scaleX, scaleY, false);
    ridgeCtx.stroke();
  });

  const maskData = maskCtx.getImageData(0, 0, EARTH_MAP_WIDTH, EARTH_MAP_HEIGHT).data;
  const ridgeData = ridgeCtx.getImageData(0, 0, EARTH_MAP_WIDTH, EARTH_MAP_HEIGHT).data;
  const colorImage = colorCtx.getImageData(0, 0, EARTH_MAP_WIDTH, EARTH_MAP_HEIGHT);
  const bumpImage = bumpCtx.createImageData(EARTH_MAP_WIDTH, EARTH_MAP_HEIGHT);
  const roughnessImage = roughCtx.createImageData(EARTH_MAP_WIDTH, EARTH_MAP_HEIGHT);

  for (let y = 0; y < EARTH_MAP_HEIGHT; y += 1) {
    for (let x = 0; x < EARTH_MAP_WIDTH; x += 1) {
      const index = (y * EARTH_MAP_WIDTH + x) * 4;
      const landMask = maskData[index + 3] / 255;
      const ridgeMask = ridgeData[index + 3] / 255;
      const nx = x / EARTH_MAP_WIDTH;
      const ny = y / EARTH_MAP_HEIGHT;
      const latitude = 1 - Math.abs(ny * 2 - 1);
      const continentalNoise = fbm(nx * 5.4 + 2.8, ny * 4.2 + 1.7, 5);
      const detailNoise = fbm(nx * 18.2 + 8.3, ny * 16.5 + 4.1, 3);
      const oceanNoise = fbm(nx * 8.4 + 12.1, ny * 10.2 + 6.2, 4);
      const ridgeBoost = smoothstep(0.08, 0.72, ridgeMask);

      const terrainHeight = clamp01(
        landMask *
          (0.18 + continentalNoise * 0.38 + detailNoise * 0.18 + ridgeBoost * 0.56 + latitude * 0.08),
      );

      const baseOceanR = lerp(7, 18, oceanNoise);
      const baseOceanG = lerp(33, 92, oceanNoise * 0.9 + latitude * 0.1);
      const baseOceanB = lerp(66, 148, latitude * 0.35 + oceanNoise * 0.65);

      if (landMask > 0.02) {
        const alpine = smoothstep(0.62, 0.92, terrainHeight + ridgeBoost * 0.15);
        const dry = smoothstep(0.24, 0.56, continentalNoise - latitude * 0.12);
        const cold = smoothstep(0.62, 0.95, 1 - latitude + terrainHeight * 0.18);

        const lowland = {
          r: style === 'realistic' ? lerp(64, 104, continentalNoise) : lerp(74, 112, continentalNoise),
          g: style === 'realistic' ? lerp(108, 152, latitude) : lerp(126, 174, latitude),
          b: style === 'realistic' ? lerp(58, 92, 1 - dry) : lerp(126, 190, 0.6 + terrainHeight * 0.4),
        };
        const highland = {
          r: lerp(122, 168, terrainHeight),
          g: lerp(104, 132, terrainHeight),
          b: lerp(82, 110, terrainHeight),
        };

        let r = lerp(lowland.r, highland.r, smoothstep(0.34, 0.76, terrainHeight));
        let g = lerp(lowland.g, highland.g, smoothstep(0.36, 0.78, terrainHeight));
        let b = lerp(lowland.b, highland.b, smoothstep(0.28, 0.72, terrainHeight));

        r = lerp(r, 236, alpine * 0.78 + cold * 0.32);
        g = lerp(g, 241, alpine * 0.76 + cold * 0.28);
        b = lerp(b, 246, alpine * 0.8 + cold * 0.34);

        colorImage.data[index] = Math.round(r);
        colorImage.data[index + 1] = Math.round(g);
        colorImage.data[index + 2] = Math.round(b);
        colorImage.data[index + 3] = 255;

        const bumpValue = Math.round(48 + terrainHeight * 154 + ridgeBoost * 44 + detailNoise * 14);
        bumpImage.data[index] = bumpValue;
        bumpImage.data[index + 1] = bumpValue;
        bumpImage.data[index + 2] = bumpValue;
        bumpImage.data[index + 3] = 255;

        const roughnessValue = Math.round(96 + terrainHeight * 90 + ridgeBoost * 24);
        roughnessImage.data[index] = roughnessValue;
        roughnessImage.data[index + 1] = roughnessValue;
        roughnessImage.data[index + 2] = roughnessValue;
        roughnessImage.data[index + 3] = 255;
      } else {
        colorImage.data[index] = Math.round(baseOceanR);
        colorImage.data[index + 1] = Math.round(baseOceanG);
        colorImage.data[index + 2] = Math.round(baseOceanB);
        colorImage.data[index + 3] = 255;

        const bumpValue = Math.round(10 + oceanNoise * 18);
        bumpImage.data[index] = bumpValue;
        bumpImage.data[index + 1] = bumpValue;
        bumpImage.data[index + 2] = bumpValue;
        bumpImage.data[index + 3] = 255;

        const roughnessValue = Math.round(56 + oceanNoise * 18);
        roughnessImage.data[index] = roughnessValue;
        roughnessImage.data[index + 1] = roughnessValue;
        roughnessImage.data[index + 2] = roughnessValue;
        roughnessImage.data[index + 3] = 255;
      }
    }
  }

  colorCtx.putImageData(colorImage, 0, 0);
  bumpCtx.putImageData(bumpImage, 0, 0);
  roughCtx.putImageData(roughnessImage, 0, 0);

  colorCtx.globalAlpha = style === 'realistic' ? 0.08 : 0.16;
  colorCtx.strokeStyle = style === 'realistic' ? '#dbeafe' : '#8ec5ff';
  colorCtx.lineWidth = 0.8;
  for (let x = 0; x <= EARTH_MAP_WIDTH; x += 64) {
    colorCtx.beginPath();
    colorCtx.moveTo(x, 0);
    colorCtx.lineTo(x, EARTH_MAP_HEIGHT);
    colorCtx.stroke();
  }
  for (let y = 0; y <= EARTH_MAP_HEIGHT; y += 48) {
    colorCtx.beginPath();
    colorCtx.moveTo(0, y);
    colorCtx.lineTo(EARTH_MAP_WIDTH, y);
    colorCtx.stroke();
  }
  colorCtx.globalAlpha = 1;

  return {
    colorMap: createCanvasTexture(colorCanvas, THREE.SRGBColorSpace),
    bumpMap: createCanvasTexture(bumpCanvas),
    roughnessMap: createCanvasTexture(roughnessCanvas),
  };
}

export function createCloudTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 2048;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return new THREE.CanvasTexture(canvas);
  }

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  for (let index = 0; index < 420; index += 1) {
    const x = Math.random() * canvas.width;
    const y = Math.random() * canvas.height;
    const radiusX = 18 + Math.random() * 62;
    const radiusY = 8 + Math.random() * 28;
    const alpha = 0.035 + Math.random() * 0.055;
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, radiusX);
    gradient.addColorStop(0, `rgba(255,255,255,${alpha})`);
    gradient.addColorStop(0.65, `rgba(255,255,255,${alpha * 0.56})`);
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.ellipse(x, y, radiusX, radiusY, Math.random() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

export function createNightLightsTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 2048;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return new THREE.CanvasTexture(canvas);
  }

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const corridors = [
    [1160, 290, 160, 44],
    [1340, 340, 180, 52],
    [350, 260, 130, 40],
    [760, 300, 210, 56],
    [900, 540, 160, 48],
    [1570, 350, 150, 42],
  ];

  corridors.forEach(([x, y, rx, ry]) => {
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, rx);
    gradient.addColorStop(0, 'rgba(255,190,92,0.18)');
    gradient.addColorStop(0.45, 'rgba(255,160,60,0.11)');
    gradient.addColorStop(1, 'rgba(255,120,40,0)');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
  });

  for (let index = 0; index < 950; index += 1) {
    const x = Math.random() * canvas.width;
    const y = Math.random() * canvas.height;
    const radius = 0.6 + Math.random() * 1.8;
    ctx.fillStyle = `rgba(255, ${170 + Math.random() * 60}, ${80 + Math.random() * 40}, ${0.12 + Math.random() * 0.32})`;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

export interface MarkerCluster {
  id: string;
  lat: number;
  lng: number;
  count: number;
  points: DestinationPoint[];
}

export function clusterDestinations(
  points: readonly DestinationPoint[],
  zoomDistance: number,
): MarkerCluster[] {
  const latBucket = zoomDistance > 3.35 ? 28 : 18;
  const lngBucket = zoomDistance > 3.35 ? 34 : 22;
  const buckets = new Map<string, DestinationPoint[]>();

  for (const point of points) {
    const latKey = Math.round(point.lat / latBucket);
    const lngKey = Math.round(point.lng / lngBucket);
    const key = `${latKey}:${lngKey}`;
    const current = buckets.get(key);
    if (current) current.push(point);
    else buckets.set(key, [point]);
  }

  return [...buckets.entries()].map(([key, bucketPoints]) => {
    const lat = bucketPoints.reduce((sum, point) => sum + point.lat, 0) / bucketPoints.length;
    const lng = bucketPoints.reduce((sum, point) => sum + point.lng, 0) / bucketPoints.length;
    return {
      id: key,
      lat,
      lng,
      count: bucketPoints.length,
      points: bucketPoints,
    };
  });
}

export function estimateRoute(
  origin: OriginPreset,
  destination: DestinationPoint,
  mode: TravelMode,
) {
  const distanceKm = haversineDistanceKm(origin.lat, origin.lng, destination.lat, destination.lng);
  const speedKmH: Record<TravelMode, number> = {
    drive: 78,
    bus: 58,
    walk: 5,
    bike: 16,
  };
  const transferFactor: Record<TravelMode, number> = {
    drive: 1.12,
    bus: 1.22,
    walk: 1.05,
    bike: 1.09,
  };

  const adjustedDistanceKm = distanceKm * transferFactor[mode];
  const durationHours = adjustedDistanceKm / speedKmH[mode];

  const routeNodes = [origin.city, '中转节点', destination.city];

  return {
    distanceKm: adjustedDistanceKm,
    durationHours,
    routeNodes,
  };
}

export function estimateTripCost(
  origin: OriginPreset,
  destination: DestinationPoint,
  mode: TravelMode,
) {
  const route = estimateRoute(origin, destination, mode);
  const transportPerKm: Record<TravelMode, number> = {
    drive: 0.92,
    bus: 0.42,
    walk: 0.04,
    bike: 0.12,
  };
  const comfortFactor = { high: 1.28, medium: 1, low: 0.84 }[origin.budgetBand];
  const transportBase = route.distanceKm * transportPerKm[mode] * comfortFactor;
  const lodging = destination.stayCny * (mode === 'walk' ? 2.2 : 1.4);
  const dining = destination.mealCny * (mode === 'walk' ? 2.8 : 1.8);
  const ticket = destination.ticketCny;

  const base = transportBase + lodging + dining + ticket;
  return {
    transport: Math.round(transportBase),
    ticket: Math.round(ticket),
    lodging: Math.round(lodging),
    dining: Math.round(dining),
    minTotal: Math.round(base * 0.85),
    maxTotal: Math.round(base * 1.18),
  };
}
