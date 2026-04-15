import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { Html, Line, OrbitControls, Stars } from '@react-three/drei';
import { AnimatePresence, motion } from 'framer-motion';
import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Link } from 'react-router-dom';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { BackToTop } from '@/components/BackToTop';
import {
  CATEGORY_OPTIONS,
  DESTINATION_POINTS,
  ORIGIN_PRESETS,
  PROJECT2_FEATURES,
  PROJECT2_METRICS,
  PROJECT2_PHASE2_NOTES,
  REGION_OPTIONS,
  SEARCH_EXAMPLES,
  TRAVEL_MODE_OPTIONS,
  type DestinationPoint,
  type OriginPreset,
  type TravelMode,
} from '@/lib/project2Data';
import {
  buildArcPoints,
  clusterDestinations,
  createCloudTexture,
  createEarthMaterialMaps,
  createNightLightsTexture,
  estimateRoute,
  estimateTripCost,
  latLngToVector3,
  searchDestinations,
  vector3ToLatLng,
} from '@/lib/project2Utils';

interface RouteState {
  origin: OriginPreset;
  mode: TravelMode;
  distanceKm: number;
  durationHours: number;
  routeNodes: string[];
}

interface PriceBreakdown {
  transport: number;
  ticket: number;
  lodging: number;
  dining: number;
  minTotal: number;
  maxTotal: number;
}

function gradeColor(grade: DestinationPoint['grade']) {
  if (grade === '5A') return '#fbbf24';
  if (grade === '精品') return '#22d3ee';
  return '#cbd5e1';
}

/** Wikimedia 外链失败时的本地占位（避免裂图） */
function galleryPlaceholder(category: DestinationPoint['category']): string {
  switch (category) {
    case '自然景观':
      return '/placeholders/destination-nature.svg';
    case '人文古迹':
      return '/placeholders/destination-heritage.svg';
    case '城市地标':
      return '/placeholders/destination-city.svg';
    case '海岛度假':
      return '/placeholders/destination-coast.svg';
    default:
      return '/placeholders/work-global-atlas.svg';
  }
}

function GlobeScene({
  points,
  selectedPoint,
  route,
  rotationLocked,
  textureMode,
  zoomDistance,
  resetSignal,
  onSelect,
  onSurfaceHover,
  onMarkerHover,
  onZoomChange,
}: {
  points: readonly DestinationPoint[];
  selectedPoint: DestinationPoint | null;
  route: RouteState | null;
  rotationLocked: boolean;
  textureMode: 'realistic' | 'grid';
  zoomDistance: number;
  resetSignal: number;
  onSelect: (point: DestinationPoint) => void;
  onSurfaceHover: (value: { lat: number; lng: number } | null) => void;
  onMarkerHover: (value: string | null) => void;
  onZoomChange: (value: number) => void;
}) {
  const controlsRef = useRef<OrbitControlsImpl | null>(null);
  const { camera } = useThree();
  const earthMaps = useMemo(() => createEarthMaterialMaps(textureMode), [textureMode]);
  const cloudTexture = useMemo(() => createCloudTexture(), []);
  const nightLightsTexture = useMemo(() => createNightLightsTexture(), []);
  const desiredDistance = useRef(3.38);
  const focusedIdRef = useRef<string | null>(null);
  const cloudRef = useRef<THREE.Mesh | null>(null);
  const atmosphereRef = useRef<THREE.Mesh | null>(null);
  const lightsRef = useRef<THREE.Mesh | null>(null);
  const zoomReportRef = useRef(3.38);
  const sunDirection = useMemo(() => new THREE.Vector3(1.1, 0.35, 1.6).normalize(), []);

  useEffect(
    () => () => {
      earthMaps.colorMap.dispose();
      earthMaps.bumpMap.dispose();
      earthMaps.roughnessMap.dispose();
    },
    [earthMaps],
  );
  useEffect(() => () => cloudTexture.dispose(), [cloudTexture]);
  useEffect(() => () => nightLightsTexture.dispose(), [nightLightsTexture]);

  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls) return;
    controls.touches.ONE = THREE.TOUCH.ROTATE;
    controls.touches.TWO = THREE.TOUCH.DOLLY_ROTATE;
    controls.target.set(0, 0, 0);
  }, []);

  useEffect(() => {
    desiredDistance.current = selectedPoint ? 2.16 : 3.38;
    if (!selectedPoint || focusedIdRef.current === selectedPoint.id) return;
    focusedIdRef.current = selectedPoint.id;
    const controls = controlsRef.current;
    if (!controls) return;

    const azimuth = -THREE.MathUtils.degToRad(selectedPoint.lng) + Math.PI / 2;
    const polar = THREE.MathUtils.clamp(
      THREE.MathUtils.degToRad(90 - selectedPoint.lat),
      0.45,
      Math.PI - 0.45,
    );

    controls.setAzimuthalAngle(azimuth);
    controls.setPolarAngle(polar);
    controls.update();
  }, [selectedPoint]);

  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls) return;
    desiredDistance.current = 3.38;
    controls.setAzimuthalAngle(0);
    controls.setPolarAngle(Math.PI / 2);
    controls.update();
  }, [resetSignal]);

  useFrame(() => {
    const nextLength = THREE.MathUtils.lerp(camera.position.length(), desiredDistance.current, 0.08);
    camera.position.setLength(nextLength);
    if (Math.abs(zoomReportRef.current - nextLength) > 0.025) {
      zoomReportRef.current = nextLength;
      onZoomChange(nextLength);
    }
    if (lightsRef.current) lightsRef.current.rotation.y += 0.00035;
    if (cloudRef.current) cloudRef.current.rotation.y += 0.0007;
    if (atmosphereRef.current) atmosphereRef.current.rotation.y -= 0.00024;
    controlsRef.current?.update();
  });

  const showMarkers = zoomDistance <= 3.02;
  const showClusters = zoomDistance > 3.02 && zoomDistance <= 4.55;
  const arcPoints = useMemo(() => {
    if (!route || !selectedPoint) return null;
    return buildArcPoints(route.origin, selectedPoint, 80);
  }, [route, selectedPoint]);
  const clusters = useMemo(() => clusterDestinations(points, zoomDistance), [points, zoomDistance]);
  const selectedMarker = useMemo(() => {
    if (!selectedPoint) return null;
    return {
      surface: latLngToVector3(selectedPoint.lat, selectedPoint.lng, 1.08),
      beacon: latLngToVector3(selectedPoint.lat, selectedPoint.lng, 1.36),
    };
  }, [selectedPoint]);

  return (
    <>
      <ambientLight intensity={1.16} />
      <hemisphereLight intensity={1.15} color="#dbeafe" groundColor="#08111e" />
      <directionalLight position={[5, 3, 4]} intensity={3.4} color="#dbeafe" />
      <directionalLight position={[-4, -1.8, -4]} intensity={1.4} color="#67e8f9" />
      <pointLight position={[0, 0, 4.2]} intensity={1.45} color="#67e8f9" />
      <pointLight position={[0, -2.4, -1.2]} intensity={0.8} color="#a855f7" />
      <Stars radius={90} depth={48} count={1900} factor={4.8} saturation={0} fade speed={0.62} />

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.42, 0]}>
        <ringGeometry args={[0.72, 1.52, 96]} />
        <meshBasicMaterial color="#0f2740" transparent opacity={0.42} side={THREE.DoubleSide} />
      </mesh>

      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <ringGeometry args={[1.27, 1.285, 128]} />
        <meshBasicMaterial color="#38bdf8" transparent opacity={0.23} side={THREE.DoubleSide} />
      </mesh>

      <mesh rotation={[THREE.MathUtils.degToRad(68), THREE.MathUtils.degToRad(14), 0]}>
        <torusGeometry args={[1.23, 0.0045, 12, 180]} />
        <meshBasicMaterial color="#67e8f9" transparent opacity={0.2} />
      </mesh>

      <mesh
        onPointerMove={(event: ThreeEvent<PointerEvent>) => onSurfaceHover(vector3ToLatLng(event.point))}
        onPointerOut={() => onSurfaceHover(null)}
      >
        <sphereGeometry args={[1, 168, 168]} />
        <meshStandardMaterial
          map={earthMaps.colorMap}
          bumpMap={earthMaps.bumpMap}
          bumpScale={textureMode === 'realistic' ? 0.05 : 0.028}
          displacementMap={earthMaps.bumpMap}
          displacementScale={textureMode === 'realistic' ? 0.024 : 0.01}
          roughnessMap={earthMaps.roughnessMap}
          roughness={0.88}
          metalness={0.04}
          emissive={new THREE.Color(textureMode === 'realistic' ? '#0a1c36' : '#081526')}
          emissiveIntensity={0.16}
        />
      </mesh>

      <mesh ref={lightsRef}>
        <sphereGeometry args={[1.006, 72, 72]} />
        <shaderMaterial
          transparent
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          uniforms={{
            lightMap: { value: nightLightsTexture },
            sunDir: { value: sunDirection },
          }}
          vertexShader={`
            varying vec2 vUv;
            varying vec3 vNormalW;
            void main() {
              vUv = uv;
              vNormalW = normalize(normalMatrix * normal);
              gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
          `}
          fragmentShader={`
            uniform sampler2D lightMap;
            uniform vec3 sunDir;
            varying vec2 vUv;
            varying vec3 vNormalW;
            void main() {
              float ndl = dot(normalize(vNormalW), normalize(sunDir));
              float night = smoothstep(0.12, -0.28, ndl);
              vec3 glow = texture2D(lightMap, vUv).rgb;
              float alpha = max(glow.r, max(glow.g, glow.b)) * night * 1.55;
              gl_FragColor = vec4(glow * night * 1.4, alpha);
            }
          `}
        />
      </mesh>

      <mesh ref={cloudRef}>
        <sphereGeometry args={[1.028, 72, 72]} />
        <meshStandardMaterial
          map={cloudTexture}
          transparent
          opacity={0.38}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>

      <mesh ref={atmosphereRef}>
        <sphereGeometry args={[1.03, 64, 64]} />
        <meshBasicMaterial color="#7dd3fc" transparent opacity={0.12} side={THREE.BackSide} />
      </mesh>

      <mesh>
        <sphereGeometry args={[1.09, 64, 64]} />
        <meshBasicMaterial color="#60a5fa" transparent opacity={0.055} side={THREE.BackSide} />
      </mesh>

      {selectedMarker && selectedPoint && (
        <>
          <Line
            points={[selectedMarker.surface, selectedMarker.beacon]}
            color="#7dd3fc"
            lineWidth={1.8}
            transparent
            opacity={0.75}
          />
          <mesh position={selectedMarker.surface}>
            <sphereGeometry args={[0.038, 18, 18]} />
            <meshStandardMaterial color="#f8fafc" emissive="#7dd3fc" emissiveIntensity={0.95} />
          </mesh>
          <mesh position={selectedMarker.beacon}>
            <sphereGeometry args={[0.046, 18, 18]} />
            <meshBasicMaterial color="#fbbf24" transparent opacity={0.92} />
          </mesh>
          <mesh position={selectedMarker.beacon}>
            <ringGeometry args={[0.075, 0.102, 40]} />
            <meshBasicMaterial color="#fde68a" transparent opacity={0.36} side={THREE.DoubleSide} />
          </mesh>
          <Html position={selectedMarker.beacon} center distanceFactor={10.5}>
            <div className="project2-selected-poi">
              <strong>{selectedPoint.name}</strong>
              <span>{formatLatLng(selectedPoint.lat, selectedPoint.lng)}</span>
            </div>
          </Html>
        </>
      )}

      {showMarkers &&
        points.map((point, index) => {
          const position = latLngToVector3(point.lat, point.lng, 1.08 + (index % 3) * 0.008);
          const isSelected = selectedPoint?.id === point.id;
          return (
            <group
              key={point.id}
              position={position}
              onClick={() => onSelect(point)}
              onPointerEnter={() => onMarkerHover(point.name)}
              onPointerLeave={() => onMarkerHover(null)}
            >
              <mesh>
                <sphereGeometry args={[isSelected ? 0.032 : 0.025, 16, 16]} />
                <meshStandardMaterial color={gradeColor(point.grade)} emissive={gradeColor(point.grade)} emissiveIntensity={0.45} />
              </mesh>
              {isSelected && (
                <Html center distanceFactor={12}>
                  <div className="project2-marker-tooltip">{point.name}</div>
                </Html>
              )}
            </group>
          );
        })}

      {showClusters &&
        clusters.map((cluster) => {
          const clusterLead = cluster.points[0];
          const position = latLngToVector3(cluster.lat, cluster.lng, 1.1);
          const isSelected = selectedPoint ? cluster.points.some((point) => point.id === selectedPoint.id) : false;
          return (
            <group
              key={cluster.id}
              position={position}
              onClick={() => onSelect(clusterLead)}
              onPointerEnter={() => onMarkerHover(`${cluster.count} 个景点`)}
              onPointerLeave={() => onMarkerHover(null)}
            >
              <mesh>
                <sphereGeometry args={[isSelected ? 0.055 : 0.05, 18, 18]} />
                <meshStandardMaterial color={isSelected ? '#fbbf24' : '#38bdf8'} emissive={isSelected ? '#fbbf24' : '#38bdf8'} emissiveIntensity={0.4} />
              </mesh>
              <mesh>
                <ringGeometry args={[0.068, 0.084, 36]} />
                <meshBasicMaterial color={isSelected ? '#fbbf24' : '#38bdf8'} transparent opacity={0.28} side={THREE.DoubleSide} />
              </mesh>
              <Html center distanceFactor={10}>
                <button
                  type="button"
                  className={`project2-cluster-badge${isSelected ? ' is-selected' : ''}`}
                  onClick={() => onSelect(clusterLead)}
                >
                  {cluster.count}
                </button>
              </Html>
            </group>
          );
        })}

      {arcPoints && <Line points={arcPoints} color="#fb923c" lineWidth={2.1} transparent opacity={0.95} />}

      <OrbitControls
        ref={controlsRef}
        enablePan={false}
        enableRotate={!rotationLocked}
        enableDamping
        dampingFactor={0.07}
        rotateSpeed={0.82}
        zoomSpeed={0.74}
        minDistance={1.78}
        maxDistance={4.95}
      />
    </>
  );
}

function formatHours(hours: number) {
  if (hours < 1) return `${Math.round(hours * 60)} 分钟`;
  if (hours < 24) return `${hours.toFixed(1)} 小时`;
  return `${(hours / 24).toFixed(1)} 天`;
}

function formatLatLng(lat: number, lng: number) {
  const latLabel = `${Math.abs(lat).toFixed(2)}°${lat >= 0 ? 'N' : 'S'}`;
  const lngLabel = `${Math.abs(lng).toFixed(2)}°${lng >= 0 ? 'E' : 'W'}`;
  return `${latLabel} / ${lngLabel}`;
}

export function Project2() {
  const [activeRegion, setActiveRegion] = useState<(typeof REGION_OPTIONS)[number]>('全部');
  const [activeCategory, setActiveCategory] = useState<(typeof CATEGORY_OPTIONS)[number]>('全部');
  const [selectedId, setSelectedId] = useState<string>(DESTINATION_POINTS[0]?.id ?? '');
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Array<{ point: DestinationPoint; score: number }>>([]);
  const [searchMessage, setSearchMessage] = useState('');
  const [hoverLatLng, setHoverLatLng] = useState<{ lat: number; lng: number } | null>(null);
  const [hoverMarkerName, setHoverMarkerName] = useState<string | null>(null);
  const [rotationLocked, setRotationLocked] = useState(false);
  const [textureMode, setTextureMode] = useState<'realistic' | 'grid'>('realistic');
  const [resetSignal, setResetSignal] = useState(0);
  const [zoomDistance, setZoomDistance] = useState(3.38);
  const [originId, setOriginId] = useState(ORIGIN_PRESETS[0]?.id ?? '');
  const [travelMode, setTravelMode] = useState<TravelMode>('drive');
  const [route, setRoute] = useState<RouteState | null>(null);
  const [priceBreakdown, setPriceBreakdown] = useState<PriceBreakdown | null>(null);
  const [imageIndex, setImageIndex] = useState(0);
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [searchHistory, setSearchHistory] = useState<string[]>([]);
  const [isTouchDevice, setIsTouchDevice] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setFavorites(JSON.parse(window.localStorage.getItem('project2-favorites') ?? '[]'));
    setSearchHistory(JSON.parse(window.localStorage.getItem('project2-search-history') ?? '[]'));
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem('project2-favorites', JSON.stringify(favorites));
  }, [favorites]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem('project2-search-history', JSON.stringify(searchHistory));
  }, [searchHistory]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setIsTouchDevice(window.matchMedia('(pointer: coarse)').matches);
  }, []);

  const visiblePoints = useMemo(() => {
    return DESTINATION_POINTS.filter((point) => {
      const regionMatch = activeRegion === '全部' || point.region === activeRegion;
      const categoryMatch = activeCategory === '全部' || point.category === activeCategory;
      return regionMatch && categoryMatch;
    });
  }, [activeCategory, activeRegion]);

  useEffect(() => {
    if (visiblePoints.length === 0) {
      setSelectedId(DESTINATION_POINTS[0]?.id ?? '');
      return;
    }
    if (!visiblePoints.some((point) => point.id === selectedId)) {
      setSelectedId(visiblePoints[0].id);
    }
  }, [visiblePoints, selectedId]);

  const selectedPoint = useMemo(() => {
    return (
      DESTINATION_POINTS.find((point) => point.id === selectedId) ??
      visiblePoints[0] ??
      DESTINATION_POINTS[0] ??
      null
    );
  }, [selectedId, visiblePoints]);

  const selectedOrigin = useMemo(
    () => ORIGIN_PRESETS.find((origin) => origin.id === originId) ?? ORIGIN_PRESETS[0],
    [originId],
  );

  useEffect(() => {
    setImageIndex(0);
  }, [selectedId]);

  const isFavorite = selectedPoint ? favorites.includes(selectedPoint.id) : false;

  const runSearch = (nextQuery: string) => {
    const trimmed = nextQuery.trim();
    if (!trimmed) {
      setSearchResults([]);
      setSearchMessage('');
      return;
    }

    const matches = searchDestinations(trimmed, DESTINATION_POINTS, 3);
    if (matches.length === 0) {
      setSearchResults([]);
      setSearchMessage(`未找到匹配景点，请尝试更具体的描述，例如：${SEARCH_EXAMPLES.join('、')}`);
      return;
    }

    setSearchResults(matches);
    setSearchMessage(`已匹配 ${matches.length} 个结果，已自动聚焦到最接近的景点。`);
    setActiveRegion('全部');
    setActiveCategory('全部');
    setSelectedId(matches[0].point.id);
    setSearchHistory((prev) => [trimmed, ...prev.filter((item) => item !== trimmed)].slice(0, 6));
  };

  const planRoute = () => {
    if (!selectedPoint || !selectedOrigin) return;
    const estimated = estimateRoute(selectedOrigin, selectedPoint, travelMode);
    setRoute({ origin: selectedOrigin, mode: travelMode, ...estimated });
    setPriceBreakdown(null);
  };

  const estimatePrice = () => {
    if (!selectedPoint || !selectedOrigin) return;
    setPriceBreakdown(estimateTripCost(selectedOrigin, selectedPoint, travelMode));
  };

  const toggleFavorite = () => {
    if (!selectedPoint) return;
    setFavorites((prev) =>
      prev.includes(selectedPoint.id)
        ? prev.filter((id) => id !== selectedPoint.id)
        : [selectedPoint.id, ...prev],
    );
  };

  return (
    <div className="layout">
      <motion.header
        className="nav"
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="nav-inner nav-inner--toolbar">
          <Link to="/" className="nav-logo">
            <span className="nav-logo-mark">
              <span className="nav-logo-mark__inner">KS</span>
            </span>
            <span className="nav-logo-text">科索造物集</span>
          </Link>
          <nav className="nav-links">
            <Link to="/" className="nav-links__a">
              返回作品集
            </Link>
            <Link to="/guide" className="nav-links__a">
              使用指南
            </Link>
            <Link to="/feedback" className="nav-links__a">
              反馈建议
            </Link>
          </nav>
        </div>
      </motion.header>

      <motion.main
        className="project2"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.06, ease: [0.22, 1, 0.36, 1] }}
      >
        <section className="project2-hero">
          <div className="project2-hero__content">
            <p className="project2-eyebrow">作品二 · 3D 地球全球景点平台</p>
            <h1 className="project2-hero__title">在一颗可交互地球上搜索景点、规划路线并估算预算</h1>
            <p className="project2-hero__desc">
              这版实现已经对齐 PRD 的主线能力：Three.js 地球拖拽缩放、50+
              全球景点标记、语义搜索 Top3、路线轨迹展示和旅途价格估算。
            </p>

            <div className="project2-metrics">
              {PROJECT2_METRICS.map((metric) => (
                <div key={metric.label} className="project2-metric">
                  <span className="project2-metric__value">{metric.value}</span>
                  <span className="project2-metric__label">{metric.label}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="project2-hero__visual" aria-hidden="true">
            <div className="project2-orbit project2-orbit--outer" />
            <div className="project2-orbit project2-orbit--inner" />
            <div className="project2-core">
              <span className="project2-core__ring project2-core__ring--a" />
              <span className="project2-core__ring project2-core__ring--b" />
              <span className="project2-core__dot" />
            </div>
          </div>
        </section>

        <section className="project2-section">
          <div className="project2-section__head">
            <p className="project2-section__eyebrow">核心模块</p>
            <h2 className="project2-section__title">3D 浏览、语义搜索、路线与预算在一个工作台里完成</h2>
          </div>
          <div className="project2-feature-grid">
            {PROJECT2_FEATURES.map((feature) => (
              <article key={feature.title} className="project2-feature-card">
                <h3>{feature.title}</h3>
                <p>{feature.description}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="project2-section">
          <div className="project2-toolbar">
            <div className="project2-search-card">
              <label htmlFor="project2-search" className="project2-search-card__label">
                AI 语义搜索
              </label>
              <div className="project2-search-row">
                <input
                  id="project2-search"
                  className="project2-search-input"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') runSearch(query);
                  }}
                  placeholder='输入一句话描述景点，快速找到它（如“法国浪漫铁塔”“中国故宫”）'
                />
                <button type="button" className="btn btn--primary" onClick={() => runSearch(query)}>
                  搜索
                </button>
              </div>
              <div className="project2-search-meta">
                {SEARCH_EXAMPLES.map((example) => (
                  <button
                    key={example}
                    type="button"
                    className="project2-meta-chip"
                    onClick={() => {
                      setQuery(example);
                      runSearch(example);
                    }}
                  >
                    {example}
                  </button>
                ))}
              </div>
              {searchMessage && <p className="project2-helper-text">{searchMessage}</p>}
              {searchResults.length > 0 && (
                <div className="project2-search-results">
                  {searchResults.map((entry, index) => (
                    <button
                      key={entry.point.id}
                      type="button"
                      className="project2-search-hit"
                      onClick={() => setSelectedId(entry.point.id)}
                    >
                      <span>Top {index + 1}</span>
                      <strong>{entry.point.name}</strong>
                      <em>{entry.point.country}</em>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="project2-controls-card">
              <div className="project2-controls-grid">
                <button type="button" className="btn btn--secondary" onClick={() => setResetSignal((value) => value + 1)}>
                  重置视角
                </button>
                <button
                  type="button"
                  className="btn btn--secondary"
                  onClick={() => setRotationLocked((value) => !value)}
                >
                  {rotationLocked ? '解除锁定' : '锁定旋转'}
                </button>
                <button
                  type="button"
                  className="btn btn--secondary"
                  onClick={() => setTextureMode((value) => (value === 'realistic' ? 'grid' : 'realistic'))}
                >
                  {textureMode === 'realistic' ? '切换简化纹理' : '切换真实纹理'}
                </button>
              </div>
              <div className="project2-search-meta">
                <span className="project2-meta-pill">缩放距离 {zoomDistance.toFixed(2)}</span>
                <span className="project2-meta-pill">
                  标记 {zoomDistance <= 3.12 ? '单点' : zoomDistance <= 4.25 ? '聚合' : '隐藏'}
                </span>
                {isTouchDevice && <span className="project2-meta-pill">单指旋转，双指缩放</span>}
                {hoverLatLng && (
                  <span className="project2-meta-pill">
                    经纬度 {hoverLatLng.lat.toFixed(2)}°, {hoverLatLng.lng.toFixed(2)}°
                  </span>
                )}
                {hoverMarkerName && <span className="project2-meta-pill">悬浮 {hoverMarkerName}</span>}
              </div>
            </div>
          </div>
        </section>

        <section className="project2-section">
          <div className="project2-filter-bar">
            <div className="project2-filter-group">
              <span className="project2-filter-group__label">洲别</span>
              {REGION_OPTIONS.map((region) => (
                <button
                  key={region}
                  type="button"
                  className={`project2-region-tab${region === activeRegion ? ' is-active' : ''}`}
                  onClick={() => setActiveRegion(region)}
                >
                  {region}
                </button>
              ))}
            </div>
            <div className="project2-filter-group">
              <span className="project2-filter-group__label">类别</span>
              {CATEGORY_OPTIONS.map((category) => (
                <button
                  key={category}
                  type="button"
                  className={`project2-region-tab${category === activeCategory ? ' is-active' : ''}`}
                  onClick={() => setActiveCategory(category)}
                >
                  {category}
                </button>
              ))}
            </div>
          </div>

          <div className="project2-workspace">
            <div className="project2-scene-shell">
              <div className="project2-scene-head">
                <span>3D Earth Workspace</span>
                <span>
                  当前筛选 {visiblePoints.length} / 全库 {DESTINATION_POINTS.length} 个景点
                </span>
              </div>
              <div className="project2-scene-hints">
                <span className="project2-meta-pill">拖拽旋转</span>
                <span className="project2-meta-pill">滚轮或双指缩放</span>
                <span className="project2-meta-pill">
                  {zoomDistance <= 3.02
                    ? '当前已展开单个景点'
                    : zoomDistance <= 4.55
                      ? '当前为聚合热点，继续拉近可展开'
                      : '继续拉近以显示景点热点'}
                </span>
              </div>
              <div className="project2-canvas-wrap">
                <Canvas
                  camera={{ position: [0, 0, 3.38], fov: 29 }}
                  dpr={[1, 1.6]}
                  gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
                >
                  <GlobeScene
                    points={visiblePoints}
                    selectedPoint={selectedPoint}
                    route={route}
                    rotationLocked={rotationLocked}
                    textureMode={textureMode}
                    zoomDistance={zoomDistance}
                    resetSignal={resetSignal}
                    onSelect={(point) => setSelectedId(point.id)}
                    onSurfaceHover={setHoverLatLng}
                    onMarkerHover={setHoverMarkerName}
                    onZoomChange={setZoomDistance}
                  />
                </Canvas>
                <div className="project2-canvas-legend">
                  <span><i className="project2-legend-dot project2-legend-dot--gold" /> 5A 景点</span>
                  <span><i className="project2-legend-dot project2-legend-dot--cyan" /> 精品景点</span>
                  <span><i className="project2-legend-dot project2-legend-dot--cluster" /> 聚合热点</span>
                </div>

                {selectedPoint && (
                  <div className="project2-selection-hud">
                    <span className="project2-selection-hud__label">Current POI</span>
                    <strong>{selectedPoint.name}</strong>
                    <p>
                      {selectedPoint.country} · {selectedPoint.city} · {formatLatLng(selectedPoint.lat, selectedPoint.lng)}
                    </p>
                  </div>
                )}

                {selectedPoint && (
                  <motion.aside
                    className="project2-detail-overlay"
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                  >
                    <div className="project2-detail-overlay__drag">
                      当前景点
                    </div>
                    <div className="project2-detail-overlay__header">
                      <div>
                        <p className="project2-detail-overlay__eyebrow">
                          {selectedPoint.country} · {selectedPoint.city}
                        </p>
                        <h3 className="project2-detail-overlay__title">{selectedPoint.name}</h3>
                      </div>
                      <button type="button" className="project2-favorite-btn" onClick={toggleFavorite}>
                        {isFavorite ? '已收藏' : '收藏'}
                      </button>
                    </div>

                    <div className="project2-detail-overlay__gallery">
                      <button
                        type="button"
                        className="project2-gallery-nav"
                        onClick={() =>
                          setImageIndex((value) =>
                            value === 0 ? selectedPoint.images.length - 1 : value - 1,
                          )
                        }
                      >
                        ‹
                      </button>
                      <button
                        type="button"
                        className="project2-detail-overlay__image-btn"
                        onClick={() => setLightboxImage(selectedPoint.images[imageIndex])}
                      >
                        <img
                          key={`${selectedPoint.id}-${imageIndex}-${selectedPoint.images[imageIndex]}`}
                          src={selectedPoint.images[imageIndex]}
                          alt={selectedPoint.name}
                          referrerPolicy="no-referrer"
                          loading="lazy"
                          decoding="async"
                          onError={(event) => {
                            const el = event.currentTarget;
                            if (el.getAttribute('data-gallery-fallback') === '1') return;
                            el.setAttribute('data-gallery-fallback', '1');
                            el.src = galleryPlaceholder(selectedPoint.category);
                          }}
                        />
                      </button>
                      <button
                        type="button"
                        className="project2-gallery-nav"
                        onClick={() =>
                          setImageIndex((value) =>
                            value === selectedPoint.images.length - 1 ? 0 : value + 1,
                          )
                        }
                      >
                        ›
                      </button>
                    </div>
                    <p className="project2-gallery-count" aria-live="polite">
                      配图 {imageIndex + 1} / {selectedPoint.images.length}
                    </p>

                    <p className="project2-detail-overlay__tagline">{selectedPoint.tagline}</p>
                    <p className="project2-detail-overlay__desc">{selectedPoint.description}</p>

                    <div className="project2-overlay-meta">
                      <span className="project2-meta-pill">等级 {selectedPoint.grade}</span>
                      <span className="project2-meta-pill">坐标 {selectedPoint.lat.toFixed(2)}°, {selectedPoint.lng.toFixed(2)}°</span>
                      <span className="project2-meta-pill">推荐 {selectedPoint.bestSeason}</span>
                    </div>

                    <div className="project2-chip-list">
                      {selectedPoint.tags.map((tag) => (
                        <span key={tag} className="project2-chip">
                          {tag}
                        </span>
                      ))}
                    </div>

                    <div className="project2-detail-actions">
                      <button type="button" className="btn btn--primary" onClick={planRoute}>
                        规划路线
                      </button>
                      <button type="button" className="btn btn--secondary" onClick={estimatePrice}>
                        查看价格
                      </button>
                    </div>
                  </motion.aside>
                )}
              </div>
            </div>

            <div className="project2-side-stack">
              <section className="project2-panel">
                <div className="project2-panel__head">
                  <h3>路线规划</h3>
                  <p>从预设出发地出发，计算基础距离与预计耗时。</p>
                </div>
                <div className="project2-form-grid">
                  <label className="project2-field">
                    <span>出发地</span>
                    <select value={originId} onChange={(event) => setOriginId(event.target.value)}>
                      {ORIGIN_PRESETS.map((origin) => (
                        <option key={origin.id} value={origin.id}>
                          {origin.city}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="project2-field">
                    <span>出行方式</span>
                    <select value={travelMode} onChange={(event) => setTravelMode(event.target.value as TravelMode)}>
                      {TRAVEL_MODE_OPTIONS.map((mode) => (
                        <option key={mode.id} value={mode.id}>
                          {mode.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <button type="button" className="btn btn--primary project2-panel__action" onClick={planRoute}>
                  生成路线
                </button>

                {route && selectedPoint && (
                  <div className="project2-panel__body">
                    <div className="project2-stat-grid">
                      <div>
                        <span>预计距离</span>
                        <strong>{Math.round(route.distanceKm).toLocaleString()} km</strong>
                      </div>
                      <div>
                        <span>预计耗时</span>
                        <strong>{formatHours(route.durationHours)}</strong>
                      </div>
                    </div>
                    <ul className="project2-inline-list">
                      {route.routeNodes.map((node) => (
                        <li key={node}>{node}</li>
                      ))}
                    </ul>
                    <p className="project2-helper-text">
                      路线轨迹已在地球表面高亮显示，当前目的地为 {selectedPoint.name}。
                    </p>
                  </div>
                )}
              </section>

              <section className="project2-panel">
                <div className="project2-panel__head">
                  <h3>旅途价格估算</h3>
                  <p>结合出行距离、门票、住宿与餐饮给出合理区间。</p>
                </div>
                <button type="button" className="btn btn--secondary project2-panel__action" onClick={estimatePrice}>
                  估算价格
                </button>
                {priceBreakdown && (
                  <div className="project2-panel__body">
                    <div className="project2-price-hero">
                      <strong>
                        人均 {priceBreakdown.minTotal.toLocaleString()} - {priceBreakdown.maxTotal.toLocaleString()} 元
                      </strong>
                      <span>价格为估算值，仅供参考</span>
                    </div>
                    <div className="project2-stat-grid">
                      <div>
                        <span>交通</span>
                        <strong>{priceBreakdown.transport.toLocaleString()} 元</strong>
                      </div>
                      <div>
                        <span>门票</span>
                        <strong>{priceBreakdown.ticket.toLocaleString()} 元</strong>
                      </div>
                      <div>
                        <span>住宿</span>
                        <strong>{priceBreakdown.lodging.toLocaleString()} 元</strong>
                      </div>
                      <div>
                        <span>餐饮</span>
                        <strong>{priceBreakdown.dining.toLocaleString()} 元</strong>
                      </div>
                    </div>
                  </div>
                )}
              </section>

              <section className="project2-panel">
                <div className="project2-panel__head">
                  <h3>收藏与历史</h3>
                  <p>本地存储收藏景点与最近搜索，方便回看。</p>
                </div>
                <div className="project2-chip-list">
                  {favorites.length === 0 ? (
                    <span className="project2-meta-pill">还没有收藏景点</span>
                  ) : (
                    favorites.map((id) => {
                      const point = DESTINATION_POINTS.find((item) => item.id === id);
                      if (!point) return null;
                      return (
                        <button
                          key={id}
                          type="button"
                          className="project2-meta-chip"
                          onClick={() => setSelectedId(point.id)}
                        >
                          {point.name}
                        </button>
                      );
                    })
                  )}
                </div>
                <div className="project2-chip-list">
                  {searchHistory.length === 0 ? (
                    <span className="project2-meta-pill">暂无搜索历史</span>
                  ) : (
                    searchHistory.map((item) => (
                      <button
                        key={item}
                        type="button"
                        className="project2-meta-chip"
                        onClick={() => {
                          setQuery(item);
                          runSearch(item);
                        }}
                      >
                        {item}
                      </button>
                    ))
                  )}
                </div>
              </section>
            </div>
          </div>
        </section>

        <section className="project2-section">
          <div className="project2-section__head">
            <p className="project2-section__eyebrow">后续增强</p>
            <h2 className="project2-section__title">这版先满足轻量部署，后面还能继续接实时 API</h2>
          </div>
          <div className="project2-roadmap">
            {PROJECT2_PHASE2_NOTES.map((note) => (
              <article key={note} className="project2-roadmap__item">
                <span className="project2-roadmap__index">Next</span>
                <p>{note}</p>
              </article>
            ))}
          </div>
        </section>
      </motion.main>

      <footer className="footer">
        <p>科索造物集 · 3D 地球全球景点可视化平台 · 轻量站点版已接入搜索、路线与预算能力</p>
      </footer>

      <AnimatePresence>
        {lightboxImage && (
          <motion.div
            className="project2-lightbox"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setLightboxImage(null)}
          >
            <motion.img
              src={lightboxImage}
              alt="景点大图"
              referrerPolicy="no-referrer"
              decoding="async"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              onClick={(event) => event.stopPropagation()}
              onError={(event) => {
                const el = event.currentTarget;
                if (el.getAttribute('data-lightbox-fallback') === '1') return;
                el.setAttribute('data-lightbox-fallback', '1');
                el.src = '/placeholders/work-global-atlas.svg';
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      <BackToTop />
    </div>
  );
}
