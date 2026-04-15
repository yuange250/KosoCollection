import { useFrame, useThree, type ThreeElements, type ThreeEvent } from '@react-three/fiber';
import { Line, OrbitControls, Stars, Text } from '@react-three/drei';
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import ThreeGlobe from 'three-globe';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import type { DestinationPoint } from '@/lib/worldsceneData';
import {
  CHINA_CITY_HOTSPOTS as CHINA_CITY_HOTSPOTS_META,
  chinaCityHotspotLimitByZoom,
} from '@/lib/worldsceneDisplayMeta';
import {
  createCloudTexture,
  latLngToVector3,
  vector3ToLatLng,
} from '@/lib/worldsceneUtils';
import type { RouteState } from '@/types/worldscene';

interface GlobeCountryFeature {
  properties?: {
    NAME?: string;
    name?: string;
  };
  geometry: {
    type: string;
    coordinates: unknown;
  };
}

interface GlobeBoundaryPath {
  id: string;
  points: Array<{ lat: number; lng: number }>;
}

interface TerrainSampleData {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

function gradeColor(grade: DestinationPoint['grade']) {
  if (grade === '5A') return '#fbbf24';
  if (grade === '精品') return '#22d3ee';
  return '#cbd5e1';
}

function buildBoundaryPaths(features: GlobeCountryFeature[]) {
  const paths: GlobeBoundaryPath[] = [];

  features.forEach((feature, featureIndex) => {
    const geometry = feature.geometry;
    if (!geometry?.coordinates) return;

    const pushRing = (ring: unknown, ringIndex: number) => {
      if (!Array.isArray(ring) || ring.length < 2) return;
      const points = ring
        .map((coord) => {
          if (!Array.isArray(coord) || coord.length < 2) return null;
          const [lng, lat] = coord;
          if (typeof lat !== 'number' || typeof lng !== 'number') return null;
          return { lat, lng };
        })
        .filter((point): point is { lat: number; lng: number } => point !== null);

      if (points.length > 1) {
        paths.push({ id: `${featureIndex}-${ringIndex}`, points });
      }
    };

    if (geometry.type === 'Polygon') {
      pushRing(Array.isArray(geometry.coordinates) ? geometry.coordinates[0] : null, 0);
    }

    if (geometry.type === 'MultiPolygon' && Array.isArray(geometry.coordinates)) {
      geometry.coordinates.forEach((polygon, polygonIndex) => {
        if (Array.isArray(polygon)) {
          pushRing(polygon[0], polygonIndex);
        }
      });
    }
  });

  return paths;
}

function buildBoundaryVectors(paths: GlobeBoundaryPath[], radius = 1.0015) {
  return paths.map((path) => ({
    id: path.id,
    points: path.points.map((point) => latLngToVector3(point.lat, point.lng, radius)),
  }));
}

const DEFAULT_VIEW = {
  lat: 35,
  lng: 105,
  distance: 3.9,
};

const REALISTIC_GLOBE_RADIUS = 1;
const REALISTIC_DISPLACEMENT_SCALE_FAR = 0.04;
const REALISTIC_DISPLACEMENT_SCALE_NEAR = 0.045;
const REALISTIC_DISPLACEMENT_BIAS = -0.002;

function sampleTerrainHeight(
  sampler: TerrainSampleData | null,
  lat: number,
  lng: number,
) {
  if (!sampler) return 0;

  const u = ((((lng + 180) / 360) % 1) + 1) % 1;
  const v = THREE.MathUtils.clamp((90 - lat) / 180, 0, 1);
  const x = Math.min(sampler.width - 1, Math.max(0, Math.round(u * (sampler.width - 1))));
  const y = Math.min(sampler.height - 1, Math.max(0, Math.round(v * (sampler.height - 1))));
  const index = (y * sampler.width + x) * 4;
  const value =
    (sampler.data[index] + sampler.data[index + 1] + sampler.data[index + 2]) / (255 * 3);

  return THREE.MathUtils.smoothstep(value, 0.2, 0.92);
}

function sampleTerrainEnvelopeHeight(
  sampler: TerrainSampleData | null,
  lat: number,
  lng: number,
  sampleRadius = 2,
) {
  if (!sampler) return 0;

  const u = ((((lng + 180) / 360) % 1) + 1) % 1;
  const v = THREE.MathUtils.clamp((90 - lat) / 180, 0, 1);
  const centerX = Math.min(sampler.width - 1, Math.max(0, Math.round(u * (sampler.width - 1))));
  const centerY = Math.min(sampler.height - 1, Math.max(0, Math.round(v * (sampler.height - 1))));

  let maxValue = 0;
  for (let offsetY = -sampleRadius; offsetY <= sampleRadius; offsetY += 1) {
    for (let offsetX = -sampleRadius; offsetX <= sampleRadius; offsetX += 1) {
      const x = Math.min(sampler.width - 1, Math.max(0, centerX + offsetX));
      const y = Math.min(sampler.height - 1, Math.max(0, centerY + offsetY));
      const index = (y * sampler.width + x) * 4;
      const value =
        (sampler.data[index] + sampler.data[index + 1] + sampler.data[index + 2]) / (255 * 3);

      maxValue = Math.max(maxValue, value);
    }
  }

  return THREE.MathUtils.smoothstep(maxValue, 0.2, 0.92);
}

function sampleTerrainMarkerHeight(
  sampler: TerrainSampleData | null,
  lat: number,
  lng: number,
  nearDetailMode: boolean,
) {
  const centerHeight = sampleTerrainHeight(sampler, lat, lng);
  const envelopeHeight = sampleTerrainEnvelopeHeight(
    sampler,
    lat,
    lng,
    nearDetailMode ? 4 : 2,
  );

  return Math.max(
    centerHeight,
    THREE.MathUtils.lerp(centerHeight, envelopeHeight, nearDetailMode ? 0.85 : 0.6),
  );
}

function terrainSurfaceRadius(terrainHeight: number, nearDetailMode: boolean) {
  const displacementScale = nearDetailMode
    ? REALISTIC_DISPLACEMENT_SCALE_NEAR
    : REALISTIC_DISPLACEMENT_SCALE_FAR;

  return REALISTIC_GLOBE_RADIUS + terrainHeight * displacementScale + REALISTIC_DISPLACEMENT_BIAS;
}

function terrainMarkerRadius(
  terrainHeight: number,
  nearDetailMode: boolean,
  markerRadius: number,
  clearance = 0.004,
) {
  return terrainSurfaceRadius(terrainHeight, nearDetailMode) + markerRadius + clearance;
}

function HorizonVisibilityGroup({
  position,
  minFrontness = 0.035,
  children,
  ...rest
}: Omit<ThreeElements['group'], 'position'> & {
  position: THREE.Vector3;
  minFrontness?: number;
  children: ReactNode;
}) {
  const groupRef = useRef<THREE.Group | null>(null);
  const { camera } = useThree();

  useFrame(() => {
    const group = groupRef.current;
    if (!group) return;
    const frontness = group.position.clone().normalize().dot(camera.position.clone().normalize());
    group.visible = frontness > minFrontness;
  });

  return (
    <group ref={groupRef} position={position} {...rest}>
      {children}
    </group>
  );
}

interface Props {
  onMarkerHover: (value: string | null) => void;
  onSelect: (point: DestinationPoint) => void;
  onSurfaceHover: (value: { lat: number; lng: number } | null) => void;
  onZoomChange: (value: number) => void;
  points: readonly DestinationPoint[];
  resetSignal: number;
  rotationLocked: boolean;
  route: RouteState | null;
  selectedPoint: DestinationPoint | null;
  textureMode: 'realistic' | 'grid';
  zoomDistance: number;
}

export function WorldSceneGlobeScene({
  onMarkerHover,
  onSelect,
  onSurfaceHover,
  onZoomChange,
  points,
  resetSignal,
  rotationLocked,
  route,
  selectedPoint,
  textureMode,
  zoomDistance,
}: Props) {
  const controlsRef = useRef<OrbitControlsImpl | null>(null);
  const cloudRef = useRef<THREE.Mesh | null>(null);
  const { camera, gl } = useThree();
  const globeYaw = -Math.PI / 2;
  const desiredDistance = useRef(DEFAULT_VIEW.distance);
  const desiredCameraPosition = useRef(
    latLngToVector3(DEFAULT_VIEW.lat, DEFAULT_VIEW.lng, DEFAULT_VIEW.distance),
  );
  const autoCenteringRef = useRef(false);
  const idlePreviewTimerRef = useRef(0);
  const focusedIdRef = useRef<string | null>(null);
  const zoomReportRef = useRef(3.9);
  const [countryFeatures, setCountryFeatures] = useState<GlobeCountryFeature[]>([]);
  const [chinaProvinceFeatures, setChinaProvinceFeatures] = useState<GlobeCountryFeature[]>([]);
  const [terrainSampler, setTerrainSampler] = useState<TerrainSampleData | null>(null);
  const [idlePreviewIds, setIdlePreviewIds] = useState<string[]>([]);
  const globe = useMemo(() => new ThreeGlobe({ waitForGlobeReady: true, animateIn: true }), []);
  const textureLoader = useMemo(() => new THREE.TextureLoader(), []);
  const cloudTexture = useMemo(() => createCloudTexture(), []);
  const dayTexture = useMemo(() => textureLoader.load('/globe/earth-blue-marble.jpg'), [textureLoader]);
  const dayTextureHires = useMemo(
    () => textureLoader.load('/globe/earth-blue-marble-hires-april.jpg'),
    [textureLoader],
  );
  const bumpTexture = useMemo(() => textureLoader.load('/globe/earth-topology.png'), [textureLoader]);
  const waterTexture = useMemo(() => textureLoader.load('/globe/earth-water.png'), [textureLoader]);
  const markerScale = useMemo(() => {
    const normalized = THREE.MathUtils.clamp((zoomDistance - 1.5) / 2.6, 0, 1);
    return THREE.MathUtils.lerp(0.34, 1, normalized);
  }, [zoomDistance]);
  const nearDetailMode = zoomDistance <= 2.55;

  const pointColumns = useMemo(
    () =>
      points.map((point) => ({
        ...point,
        color: point.id === selectedPoint?.id ? '#fde68a' : gradeColor(point.grade),
        altitude: point.id === selectedPoint?.id ? 0.15 : 0.075,
        radius: point.id === selectedPoint?.id ? 0.28 : 0.16,
      })),
    [points, selectedPoint],
  );

  const routeArcs = useMemo(() => {
    if (!route || !selectedPoint) return [];
    return [
      {
        startLat: route.origin.lat,
        startLng: route.origin.lng,
        endLat: selectedPoint.lat,
        endLng: selectedPoint.lng,
      },
    ];
  }, [route, selectedPoint]);

  const countryPaths = useMemo(() => buildBoundaryPaths(countryFeatures), [countryFeatures]);
  const countryPathVectors = useMemo(() => buildBoundaryVectors(countryPaths), [countryPaths]);
  const chinaProvincePaths = useMemo(
    () => buildBoundaryPaths(chinaProvinceFeatures),
    [chinaProvinceFeatures],
  );
  const chinaProvinceVectors = useMemo(
    () => buildBoundaryVectors(chinaProvincePaths, 1.0021),
    [chinaProvincePaths],
  );
  const chinaCityHotspots = useMemo(() => {
    if (!nearDetailMode) return [];
    return CHINA_CITY_HOTSPOTS_META
      .slice()
      .sort((left, right) => right.priority - left.priority)
      .slice(0, chinaCityHotspotLimitByZoom(zoomDistance))
      .map((city) => {
        const terrainHeight = sampleTerrainMarkerHeight(
          terrainSampler,
          city.lat,
          city.lng,
          nearDetailMode,
        );
        const markerRadius = 0.0048 * markerScale;
        return {
          ...city,
          position: latLngToVector3(
            city.lat,
            city.lng,
            terrainMarkerRadius(terrainHeight, nearDetailMode, markerRadius, 0.003),
          ),
        };
      });
  }, [markerScale, nearDetailMode, terrainSampler, zoomDistance]);

  const ringData = useMemo(() => {
    if (!selectedPoint) return [];
    return [
      {
        lat: selectedPoint.lat,
        lng: selectedPoint.lng,
        color: () => 'rgba(125, 211, 252, 0.9)',
      },
    ];
  }, [selectedPoint]);

  const selectedMarker = useMemo(() => {
    if (!selectedPoint) return null;
    const terrainHeight = sampleTerrainMarkerHeight(
      terrainSampler,
      selectedPoint.lat,
      selectedPoint.lng,
      nearDetailMode,
    );
    const pointRadius = 0.018 * markerScale;
    const surfaceRadius = terrainMarkerRadius(
      terrainHeight,
      nearDetailMode,
      pointRadius,
      0.0035,
    );
    return {
      surface: latLngToVector3(selectedPoint.lat, selectedPoint.lng, surfaceRadius),
      beacon: latLngToVector3(
        selectedPoint.lat,
        selectedPoint.lng,
        surfaceRadius + 0.055 + 0.018 * markerScale,
      ),
    };
  }, [markerScale, nearDetailMode, selectedPoint, terrainSampler]);

  const idlePreviewPoints = useMemo(
    () => points.filter((point) => idlePreviewIds.includes(point.id)),
    [idlePreviewIds, points],
  );

  useEffect(() => {
    let active = true;
    fetch('/globe/countries.geojson')
      .then((response) => response.json())
      .then((data) => {
        if (!active) return;
        const nextFeatures = Array.isArray(data?.features) ? data.features : [];
        setCountryFeatures(
          nextFeatures.filter((feature: GlobeCountryFeature) => {
            const name = feature?.properties?.NAME ?? feature?.properties?.name ?? '';
            return name !== 'Antarctica';
          }),
        );
      })
      .catch(() => {
        if (!active) return;
        setCountryFeatures([]);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    fetch('/globe/china-provinces.geojson')
      .then((response) => response.json())
      .then((data) => {
        if (!active) return;
        const nextFeatures = Array.isArray(data?.features) ? data.features : [];
        setChinaProvinceFeatures(nextFeatures);
      })
      .catch(() => {
        if (!active) return;
        setChinaProvinceFeatures([]);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const maxAnisotropy = gl.capabilities.getMaxAnisotropy();
    dayTexture.colorSpace = THREE.SRGBColorSpace;
    dayTexture.anisotropy = maxAnisotropy;
    dayTextureHires.colorSpace = THREE.SRGBColorSpace;
    dayTextureHires.anisotropy = maxAnisotropy;
    bumpTexture.colorSpace = THREE.NoColorSpace;
    bumpTexture.anisotropy = maxAnisotropy;
    waterTexture.colorSpace = THREE.NoColorSpace;
    waterTexture.anisotropy = maxAnisotropy;

    globe
      .showGlobe(textureMode === 'grid')
      .showAtmosphere(true)
      .atmosphereColor('#6dd3ff')
      .atmosphereAltitude(0.17)
      .showGraticules(textureMode === 'grid')
      .polygonsTransitionDuration(350)
      .pointsTransitionDuration(300)
      .arcsTransitionDuration(450)
      .ringRepeatPeriod(720)
      .ringPropagationSpeed(1.3)
      .ringMaxRadius(3.5);

    if (textureMode === 'grid') {
      globe.globeImageUrl('/globe/earth-dark.jpg').bumpImageUrl('/globe/earth-topology.png');
    }

    const globeMaterial = globe.globeMaterial() as THREE.MeshPhongMaterial;
    globeMaterial.map = textureMode === 'grid' ? null : globeMaterial.map;
    globeMaterial.bumpMap = textureMode === 'grid' ? bumpTexture : globeMaterial.bumpMap;
    globeMaterial.bumpScale = textureMode === 'grid' ? 2.6 : 0;
    globeMaterial.shininess = textureMode === 'grid' ? 8 : 0;
    globeMaterial.specular = new THREE.Color(textureMode === 'grid' ? '#1d4f73' : '#000000');
    globeMaterial.specularMap = null;
    globeMaterial.emissive = new THREE.Color(textureMode === 'grid' ? '#071523' : '#000000');
    globeMaterial.emissiveMap = null;
    globeMaterial.emissiveIntensity = textureMode === 'grid' ? 0.12 : 0;
    globeMaterial.color = new THREE.Color(textureMode === 'grid' ? '#0d1624' : '#ffffff');
    globeMaterial.needsUpdate = true;
  }, [gl, globe, textureMode, dayTexture, dayTextureHires, bumpTexture, waterTexture]);

  useEffect(() => {
    const image = bumpTexture.image as { width?: number; height?: number } | undefined;
    if (!image?.width || !image?.height || typeof document === 'undefined') return;

    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(image as CanvasImageSource, 0, 0, canvas.width, canvas.height);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    setTerrainSampler({
      data: imageData.data,
      width: canvas.width,
      height: canvas.height,
    });

    return () => {
      setTerrainSampler(null);
    };
  }, [bumpTexture]);

  useEffect(() => () => {
    cloudTexture.dispose();
    dayTexture.dispose();
    dayTextureHires.dispose();
    bumpTexture.dispose();
    waterTexture.dispose();
  }, [cloudTexture, dayTexture, dayTextureHires, bumpTexture, waterTexture]);

  useEffect(() => {
    if (textureMode === 'grid') {
      globe
        .polygonsData(countryFeatures)
        .polygonGeoJsonGeometry('geometry')
        .polygonCapColor(() => 'rgba(56, 189, 248, 0.08)')
        .polygonSideColor(() => 'rgba(0, 0, 0, 0)')
        .polygonStrokeColor(() => 'rgba(125, 211, 252, 0.3)')
        .polygonCapCurvatureResolution(1.5)
        .polygonAltitude(0.004)
        .pathsData([]);
      return;
    }

    globe.polygonsData([]).pathsData([]);
  }, [countryFeatures, globe, textureMode]);

  useEffect(() => {
    if (textureMode === 'realistic') {
      globe.pointsData([]);
      return;
    }

    globe
      .pointsData(pointColumns)
      .pointLat('lat')
      .pointLng('lng')
      .pointColor('color')
      .pointAltitude('altitude')
      .pointRadius('radius')
      .pointResolution(14)
      .pointsMerge(false);
  }, [globe, pointColumns, textureMode]);

  useEffect(() => {
    globe
      .arcsData(routeArcs)
      .arcColor(() => '#fb923c')
      .arcAltitude(0.18)
      .arcStroke(0.85)
      .arcDashLength(0.7)
      .arcDashGap(0.35)
      .arcDashAnimateTime(1600);
  }, [globe, routeArcs]);

  useEffect(() => {
    globe.ringsData(ringData).ringColor('color').ringAltitude(0.01);
  }, [globe, ringData]);

  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls) return;
    controls.touches.ONE = THREE.TOUCH.ROTATE;
    controls.touches.TWO = THREE.TOUCH.DOLLY_ROTATE;
    controls.target.set(0, 0, 0);
    camera.position.copy(desiredCameraPosition.current);
    camera.lookAt(0, 0, 0);
    const stopAutoCenter = () => {
      autoCenteringRef.current = false;
    };
    controls.addEventListener('start', stopAutoCenter);
    return () => {
      controls.removeEventListener('start', stopAutoCenter);
    };
  }, [camera]);

  useEffect(() => {
    if (selectedPoint) {
      setIdlePreviewIds([]);
    }
  }, [selectedPoint]);

  useEffect(() => {
    desiredDistance.current = selectedPoint ? 2.2 : 3.9;
    if (!selectedPoint || focusedIdRef.current === selectedPoint.id) return;
    focusedIdRef.current = selectedPoint.id;
    const controls = controlsRef.current;
    if (!controls) return;
    const nextDirection = latLngToVector3(selectedPoint.lat, selectedPoint.lng, 1).normalize();
    desiredCameraPosition.current.copy(nextDirection.multiplyScalar(desiredDistance.current));
    autoCenteringRef.current = true;
    controls.target.set(0, 0, 0);
    controls.update();
  }, [selectedPoint]);

  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls) return;
    desiredDistance.current = DEFAULT_VIEW.distance;
    desiredCameraPosition.current.copy(
      latLngToVector3(DEFAULT_VIEW.lat, DEFAULT_VIEW.lng, DEFAULT_VIEW.distance),
    );
    autoCenteringRef.current = true;
    controls.target.set(0, 0, 0);
    controls.update();
  }, [resetSignal]);

  useFrame(() => {
    let nextLength = camera.position.length();
    if (autoCenteringRef.current) {
      const currentDirection = camera.position.clone().normalize();
      const targetDirection = desiredCameraPosition.current.clone().normalize();
      currentDirection.lerp(targetDirection, 0.08).normalize();
      nextLength = THREE.MathUtils.lerp(camera.position.length(), desiredDistance.current, 0.08);
      camera.position.copy(currentDirection.multiplyScalar(nextLength));
      camera.lookAt(0, 0, 0);

      const angleDelta = currentDirection.angleTo(targetDirection);
      const distanceDelta = Math.abs(nextLength - desiredDistance.current);
      if (angleDelta < 0.01 && distanceDelta < 0.02) {
        autoCenteringRef.current = false;
      }
    }

    if (!selectedPoint && !rotationLocked && !autoCenteringRef.current) {
      camera.position.applyAxisAngle(new THREE.Vector3(0, 1, 0), 0.0012);
      camera.lookAt(0, 0, 0);

      idlePreviewTimerRef.current += 1;
      if (idlePreviewTimerRef.current >= 210) {
        idlePreviewTimerRef.current = 0;
        const cameraDirection = camera.position.clone().normalize();
        const nextPreviewIds = points
          .map((point) => {
            const terrainHeight = sampleTerrainHeight(terrainSampler, point.lat, point.lng);
            const position = latLngToVector3(
              point.lat,
              point.lng,
              terrainSurfaceRadius(terrainHeight, nearDetailMode) + 0.01,
            );
            const frontness = position.clone().normalize().dot(cameraDirection);
            return { point, frontness };
          })
          .filter((entry) => entry.frontness > 0.72)
          .sort((a, b) => b.frontness - a.frontness)
          .slice(0, 3)
          .map((entry) => entry.point.id);

        setIdlePreviewIds((prev) => {
          if (
            prev.length === nextPreviewIds.length &&
            prev.every((id, index) => id === nextPreviewIds[index])
          ) {
            return prev;
          }
          return nextPreviewIds;
        });
      }
    }

    if (Math.abs(zoomReportRef.current - nextLength) > 0.025) {
      zoomReportRef.current = nextLength;
      onZoomChange(nextLength);
    }
    if (cloudRef.current) {
      cloudRef.current.rotation.y += 0.00075;
    }
    controlsRef.current?.update();
  });

  return (
    <>
      <color attach="background" args={['#020611']} />
      <ambientLight intensity={1.5} />
      <hemisphereLight intensity={1.1} color="#dbeafe" groundColor="#08111e" />
      <directionalLight position={[4.8, 3, 4]} intensity={3.2} color="#e0f2fe" />
      <directionalLight position={[-3.2, -2.4, -4]} intensity={1.15} color="#67e8f9" />
      <pointLight position={[0, 0, 4.6]} intensity={1.2} color="#7dd3fc" />
      <Stars radius={95} depth={52} count={2400} factor={5.4} saturation={0} fade speed={0.8} />

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.5, 0]}>
        <ringGeometry args={[0.88, 1.74, 120]} />
        <meshBasicMaterial color="#0f2740" transparent opacity={0.4} side={THREE.DoubleSide} />
      </mesh>

      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <ringGeometry args={[1.15, 1.17, 128]} />
        <meshBasicMaterial color="#38bdf8" transparent opacity={0.18} side={THREE.DoubleSide} />
      </mesh>

      <mesh rotation={[THREE.MathUtils.degToRad(68), THREE.MathUtils.degToRad(14), 0]}>
        <torusGeometry args={[1.18, 0.004, 12, 180]} />
        <meshBasicMaterial color="#67e8f9" transparent opacity={0.16} />
      </mesh>

      <mesh>
        <sphereGeometry args={[1.11, 64, 64]} />
        <meshBasicMaterial color="#60a5fa" transparent opacity={0.05} side={THREE.BackSide} />
      </mesh>

      <group rotation={[0, globeYaw, 0]}>
        {textureMode === 'realistic' && (
          <mesh>
            <sphereGeometry args={[1, nearDetailMode ? 320 : 256, nearDetailMode ? 320 : 256]} />
            <meshPhongMaterial
              map={nearDetailMode ? dayTextureHires : dayTexture}
              bumpMap={bumpTexture}
              bumpScale={nearDetailMode ? 10 : 8}
              displacementMap={bumpTexture}
              displacementScale={nearDetailMode ? 0.045 : 0.04}
              displacementBias={-0.002}
              specularMap={waterTexture}
              specular={new THREE.Color('#9fd8f5')}
              shininess={nearDetailMode ? 26 : 20}
            />
          </mesh>
        )}

        {textureMode === 'realistic' && (
          <mesh ref={cloudRef}>
            <sphereGeometry args={[1.028, 72, 72]} />
            <meshStandardMaterial
              map={cloudTexture}
              transparent
              opacity={0.22}
              depthWrite={false}
              blending={THREE.AdditiveBlending}
            />
          </mesh>
        )}
      </group>

      <mesh
        visible={false}
        onPointerMove={(event: ThreeEvent<PointerEvent>) => onSurfaceHover(vector3ToLatLng(event.point))}
        onPointerOut={() => onSurfaceHover(null)}
      >
        <sphereGeometry args={[1.02, 96, 96]} />
        <meshBasicMaterial transparent opacity={0} />
      </mesh>

      {textureMode === 'realistic' &&
        countryPathVectors.map((path) => (
          <Line
            key={path.id}
            points={path.points.map((point, index) => {
              const latLng = countryPaths.find((entry) => entry.id === path.id)?.points[index];
              if (!latLng) return point;
              const terrainHeight = sampleTerrainHeight(terrainSampler, latLng.lat, latLng.lng);
              return latLngToVector3(
                latLng.lat,
                latLng.lng,
                terrainSurfaceRadius(terrainHeight, nearDetailMode) + 0.003,
              );
            })}
            color="#d2ecff"
            lineWidth={0.35}
            transparent
            opacity={0.18}
          />
        ))}

      {textureMode === 'realistic' &&
        nearDetailMode &&
        chinaProvinceVectors.map((path) => (
          <Line
            key={`cn-${path.id}`}
            points={path.points.map((point) => point.clone().multiplyScalar(1.0008))}
            color="#d8f2ff"
            lineWidth={0.28}
            transparent
            opacity={0.3}
          />
        ))}

      {textureMode === 'realistic' &&
        nearDetailMode &&
        !selectedPoint &&
        chinaCityHotspots.map((city) => (
          <HorizonVisibilityGroup key={city.id} position={city.position} minFrontness={0.05}>
            <mesh renderOrder={22}>
              <sphereGeometry args={[0.0048 * markerScale, 10, 10]} />
              <meshBasicMaterial
                color="#d8f2ff"
                transparent
                opacity={0.95}
                depthTest={false}
                depthWrite={false}
              />
            </mesh>
            <Text
              position={[0, 0.012 * markerScale + 0.003, 0]}
              fontSize={0.012 * markerScale}
              color="#d8f2ff"
              anchorX="center"
              anchorY="bottom"
              maxWidth={0.16}
              textAlign="center"
              outlineWidth={0.0018}
              outlineColor="#07111d"
              renderOrder={23}
            >
              {city.name}
            </Text>
          </HorizonVisibilityGroup>
        ))}

      {selectedMarker && selectedPoint && (
        <HorizonVisibilityGroup position={selectedMarker.surface} minFrontness={0.02}>
          <Line
            points={[
              new THREE.Vector3(0, 0, 0),
              selectedMarker.beacon.clone().sub(selectedMarker.surface),
            ]}
            color="#7dd3fc"
            lineWidth={markerScale <= 0.58 ? 0.72 : 1.0}
            transparent
            opacity={0.62}
            depthTest={false}
            renderOrder={24}
          />
          <mesh renderOrder={25}>
            <sphereGeometry args={[0.018 * markerScale, 14, 14]} />
            <meshStandardMaterial
              color="#f8fafc"
              emissive="#7dd3fc"
              emissiveIntensity={0.75}
              depthTest={false}
              depthWrite={false}
            />
          </mesh>
          <mesh position={selectedMarker.beacon.clone().sub(selectedMarker.surface)} renderOrder={26}>
            <sphereGeometry args={[0.011 * markerScale, 14, 14]} />
            <meshBasicMaterial
              color="#fbbf24"
              transparent
              opacity={0.92}
              depthTest={false}
              depthWrite={false}
            />
          </mesh>
          <mesh position={selectedMarker.beacon.clone().sub(selectedMarker.surface)} renderOrder={26}>
            <ringGeometry args={[0.02 * markerScale, 0.03 * markerScale, 32]} />
            <meshBasicMaterial
              color="#fde68a"
              transparent
              opacity={0.32}
              side={THREE.DoubleSide}
              depthTest={false}
              depthWrite={false}
            />
          </mesh>
        </HorizonVisibilityGroup>
      )}

      {points.map((point) => {
        const isSelected = selectedPoint?.id === point.id;
        const terrainHeight = sampleTerrainMarkerHeight(
          terrainSampler,
          point.lat,
          point.lng,
          nearDetailMode,
        );
        const radius = (isSelected ? 0.018 : 0.011) * markerScale;
        const position = latLngToVector3(
          point.lat,
          point.lng,
          terrainMarkerRadius(
            terrainHeight,
            nearDetailMode,
            radius,
            isSelected ? 0.005 : 0.004,
          ),
        );
        return (
          <HorizonVisibilityGroup
            key={point.id}
            position={position}
            onClick={() => onSelect(point)}
            onPointerEnter={() => onMarkerHover(point.name)}
            onPointerLeave={() => onMarkerHover(null)}
          >
            <mesh renderOrder={20}>
              <sphereGeometry args={[radius, 12, 12]} />
              <meshStandardMaterial
                color={isSelected ? '#fde68a' : gradeColor(point.grade)}
                emissive={isSelected ? '#fde68a' : gradeColor(point.grade)}
                emissiveIntensity={0.34}
                depthTest={false}
                depthWrite={false}
              />
            </mesh>
          </HorizonVisibilityGroup>
        );
      })}

      {!selectedPoint &&
        idlePreviewPoints.map((point) => {
          const terrainHeight = sampleTerrainMarkerHeight(
            terrainSampler,
            point.lat,
            point.lng,
            nearDetailMode,
          );
          const previewRadius = 0.007 * markerScale;
          const position = latLngToVector3(
            point.lat,
            point.lng,
            terrainMarkerRadius(
              terrainHeight,
              nearDetailMode,
              previewRadius,
              0.012 * markerScale + 0.006,
            ),
          );
          return (
            <HorizonVisibilityGroup
              key={`idle-${point.id}`}
              position={position}
              minFrontness={0.06}
              onClick={() => onSelect(point)}
            >
              <mesh renderOrder={21}>
                <sphereGeometry args={[previewRadius, 10, 10]} />
                <meshBasicMaterial color="#7dd3fc" depthTest={false} depthWrite={false} />
              </mesh>
              <Text
                position={[0, 0.016 * markerScale + 0.005, 0]}
                fontSize={0.018 * markerScale}
                color="#d8f2ff"
                anchorX="center"
                anchorY="bottom"
                maxWidth={0.24}
                textAlign="center"
                outlineWidth={0.002}
                outlineColor="#08111e"
                renderOrder={22}
              >
                {point.name}
              </Text>
            </HorizonVisibilityGroup>
          );
        })}

      <primitive object={globe} scale={0.01} />

      <OrbitControls
        ref={controlsRef}
        enablePan={false}
        enableRotate={!rotationLocked}
        enableDamping
        dampingFactor={0.07}
        rotateSpeed={0.82}
        zoomSpeed={0.74}
        minDistance={1.5}
        maxDistance={5.6}
      />
    </>
  );
}
