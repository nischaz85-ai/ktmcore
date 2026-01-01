"use client";

import { useEffect, useRef, useState, useCallback } from "react";

type Vec2 = { x: number; y: number };

interface Obstacle {
  x: number;
  y: number;
  width: number;
  height: number;
  type: "static" | "dynamic";
  dynamicType?: "uav";
  staticType?: "building" | "tree" | "tower" | "helipad" | "container";
  velocity?: Vec2;
  animPhase?: number;
  rotorAngle?: number;
  color?: string;
  height3d?: number; // Visual height for 3D effect
}

interface PathNode {
  x: number;
  y: number;
  g: number;
  h: number;
  f: number;
  parent: PathNode | null;
}

interface LidarRay {
  angle: number;
  distance: number;
  hit: boolean;
  hitPoint?: Vec2;
}

interface Drone {
  x: number;
  y: number;
  vx: number;
  vy: number;
  heading: number;
  targetHeading: number;
  rotorSpeed: number;
  rotorAngle: number;
  altitude: number;
  battery: number;
  state: "idle" | "planning" | "navigating" | "avoiding" | "landing";
}

const GRID_SIZE = 15;
const LIDAR_RAYS = 36;
const LIDAR_RANGE = 120;
const SAFE_DISTANCE = 40;
const DRONE_RADIUS = 12;

export default function DroneSimulation() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [speed, setSpeed] = useState(0.6);
  const [showLidar, setShowLidar] = useState(true);
  const [showPath, setShowPath] = useState(true);
  const [showPotentialField, setShowPotentialField] = useState(false);
  const [obstacleCount, setObstacleCount] = useState(12);
  const [dynamicObstacleCount, setDynamicObstacleCount] = useState(2);
  const [algorithmMode, setAlgorithmMode] = useState<"astar" | "rrt" | "apf">("astar");
  const [stats, setStats] = useState({
    pathLength: 0,
    nodesExplored: 0,
    computeTime: 0,
    distanceToGoal: 0,
    battery: 100,
    state: "idle" as string,
  });

  const stateRef = useRef({
    drone: null as Drone | null,
    target: null as Vec2 | null,
    path: [] as Vec2[],
    currentPathIndex: 0,
    obstacles: [] as Obstacle[],
    lidarData: [] as LidarRay[],
    potentialField: [] as number[][],
    rrtTree: [] as { from: Vec2; to: Vec2 }[],
    mouse: null as Vec2 | null,
  });

  // A* Pathfinding Implementation
  const astar = useCallback((start: Vec2, goal: Vec2, obstacles: Obstacle[], canvasWidth: number, canvasHeight: number): { path: Vec2[]; nodesExplored: number } => {
    const gridW = Math.ceil(canvasWidth / GRID_SIZE);
    const gridH = Math.ceil(canvasHeight / GRID_SIZE);
    
    // Create occupancy grid with inflation for drone radius
    const occupied = new Set<string>();
    const inflation = Math.ceil((DRONE_RADIUS) / GRID_SIZE);
    
    obstacles.forEach(obs => {
      const minGx = Math.floor((obs.x - inflation * GRID_SIZE) / GRID_SIZE);
      const maxGx = Math.ceil((obs.x + obs.width + inflation * GRID_SIZE) / GRID_SIZE);
      const minGy = Math.floor((obs.y - inflation * GRID_SIZE) / GRID_SIZE);
      const maxGy = Math.ceil((obs.y + obs.height + inflation * GRID_SIZE) / GRID_SIZE);
      
      for (let gx = minGx; gx <= maxGx; gx++) {
        for (let gy = minGy; gy <= maxGy; gy++) {
          occupied.add(`${gx},${gy}`);
        }
      }
    });

    const startNode: PathNode = {
      x: Math.round(start.x / GRID_SIZE),
      y: Math.round(start.y / GRID_SIZE),
      g: 0,
      h: 0,
      f: 0,
      parent: null,
    };
    
    const goalNode = {
      x: Math.round(goal.x / GRID_SIZE),
      y: Math.round(goal.y / GRID_SIZE),
    };

    const heuristic = (a: { x: number; y: number }, b: { x: number; y: number }) => {
      // Diagonal distance heuristic
      const dx = Math.abs(a.x - b.x);
      const dy = Math.abs(a.y - b.y);
      return Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy);
    };

    startNode.h = heuristic(startNode, goalNode);
    startNode.f = startNode.h;

    const openSet: PathNode[] = [startNode];
    const closedSet = new Set<string>();
    let nodesExplored = 0;

    // 8-directional movement
    const directions = [
      { dx: 1, dy: 0, cost: 1 },
      { dx: -1, dy: 0, cost: 1 },
      { dx: 0, dy: 1, cost: 1 },
      { dx: 0, dy: -1, cost: 1 },
      { dx: 1, dy: 1, cost: Math.SQRT2 },
      { dx: -1, dy: 1, cost: Math.SQRT2 },
      { dx: 1, dy: -1, cost: Math.SQRT2 },
      { dx: -1, dy: -1, cost: Math.SQRT2 },
    ];

    while (openSet.length > 0) {
      // Find node with lowest f score
      openSet.sort((a, b) => a.f - b.f);
      const current = openSet.shift()!;
      nodesExplored++;

      if (current.x === goalNode.x && current.y === goalNode.y) {
        // Reconstruct path
        const path: Vec2[] = [];
        let node: PathNode | null = current;
        while (node) {
          path.unshift({ x: node.x * GRID_SIZE, y: node.y * GRID_SIZE });
          node = node.parent;
        }
        // Smooth the path
        return { path: smoothPath(path, obstacles), nodesExplored };
      }

      closedSet.add(`${current.x},${current.y}`);

      for (const dir of directions) {
        const nx = current.x + dir.dx;
        const ny = current.y + dir.dy;
        const key = `${nx},${ny}`;

        if (nx < 0 || nx >= gridW || ny < 0 || ny >= gridH) continue;
        if (closedSet.has(key)) continue;
        if (occupied.has(key)) continue;

        const g = current.g + dir.cost;
        const h = heuristic({ x: nx, y: ny }, goalNode);
        const f = g + h;

        const existing = openSet.find(n => n.x === nx && n.y === ny);
        if (existing) {
          if (g < existing.g) {
            existing.g = g;
            existing.f = f;
            existing.parent = current;
          }
        } else {
          openSet.push({ x: nx, y: ny, g, h, f, parent: current });
        }
      }
    }

    return { path: [], nodesExplored };
  }, []);

  // Path smoothing using line-of-sight checks
  const smoothPath = (path: Vec2[], obstacles: Obstacle[]): Vec2[] => {
    if (path.length <= 2) return path;
    
    const smoothed: Vec2[] = [path[0]];
    let current = 0;
    
    while (current < path.length - 1) {
      let furthest = current + 1;
      
      for (let i = path.length - 1; i > current + 1; i--) {
        if (hasLineOfSight(path[current], path[i], obstacles)) {
          furthest = i;
          break;
        }
      }
      
      smoothed.push(path[furthest]);
      current = furthest;
    }
    
    return smoothed;
  };

  // Line of sight check
  const hasLineOfSight = (a: Vec2, b: Vec2, obstacles: Obstacle[]): boolean => {
    const steps = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 5);
    
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const px = a.x + (b.x - a.x) * t;
      const py = a.y + (b.y - a.y) * t;
      
      for (const obs of obstacles) {
        if (px > obs.x - DRONE_RADIUS && px < obs.x + obs.width + DRONE_RADIUS &&
            py > obs.y - DRONE_RADIUS && py < obs.y + obs.height + DRONE_RADIUS) {
          return false;
        }
      }
    }
    
    return true;
  };

  // RRT (Rapidly-exploring Random Tree) Implementation
  const rrt = useCallback((start: Vec2, goal: Vec2, obstacles: Obstacle[], canvasWidth: number, canvasHeight: number): { path: Vec2[]; tree: { from: Vec2; to: Vec2 }[]; nodesExplored: number } => {
    const tree: { point: Vec2; parent: number }[] = [{ point: start, parent: -1 }];
    const treeEdges: { from: Vec2; to: Vec2 }[] = [];
    const maxIterations = 1500;
    const stepSize = 25;
    const goalBias = 0.15;
    
    for (let i = 0; i < maxIterations; i++) {
      // Sample random point (with goal bias)
      let sample: Vec2;
      if (Math.random() < goalBias) {
        sample = { ...goal };
      } else {
        sample = {
          x: Math.random() * canvasWidth,
          y: Math.random() * canvasHeight,
        };
      }
      
      // Find nearest node
      let nearestIdx = 0;
      let nearestDist = Infinity;
      tree.forEach((node, idx) => {
        const d = Math.hypot(node.point.x - sample.x, node.point.y - sample.y);
        if (d < nearestDist) {
          nearestDist = d;
          nearestIdx = idx;
        }
      });
      
      const nearest = tree[nearestIdx].point;
      
      // Steer towards sample
      const angle = Math.atan2(sample.y - nearest.y, sample.x - nearest.x);
      const newPoint: Vec2 = {
        x: nearest.x + Math.cos(angle) * stepSize,
        y: nearest.y + Math.sin(angle) * stepSize,
      };
      
      // Check collision
      if (!hasLineOfSight(nearest, newPoint, obstacles)) continue;
      if (newPoint.x < 0 || newPoint.x > canvasWidth || newPoint.y < 0 || newPoint.y > canvasHeight) continue;
      
      tree.push({ point: newPoint, parent: nearestIdx });
      treeEdges.push({ from: nearest, to: newPoint });
      
      // Check if we reached goal
      if (Math.hypot(newPoint.x - goal.x, newPoint.y - goal.y) < stepSize) {
        // Reconstruct path
        const path: Vec2[] = [goal, newPoint];
        let idx = tree.length - 1;
        while (tree[idx].parent !== -1) {
          idx = tree[idx].parent;
          path.unshift(tree[idx].point);
        }
        return { path, tree: treeEdges, nodesExplored: tree.length };
      }
    }
    
    return { path: [], tree: treeEdges, nodesExplored: tree.length };
  }, []);

  // Artificial Potential Field
  const computePotentialField = useCallback((goal: Vec2, obstacles: Obstacle[], canvasWidth: number, canvasHeight: number): number[][] => {
    const resolution = 10;
    const field: number[][] = [];
    
    for (let x = 0; x < canvasWidth; x += resolution) {
      const row: number[] = [];
      for (let y = 0; y < canvasHeight; y += resolution) {
        // Attractive potential to goal
        const dGoal = Math.hypot(x - goal.x, y - goal.y);
        const attractive = 0.5 * dGoal;
        
        // Repulsive potential from obstacles
        let repulsive = 0;
        const influenceRadius = 60;
        
        obstacles.forEach(obs => {
          const cx = obs.x + obs.width / 2;
          const cy = obs.y + obs.height / 2;
          const d = Math.hypot(x - cx, y - cy) - Math.max(obs.width, obs.height) / 2;
          
          if (d < influenceRadius && d > 0) {
            repulsive += 500 * Math.pow(1 / d - 1 / influenceRadius, 2);
          } else if (d <= 0) {
            repulsive += 10000;
          }
        });
        
        row.push(attractive + repulsive);
      }
      field.push(row);
    }
    
    return field;
  }, []);

  // APF-based navigation
  const apfNavigate = useCallback((drone: Vec2, goal: Vec2, obstacles: Obstacle[]): Vec2 => {
    const kAttr = 1.0;
    const kRep = 500;
    const influenceRadius = 80;
    
    // Attractive force
    const dGoal = Math.hypot(goal.x - drone.x, goal.y - drone.y);
    const attrForce: Vec2 = {
      x: kAttr * (goal.x - drone.x) / Math.max(dGoal, 1),
      y: kAttr * (goal.y - drone.y) / Math.max(dGoal, 1),
    };
    
    // Repulsive forces
    const repForce: Vec2 = { x: 0, y: 0 };
    
    obstacles.forEach(obs => {
      const cx = obs.x + obs.width / 2;
      const cy = obs.y + obs.height / 2;
      const d = Math.hypot(drone.x - cx, drone.y - cy) - Math.max(obs.width, obs.height) / 2 - DRONE_RADIUS;
      
      if (d < influenceRadius && d > 0) {
        const magnitude = kRep * (1 / d - 1 / influenceRadius) / (d * d);
        repForce.x += magnitude * (drone.x - cx) / Math.hypot(drone.x - cx, drone.y - cy);
        repForce.y += magnitude * (drone.y - cy) / Math.hypot(drone.x - cx, drone.y - cy);
      }
    });
    
    return {
      x: attrForce.x + repForce.x,
      y: attrForce.y + repForce.y,
    };
  }, []);

  // LiDAR simulation
  const simulateLidar = useCallback((drone: Vec2, heading: number, obstacles: Obstacle[], canvasWidth: number, canvasHeight: number): LidarRay[] => {
    const rays: LidarRay[] = [];
    
    for (let i = 0; i < LIDAR_RAYS; i++) {
      const angle = heading + (i / LIDAR_RAYS) * Math.PI * 2;
      let minDist = LIDAR_RANGE;
      let hit = false;
      let hitPoint: Vec2 | undefined;
      
      // Ray marching
      for (let d = 5; d < LIDAR_RANGE; d += 3) {
        const px = drone.x + Math.cos(angle) * d;
        const py = drone.y + Math.sin(angle) * d;
        
        // Check boundaries
        if (px < 0 || px > canvasWidth || py < 0 || py > canvasHeight) {
          minDist = d;
          hit = true;
          hitPoint = { x: px, y: py };
          break;
        }
        
        // Check obstacles
        for (const obs of obstacles) {
          if (px > obs.x && px < obs.x + obs.width &&
              py > obs.y && py < obs.y + obs.height) {
            minDist = d;
            hit = true;
            hitPoint = { x: px, y: py };
            break;
          }
        }
        
        if (hit) break;
      }
      
      rays.push({ angle, distance: minDist, hit, hitPoint });
    }
    
    return rays;
  }, []);

  // Generate obstacles
  const generateObstacles = useCallback((count: number, dynamicCount: number, canvasWidth: number, canvasHeight: number): Obstacle[] => {
    const obstacles: Obstacle[] = [];
    const margin = 60;
    const minGap = 50; // Large gap to ensure drone can always pass
    
    // Define obstacle types with their properties - smaller sizes
    const staticTypes: Array<{
      type: "building" | "tree" | "tower" | "helipad" | "container";
      minW: number; maxW: number;
      minH: number; maxH: number;
      weight: number;
    }> = [
      { type: "building", minW: 25, maxW: 40, minH: 25, maxH: 40, weight: 0.3 },
      { type: "tree", minW: 10, maxW: 15, minH: 10, maxH: 15, weight: 0.25 },
      { type: "tower", minW: 15, maxW: 20, minH: 15, maxH: 20, weight: 0.15 },
      { type: "container", minW: 15, maxW: 25, minH: 10, maxH: 12, weight: 0.2 },
      { type: "helipad", minW: 22, maxW: 28, minH: 22, maxH: 28, weight: 0.1 },
    ];
    
    // Calculate cumulative weights for random selection
    const totalWeight = staticTypes.reduce((sum, t) => sum + t.weight, 0);
    
    const selectStaticType = () => {
      let rand = Math.random() * totalWeight;
      for (const st of staticTypes) {
        rand -= st.weight;
        if (rand <= 0) return st;
      }
      return staticTypes[0];
    };
    
    // Color palettes for buildings
    const buildingColors = [
      { base: "#4a5568", accent: "#2d3748" }, // Gray
      { base: "#553c2e", accent: "#3d2a1f" }, // Brown
      { base: "#2c4a5e", accent: "#1a3344" }, // Blue-gray
      { base: "#4a4a3a", accent: "#2d2d22" }, // Olive
      { base: "#5c4a6e", accent: "#3d2d4a" }, // Purple-gray
    ];
    
    // Calculate grid for even distribution of static obstacles
    const staticCount = count - dynamicCount;
    
    // Use fewer columns/rows to ensure more spacing
    const cols = Math.max(2, Math.ceil(Math.sqrt(staticCount * (canvasWidth / canvasHeight) * 0.6)));
    const rows = Math.max(2, Math.ceil(staticCount / cols));
    const cellWidth = (canvasWidth - 2 * margin) / cols;
    const cellHeight = (canvasHeight - 2 * margin) / rows;
    
    // Place static obstacles in grid cells with jitter
    let staticIndex = 0;
    for (let row = 0; row < rows && staticIndex < staticCount; row++) {
      for (let col = 0; col < cols && staticIndex < staticCount; col++) {
        // Skip the starting area (left side)
        const cellCenterX = margin + col * cellWidth + cellWidth / 2;
        const cellCenterY = margin + row * cellHeight + cellHeight / 2;
        
        if (cellCenterX < 120 && Math.abs(cellCenterY - canvasHeight / 2) < 100) {
          continue; // Skip drone starting area
        }
        
        const typeInfo = selectStaticType();
        const staticType = typeInfo.type;
        const w = typeInfo.minW + Math.random() * (typeInfo.maxW - typeInfo.minW);
        const h = typeInfo.minH + Math.random() * (typeInfo.maxH - typeInfo.minH);
        
        // Place obstacle in center of cell with small random offset
        const maxJitterX = Math.max(0, (cellWidth - w - minGap * 2) / 2);
        const maxJitterY = Math.max(0, (cellHeight - h - minGap * 2) / 2);
        
        const jitterX = (Math.random() - 0.5) * 2 * maxJitterX;
        const jitterY = (Math.random() - 0.5) * 2 * maxJitterY;
        
        const x = margin + col * cellWidth + (cellWidth - w) / 2 + jitterX;
        const y = margin + row * cellHeight + (cellHeight - h) / 2 + jitterY;
        
        // Clamp to canvas bounds
        const finalX = Math.max(margin, Math.min(canvasWidth - margin - w, x));
        const finalY = Math.max(margin, Math.min(canvasHeight - margin - h, y));
        
        let color: string | undefined;
        let height3d: number | undefined;
        
        if (staticType === "building") {
          const colorScheme = buildingColors[Math.floor(Math.random() * buildingColors.length)];
          color = colorScheme.base;
          height3d = 20 + Math.random() * 40;
        } else if (staticType === "tower") {
          color = "#666677";
          height3d = 50 + Math.random() * 30;
        } else if (staticType === "tree") {
          color = "#2d5a3d";
          height3d = 15 + Math.random() * 10;
        } else if (staticType === "container") {
          const containerColors = ["#cc4444", "#4444cc", "#44aa44", "#ccaa22", "#aa44aa"];
          color = containerColors[Math.floor(Math.random() * containerColors.length)];
          height3d = 8;
        } else if (staticType === "helipad") {
          color = "#333333";
          height3d = 2;
        }
        
        // Check overlap with existing obstacles - ensure minimum gap
        const overlaps = obstacles.some(obs => 
          finalX < obs.x + obs.width + minGap &&
          finalX + w + minGap > obs.x &&
          finalY < obs.y + obs.height + minGap &&
          finalY + h + minGap > obs.y
        );
        
        if (!overlaps) {
          obstacles.push({
            x: finalX,
            y: finalY,
            width: w,
            height: h,
            type: "static",
            staticType,
            color,
            height3d,
            animPhase: Math.random() * Math.PI * 2,
            rotorAngle: 0,
          });
          staticIndex++;
        }
      }
    }
    
    // Place dynamic obstacles (UAVs) randomly with enough space
    for (let i = 0; i < dynamicCount; i++) {
      let placed = false;
      let attempts = 0;
      
      while (!placed && attempts < 50) {
        const x = margin + Math.random() * (canvasWidth - 2 * margin - 24);
        const y = margin + Math.random() * (canvasHeight - 2 * margin - 24);
        
        const tooCloseToStart = x < 120 && Math.abs(y - canvasHeight / 2) < 80;
        
        // Check with larger margin for dynamic obstacles
        const overlaps = obstacles.some(obs => 
          x < obs.x + obs.width + minGap &&
          x + 24 + minGap > obs.x &&
          y < obs.y + obs.height + minGap &&
          y + 24 + minGap > obs.y
        );
        
        if (!overlaps && !tooCloseToStart) {
          obstacles.push({
            x,
            y,
            width: 24,
            height: 24,
            type: "dynamic",
            dynamicType: "uav",
            velocity: {
              x: (Math.random() - 0.5) * 0.6,
              y: (Math.random() - 0.5) * 0.6,
            },
            animPhase: Math.random() * Math.PI * 2,
            rotorAngle: Math.random() * Math.PI * 2,
          });
          placed = true;
        }
        attempts++;
      }
    }
    
    return obstacles;
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Initialize
    const state = stateRef.current;
    state.drone = {
      x: 50,
      y: canvas.height / 2,
      vx: 0,
      vy: 0,
      heading: 0,
      targetHeading: 0,
      rotorSpeed: 0.3,
      rotorAngle: 0,
      altitude: 1,
      battery: 100,
      state: "idle",
    };
    state.obstacles = generateObstacles(obstacleCount, dynamicObstacleCount, canvas.width, canvas.height);
    state.path = [];
    state.currentPathIndex = 0;

    const onMouseMove = (e: MouseEvent) => {
      const r = canvas.getBoundingClientRect();
      // Account for canvas scaling (CSS size vs actual canvas size)
      const scaleX = canvas.width / r.width;
      const scaleY = canvas.height / r.height;
      state.mouse = {
        x: (e.clientX - r.left) * scaleX,
        y: (e.clientY - r.top) * scaleY,
      };
    };

    const onClick = (e: MouseEvent) => {
      const r = canvas.getBoundingClientRect();
      // Account for canvas scaling (CSS size vs actual canvas size)
      const scaleX = canvas.width / r.width;
      const scaleY = canvas.height / r.height;
      const clickPos = {
        x: (e.clientX - r.left) * scaleX,
        y: (e.clientY - r.top) * scaleY,
      };
      
      // Check if click is inside any obstacle (with margin)
      const clickMargin = 15;
      for (const obs of state.obstacles) {
        if (clickPos.x > obs.x - clickMargin && 
            clickPos.x < obs.x + obs.width + clickMargin &&
            clickPos.y > obs.y - clickMargin && 
            clickPos.y < obs.y + obs.height + clickMargin) {
          // Click is on or too close to obstacle - find nearest valid point
          const candidates = [
            { x: obs.x - clickMargin - 5, y: clickPos.y },
            { x: obs.x + obs.width + clickMargin + 5, y: clickPos.y },
            { x: clickPos.x, y: obs.y - clickMargin - 5 },
            { x: clickPos.x, y: obs.y + obs.height + clickMargin + 5 },
          ];
          
          // Filter valid candidates and find closest
          let bestCandidate = null;
          let bestDist = Infinity;
          
          for (const candidate of candidates) {
            if (candidate.x < 10 || candidate.x > canvas.width - 10 ||
                candidate.y < 10 || candidate.y > canvas.height - 10) continue;
            
            // Check if candidate is also inside another obstacle
            let valid = true;
            for (const otherObs of state.obstacles) {
              if (candidate.x > otherObs.x - clickMargin && 
                  candidate.x < otherObs.x + otherObs.width + clickMargin &&
                  candidate.y > otherObs.y - clickMargin && 
                  candidate.y < otherObs.y + otherObs.height + clickMargin) {
                valid = false;
                break;
              }
            }
            
            if (valid) {
              const dist = Math.hypot(candidate.x - clickPos.x, candidate.y - clickPos.y);
              if (dist < bestDist) {
                bestDist = dist;
                bestCandidate = candidate;
              }
            }
          }
          
          if (bestCandidate) {
            clickPos.x = bestCandidate.x;
            clickPos.y = bestCandidate.y;
          } else {
            // No valid position found nearby
            return;
          }
          break;
        }
      }
      
      state.target = clickPos;
      state.drone!.state = "planning";
      
      const startTime = performance.now();
      
      if (algorithmMode === "astar") {
        const result = astar(
          { x: state.drone!.x, y: state.drone!.y },
          clickPos,
          state.obstacles,
          canvas.width,
          canvas.height
        );
        state.path = result.path;
        state.rrtTree = [];
        
        // If A* fails, try direct path if line of sight exists
        if (result.path.length === 0) {
          if (hasLineOfSight({ x: state.drone!.x, y: state.drone!.y }, clickPos, state.obstacles)) {
            state.path = [{ x: state.drone!.x, y: state.drone!.y }, clickPos];
          }
        }
        
        setStats(prev => ({
          ...prev,
          nodesExplored: result.nodesExplored,
          computeTime: performance.now() - startTime,
          pathLength: state.path.length,
        }));
      } else if (algorithmMode === "rrt") {
        const result = rrt(
          { x: state.drone!.x, y: state.drone!.y },
          clickPos,
          state.obstacles,
          canvas.width,
          canvas.height
        );
        state.path = result.path;
        state.rrtTree = result.tree;
        
        setStats(prev => ({
          ...prev,
          nodesExplored: result.nodesExplored,
          computeTime: performance.now() - startTime,
          pathLength: result.path.length,
        }));
      } else {
        state.path = [clickPos];
        state.potentialField = computePotentialField(clickPos, state.obstacles, canvas.width, canvas.height);
      }
      
      state.currentPathIndex = 0;
      state.drone!.state = state.path.length > 0 ? "navigating" : "idle";
      
      // If still no path, clear target
      if (state.path.length === 0 && algorithmMode !== "apf") {
        state.target = null;
      }
    };

    canvas.addEventListener("mousemove", onMouseMove);
    canvas.addEventListener("click", onClick);

    let animId: number;
    let lastTime = 0;

    const drawGrid = () => {
      ctx.strokeStyle = "#1a2634";
      ctx.lineWidth = 1;

      for (let x = 0; x < canvas.width; x += 40) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
      }

      for (let y = 0; y < canvas.height; y += 40) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
      }
    };

    const drawPotentialField = () => {
      if (!showPotentialField || !state.potentialField.length) return;
      
      const resolution = 10;
      let maxVal = 0;
      state.potentialField.forEach(row => row.forEach(v => { if (v < 10000) maxVal = Math.max(maxVal, v); }));
      
      for (let i = 0; i < state.potentialField.length; i++) {
        for (let j = 0; j < state.potentialField[i].length; j++) {
          const v = Math.min(state.potentialField[i][j], maxVal);
          const normalized = v / maxVal;
          const hue = (1 - normalized) * 240;
          ctx.fillStyle = `hsla(${hue}, 80%, 50%, 0.15)`;
          ctx.fillRect(i * resolution, j * resolution, resolution, resolution);
        }
      }
    };

    const drawObstacles = (time: number) => {
      // Sort by y position for proper layering
      const sortedObstacles = [...state.obstacles].sort((a, b) => a.y - b.y);
      
      sortedObstacles.forEach(obs => {
        if (obs.type === "dynamic") {
          // Draw enemy/other UAV - top down view
          const cx = obs.x + obs.width / 2;
          const cy = obs.y + obs.height / 2;
          const heading = obs.velocity ? Math.atan2(obs.velocity.y, obs.velocity.x) : 0;
          
          ctx.save();
          ctx.translate(cx, cy);
          ctx.rotate(heading);
          
          const size = 12;
          
          // Shadow
          ctx.fillStyle = "rgba(0,0,0,0.2)";
          ctx.beginPath();
          ctx.ellipse(2, 2, size * 1.1, size * 1.1, 0, 0, Math.PI * 2);
          ctx.fill();
          
          // Arms - X shape from top
          const armLength = size * 0.9;
          ctx.strokeStyle = "#5a1a1a";
          ctx.lineWidth = 4;
          ctx.lineCap = "round";
          
          // Draw X arms
          ctx.beginPath();
          ctx.moveTo(-armLength, -armLength);
          ctx.lineTo(armLength, armLength);
          ctx.moveTo(armLength, -armLength);
          ctx.lineTo(-armLength, armLength);
          ctx.stroke();
          
          // Motors at arm ends
          const motorPositions = [
            { x: -armLength, y: -armLength },
            { x: armLength, y: -armLength },
            { x: -armLength, y: armLength },
            { x: armLength, y: armLength },
          ];
          
          const rotorAngle = (obs.rotorAngle || 0) + time * 15;
          motorPositions.forEach((pos, i) => {
            // Rotor disc (blur)
            ctx.fillStyle = "rgba(255, 100, 100, 0.25)";
            ctx.beginPath();
            ctx.arc(pos.x, pos.y, size * 0.5, 0, Math.PI * 2);
            ctx.fill();
            
            // Rotor blades
            const rAngle = rotorAngle + (i % 2 === 0 ? 0 : Math.PI / 4);
            ctx.strokeStyle = "rgba(180, 80, 80, 0.8)";
            ctx.lineWidth = 2;
            for (let b = 0; b < 2; b++) {
              const angle = rAngle + b * Math.PI;
              ctx.beginPath();
              ctx.moveTo(pos.x - Math.cos(angle) * size * 0.45, pos.y - Math.sin(angle) * size * 0.45);
              ctx.lineTo(pos.x + Math.cos(angle) * size * 0.45, pos.y + Math.sin(angle) * size * 0.45);
              ctx.stroke();
            }
            
            // Motor center
            ctx.fillStyle = "#3a0a0a";
            ctx.beginPath();
            ctx.arc(pos.x, pos.y, 3, 0, Math.PI * 2);
            ctx.fill();
          });
          
          // Center body - top view
          ctx.fillStyle = "#aa2222";
          ctx.beginPath();
          ctx.arc(0, 0, size * 0.35, 0, Math.PI * 2);
          ctx.fill();
          
          // Direction indicator (front)
          ctx.fillStyle = "#ff4444";
          ctx.beginPath();
          ctx.moveTo(size * 0.25, 0);
          ctx.lineTo(size * 0.5, -size * 0.15);
          ctx.lineTo(size * 0.5, size * 0.15);
          ctx.closePath();
          ctx.fill();
          
          // Center light
          ctx.fillStyle = Math.sin(time * 10) > 0 ? "#ff0000" : "#440000";
          ctx.beginPath();
          ctx.arc(0, 0, 3, 0, Math.PI * 2);
          ctx.fill();
          
          ctx.restore();
          
        } else {
          // Draw static obstacles - TRUE TOP DOWN VIEW
          const { x, y, width, height, staticType, color } = obs;
          
          if (staticType === "building") {
            // Building - top down rectangular footprint
            // Shadow
            ctx.fillStyle = "rgba(0,0,0,0.2)";
            ctx.fillRect(x + 3, y + 3, width, height);
            
            // Roof
            ctx.fillStyle = color || "#4a5568";
            ctx.fillRect(x, y, width, height);
            
            // Roof edge/border
            ctx.strokeStyle = "rgba(0,0,0,0.3)";
            ctx.lineWidth = 2;
            ctx.strokeRect(x, y, width, height);
            
            // Roof details - AC units, vents etc
            ctx.fillStyle = "rgba(80, 90, 100, 0.8)";
            // AC unit
            ctx.fillRect(x + width * 0.6, y + height * 0.1, width * 0.25, height * 0.2);
            // Vent
            ctx.fillStyle = "rgba(60, 70, 80, 0.6)";
            ctx.beginPath();
            ctx.arc(x + width * 0.25, y + height * 0.3, Math.min(width, height) * 0.1, 0, Math.PI * 2);
            ctx.fill();
            
            // Roof edge highlight
            ctx.strokeStyle = "rgba(255,255,255,0.1)";
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x + width, y);
            ctx.lineTo(x + width, y + height);
            ctx.stroke();
            
          } else if (staticType === "tree") {
            // Tree - top down circular canopy
            const cx = x + width / 2;
            const cy = y + height / 2;
            const radius = Math.min(width, height) / 2;
            
            // Shadow
            ctx.fillStyle = "rgba(0,0,0,0.2)";
            ctx.beginPath();
            ctx.arc(cx + 2, cy + 2, radius, 0, Math.PI * 2);
            ctx.fill();
            
            // Outer foliage
            ctx.fillStyle = "#1a4d2e";
            ctx.beginPath();
            ctx.arc(cx, cy, radius, 0, Math.PI * 2);
            ctx.fill();
            
            // Inner foliage layers
            ctx.fillStyle = "#2d5a3d";
            ctx.beginPath();
            ctx.arc(cx - radius * 0.1, cy - radius * 0.1, radius * 0.7, 0, Math.PI * 2);
            ctx.fill();
            
            // Center/trunk visible through canopy
            ctx.fillStyle = "#3d6b4d";
            ctx.beginPath();
            ctx.arc(cx, cy, radius * 0.3, 0, Math.PI * 2);
            ctx.fill();
            
            // Highlight
            ctx.fillStyle = "rgba(100, 180, 100, 0.3)";
            ctx.beginPath();
            ctx.arc(cx - radius * 0.3, cy - radius * 0.3, radius * 0.25, 0, Math.PI * 2);
            ctx.fill();
            
          } else if (staticType === "tower") {
            // Tower - top down view showing base and guy wires
            const cx = x + width / 2;
            const cy = y + height / 2;
            const baseRadius = Math.min(width, height) * 0.4;
            
            // Guy wire shadows / anchor points
            ctx.strokeStyle = "rgba(100, 110, 120, 0.4)";
            ctx.lineWidth = 1;
            for (let i = 0; i < 4; i++) {
              const angle = (i / 4) * Math.PI * 2 + Math.PI / 4;
              ctx.beginPath();
              ctx.moveTo(cx, cy);
              ctx.lineTo(cx + Math.cos(angle) * height * 0.45, cy + Math.sin(angle) * height * 0.45);
              ctx.stroke();
              
              // Anchor point
              ctx.fillStyle = "#555";
              ctx.beginPath();
              ctx.arc(cx + Math.cos(angle) * height * 0.45, cy + Math.sin(angle) * height * 0.45, 2, 0, Math.PI * 2);
              ctx.fill();
            }
            
            // Tower base (triangular structure from top)
            ctx.strokeStyle = "#667788";
            ctx.lineWidth = 2;
            ctx.beginPath();
            for (let i = 0; i < 3; i++) {
              const angle = (i / 3) * Math.PI * 2 - Math.PI / 2;
              const px = cx + Math.cos(angle) * baseRadius;
              const py = cy + Math.sin(angle) * baseRadius;
              if (i === 0) ctx.moveTo(px, py);
              else ctx.lineTo(px, py);
            }
            ctx.closePath();
            ctx.stroke();
            
            // Center platform
            ctx.fillStyle = "#556677";
            ctx.beginPath();
            ctx.arc(cx, cy, baseRadius * 0.4, 0, Math.PI * 2);
            ctx.fill();
            
            // Antenna
            ctx.fillStyle = "#778899";
            ctx.beginPath();
            ctx.arc(cx, cy, 3, 0, Math.PI * 2);
            ctx.fill();
            
            // Blinking light
            ctx.fillStyle = Math.sin(time * 4) > 0 ? "#ff0000" : "#660000";
            ctx.beginPath();
            ctx.arc(cx, cy, 2, 0, Math.PI * 2);
            ctx.fill();
            
          } else if (staticType === "container") {
            // Container - top down rectangular
            // Shadow
            ctx.fillStyle = "rgba(0,0,0,0.2)";
            ctx.fillRect(x + 2, y + 2, width, height);
            
            // Container top
            ctx.fillStyle = color || "#cc4444";
            ctx.fillRect(x, y, width, height);
            
            // Corrugated roof lines
            ctx.strokeStyle = "rgba(0,0,0,0.2)";
            ctx.lineWidth = 1;
            const ridgeSpacing = 4;
            for (let i = ridgeSpacing; i < width - 2; i += ridgeSpacing) {
              ctx.beginPath();
              ctx.moveTo(x + i, y + 2);
              ctx.lineTo(x + i, y + height - 2);
              ctx.stroke();
            }
            
            // Edge border
            ctx.strokeStyle = "rgba(0,0,0,0.3)";
            ctx.lineWidth = 1;
            ctx.strokeRect(x, y, width, height);
            
            // Corner fittings
            ctx.fillStyle = "rgba(80,80,80,0.8)";
            const cornerSize = 4;
            ctx.fillRect(x, y, cornerSize, cornerSize);
            ctx.fillRect(x + width - cornerSize, y, cornerSize, cornerSize);
            ctx.fillRect(x, y + height - cornerSize, cornerSize, cornerSize);
            ctx.fillRect(x + width - cornerSize, y + height - cornerSize, cornerSize, cornerSize);
            
          } else if (staticType === "helipad") {
            // Helipad - top down circular pad
            const cx = x + width / 2;
            const cy = y + height / 2;
            const radius = Math.min(width, height) / 2;
            
            // Base circle
            ctx.fillStyle = "#2a2a2a";
            ctx.beginPath();
            ctx.arc(cx, cy, radius, 0, Math.PI * 2);
            ctx.fill();
            
            // Outer yellow circle
            ctx.strokeStyle = "#ddaa00";
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(cx, cy, radius - 4, 0, Math.PI * 2);
            ctx.stroke();
            
            // H marking
            ctx.strokeStyle = "#ffffff";
            ctx.lineWidth = 3;
            ctx.lineCap = "round";
            const hSize = radius * 0.5;
            ctx.beginPath();
            // Left vertical
            ctx.moveTo(cx - hSize * 0.6, cy - hSize);
            ctx.lineTo(cx - hSize * 0.6, cy + hSize);
            // Right vertical
            ctx.moveTo(cx + hSize * 0.6, cy - hSize);
            ctx.lineTo(cx + hSize * 0.6, cy + hSize);
            // Horizontal
            ctx.moveTo(cx - hSize * 0.6, cy);
            ctx.lineTo(cx + hSize * 0.6, cy);
            ctx.stroke();
            
            // Corner lights
            for (let i = 0; i < 4; i++) {
              const angle = (i / 4) * Math.PI * 2 + Math.PI / 4;
              const lx = cx + Math.cos(angle) * (radius - 6);
              const ly = cy + Math.sin(angle) * (radius - 6);
              ctx.fillStyle = Math.sin(time * 3 + i) > 0 ? "#00ff00" : "#004400";
              ctx.beginPath();
              ctx.arc(lx, ly, 2, 0, Math.PI * 2);
              ctx.fill();
            }
          }
        }
      });
    };

    const drawRRTTree = () => {
      if (algorithmMode !== "rrt" || !state.rrtTree.length) return;
      
      ctx.strokeStyle = "rgba(100, 200, 100, 0.3)";
      ctx.lineWidth = 1;
      
      state.rrtTree.forEach(edge => {
        ctx.beginPath();
        ctx.moveTo(edge.from.x, edge.from.y);
        ctx.lineTo(edge.to.x, edge.to.y);
        ctx.stroke();
      });
    };

    const drawPath = () => {
      if (!showPath || state.path.length < 2) return;
      
      // Path shadow
      ctx.strokeStyle = "rgba(0,0,0,0.3)";
      ctx.lineWidth = 4;
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(state.path[0].x + 2, state.path[0].y + 2);
      state.path.slice(1).forEach(p => ctx.lineTo(p.x + 2, p.y + 2));
      ctx.stroke();
      
      // Main path
      const gradient = ctx.createLinearGradient(
        state.path[0].x, state.path[0].y,
        state.path[state.path.length - 1].x, state.path[state.path.length - 1].y
      );
      gradient.addColorStop(0, "#00ff88");
      gradient.addColorStop(1, "#00aaff");
      
      ctx.strokeStyle = gradient;
      ctx.lineWidth = 3;
      ctx.setLineDash([8, 4]);
      ctx.beginPath();
      ctx.moveTo(state.path[0].x, state.path[0].y);
      state.path.slice(1).forEach(p => ctx.lineTo(p.x, p.y));
      ctx.stroke();
      ctx.setLineDash([]);
      
      // Waypoints
      state.path.forEach((p, i) => {
        const isActive = i === state.currentPathIndex;
        ctx.fillStyle = isActive ? "#00ffaa" : "rgba(0,255,170,0.5)";
        ctx.beginPath();
        ctx.arc(p.x, p.y, isActive ? 6 : 4, 0, Math.PI * 2);
        ctx.fill();
        
        if (isActive) {
          ctx.strokeStyle = "#00ffaa";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(p.x, p.y, 10, 0, Math.PI * 2);
          ctx.stroke();
        }
      });
    };

    const drawLidar = (drone: Drone) => {
      if (!showLidar) return;
      
      state.lidarData.forEach(ray => {
        const endX = drone.x + Math.cos(ray.angle) * ray.distance;
        const endY = drone.y + Math.sin(ray.angle) * ray.distance;
        
        // Ray line
        const alpha = ray.hit ? 0.6 : 0.2;
        const color = ray.distance < SAFE_DISTANCE ? "255, 100, 100" : "100, 255, 200";
        ctx.strokeStyle = `rgba(${color}, ${alpha})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(drone.x, drone.y);
        ctx.lineTo(endX, endY);
        ctx.stroke();
        
        // Hit point
        if (ray.hit && ray.hitPoint) {
          ctx.fillStyle = ray.distance < SAFE_DISTANCE ? "#ff4444" : "#00ff88";
          ctx.beginPath();
          ctx.arc(ray.hitPoint.x, ray.hitPoint.y, 3, 0, Math.PI * 2);
          ctx.fill();
        }
      });
    };

    const drawDrone = (drone: Drone, time: number) => {
      ctx.save();
      ctx.translate(drone.x, drone.y);
      
      // Rotate based on heading
      ctx.rotate(drone.heading);
      
      const size = DRONE_RADIUS;
      
      // Shadow
      ctx.fillStyle = "rgba(0,0,0,0.25)";
      ctx.beginPath();
      ctx.arc(2, 2, size * 1.2, 0, Math.PI * 2);
      ctx.fill();
      
      // Arms - X configuration from top
      const armLength = size * 0.9;
      ctx.strokeStyle = "#1a3a4a";
      ctx.lineWidth = 5;
      ctx.lineCap = "round";
      
      // Draw X arms
      ctx.beginPath();
      ctx.moveTo(-armLength, -armLength);
      ctx.lineTo(armLength, armLength);
      ctx.moveTo(armLength, -armLength);
      ctx.lineTo(-armLength, armLength);
      ctx.stroke();
      
      // Motor positions at arm ends
      const motorPositions = [
        { x: -armLength, y: -armLength },
        { x: armLength, y: -armLength },
        { x: -armLength, y: armLength },
        { x: armLength, y: armLength },
      ];
      
      motorPositions.forEach((pos, i) => {
        // Rotor disc (motion blur effect)
        ctx.fillStyle = "rgba(0, 200, 255, 0.2)";
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, size * 0.55, 0, Math.PI * 2);
        ctx.fill();
        
        // Spinning rotor blades
        const rotorPhase = drone.rotorAngle + (i % 2 === 0 ? 0 : Math.PI / 4);
        ctx.strokeStyle = "rgba(100, 200, 230, 0.8)";
        ctx.lineWidth = 2;
        for (let b = 0; b < 2; b++) {
          const angle = rotorPhase + b * Math.PI;
          ctx.beginPath();
          ctx.moveTo(pos.x - Math.cos(angle) * size * 0.5, pos.y - Math.sin(angle) * size * 0.5);
          ctx.lineTo(pos.x + Math.cos(angle) * size * 0.5, pos.y + Math.sin(angle) * size * 0.5);
          ctx.stroke();
        }
        
        // Motor housing
        ctx.fillStyle = "#0a2a3a";
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, 4, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.strokeStyle = "rgba(0, 200, 255, 0.5)";
        ctx.lineWidth = 1;
        ctx.stroke();
      });
      
      // Center body - circular from top
      const bodyGradient = ctx.createRadialGradient(0, 0, 0, 0, 0, size * 0.45);
      bodyGradient.addColorStop(0, "#2a4a5a");
      bodyGradient.addColorStop(1, "#1a2a3a");
      
      ctx.fillStyle = bodyGradient;
      ctx.beginPath();
      ctx.arc(0, 0, size * 0.4, 0, Math.PI * 2);
      ctx.fill();
      
      // Body ring
      ctx.strokeStyle = "rgba(0, 200, 255, 0.6)";
      ctx.lineWidth = 2;
      ctx.stroke();
      
      // Direction indicator (nose/front) - points in heading direction
      ctx.fillStyle = "#00ddff";
      ctx.beginPath();
      ctx.moveTo(size * 0.35, 0);
      ctx.lineTo(size * 0.6, -size * 0.15);
      ctx.lineTo(size * 0.6, size * 0.15);
      ctx.closePath();
      ctx.fill();
      
      // Camera lens in center
      ctx.fillStyle = "#004466";
      ctx.beginPath();
      ctx.arc(0, 0, size * 0.15, 0, Math.PI * 2);
      ctx.fill();
      
      // Camera lens reflection
      ctx.fillStyle = "rgba(255,255,255,0.4)";
      ctx.beginPath();
      ctx.arc(-size * 0.05, -size * 0.05, size * 0.06, 0, Math.PI * 2);
      ctx.fill();
      
      // Status LED ring based on state
      const stateColors: Record<string, string> = {
        idle: "#888888",
        planning: "#ffaa00",
        navigating: "#00ff88",
        avoiding: "#ff4444",
        landing: "#00aaff",
      };
      
      // Front LED
      ctx.fillStyle = Math.sin(time * 8) > 0 ? "#00ff44" : "#004411";
      ctx.beginPath();
      ctx.arc(size * 0.25, 0, 2.5, 0, Math.PI * 2);
      ctx.fill();
      
      // Rear LEDs
      const rearLed = Math.sin(time * 6) > 0;
      ctx.fillStyle = rearLed ? stateColors[drone.state] || "#00ff88" : "#333";
      ctx.beginPath();
      ctx.arc(-size * 0.2, -size * 0.15, 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(-size * 0.2, size * 0.15, 2, 0, Math.PI * 2);
      ctx.fill();
      
      ctx.restore();
    };

    const drawTarget = () => {
      if (!state.target) return;
      
      const t = performance.now() / 1000;
      const pulse = Math.sin(t * 3) * 0.3 + 0.7;
      
      // Outer ring
      ctx.strokeStyle = `rgba(255, 200, 0, ${pulse * 0.5})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(state.target.x, state.target.y, 20 + Math.sin(t * 2) * 3, 0, Math.PI * 2);
      ctx.stroke();
      
      // Inner ring
      ctx.strokeStyle = `rgba(255, 200, 0, ${pulse})`;
      ctx.beginPath();
      ctx.arc(state.target.x, state.target.y, 8, 0, Math.PI * 2);
      ctx.stroke();
      
      // Crosshairs
      ctx.strokeStyle = "rgba(255, 200, 0, 0.6)";
      ctx.lineWidth = 1;
      [-15, 15].forEach(offset => {
        ctx.beginPath();
        ctx.moveTo(state.target!.x + offset, state.target!.y);
        ctx.lineTo(state.target!.x + offset * 0.5, state.target!.y);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(state.target!.x, state.target!.y + offset);
        ctx.lineTo(state.target!.x, state.target!.y + offset * 0.5);
        ctx.stroke();
      });
      
      // Center dot
      ctx.fillStyle = "#ffcc00";
      ctx.beginPath();
      ctx.arc(state.target.x, state.target.y, 3, 0, Math.PI * 2);
      ctx.fill();
    };

    const drawHUD = (drone: Drone) => {
      const padding = 15;
      
      // Compass
      ctx.save();
      ctx.translate(canvas.width - 50, 50);
      
      ctx.strokeStyle = "rgba(0, 200, 255, 0.3)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, 30, 0, Math.PI * 2);
      ctx.stroke();
      
      // Cardinal directions
      ctx.fillStyle = "rgba(0, 200, 255, 0.6)";
      ctx.font = "10px monospace";
      ctx.textAlign = "center";
      ctx.fillText("N", 0, -35);
      ctx.fillText("S", 0, 42);
      ctx.fillText("E", 38, 4);
      ctx.fillText("W", -38, 4);
      
      // Heading indicator
      ctx.strokeStyle = "#00ffaa";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.sin(drone.heading) * 25, -Math.cos(drone.heading) * 25);
      ctx.stroke();
      
      ctx.restore();
      
      // Speed indicator
      const speed = Math.hypot(drone.vx, drone.vy);
      ctx.fillStyle = "rgba(0, 200, 255, 0.8)";
      ctx.font = "12px monospace";
      ctx.textAlign = "left";
      ctx.fillText(`SPD: ${(speed * 10).toFixed(1)} m/s`, padding, canvas.height - padding - 40);
      ctx.fillText(`HDG: ${((drone.heading * 180 / Math.PI + 360) % 360).toFixed(0)}°`, padding, canvas.height - padding - 25);
      ctx.fillText(`ALT: ${(drone.altitude * 100).toFixed(0)} m`, padding, canvas.height - padding - 10);
      
      // Battery indicator
      const batteryWidth = 60;
      const batteryHeight = 16;
      const batteryX = canvas.width - padding - batteryWidth;
      const batteryY = canvas.height - padding - batteryHeight;
      
      ctx.strokeStyle = "rgba(0, 200, 255, 0.5)";
      ctx.lineWidth = 1;
      ctx.strokeRect(batteryX, batteryY, batteryWidth, batteryHeight);
      ctx.fillRect(batteryX + batteryWidth, batteryY + 4, 3, 8);
      
      const batteryColor = drone.battery > 50 ? "#00ff88" : drone.battery > 20 ? "#ffaa00" : "#ff4444";
      ctx.fillStyle = batteryColor;
      ctx.fillRect(batteryX + 2, batteryY + 2, (batteryWidth - 4) * (drone.battery / 100), batteryHeight - 4);
      
      ctx.fillStyle = "rgba(255,255,255,0.8)";
      ctx.font = "10px monospace";
      ctx.textAlign = "center";
      ctx.fillText(`${drone.battery.toFixed(0)}%`, batteryX + batteryWidth / 2, batteryY + 12);
    };

    const animate = (currentTime: number) => {
      const deltaTime = (currentTime - lastTime) / 1000;
      lastTime = currentTime;
      
      const drone = state.drone!;
      
      // Clear
      ctx.fillStyle = "#0a1018";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      drawGrid();
      drawPotentialField();
      
      // Update dynamic obstacles with collision avoidance
      state.obstacles.forEach(obs => {
        if (obs.type === "dynamic" && obs.velocity) {
          const velocity = obs.velocity; // Store reference for TypeScript
          
          // Predict next position
          let nextX = obs.x + velocity.x;
          let nextY = obs.y + velocity.y;
          
          // Check collision with static obstacles
          let collisionX = false;
          let collisionY = false;
          
          state.obstacles.forEach(other => {
            if (other === obs || other.type === "dynamic") return;
            
            const margin = 8; // Safety margin
            
            // Check X collision
            if (nextX < other.x + other.width + margin &&
                nextX + obs.width + margin > other.x &&
                obs.y < other.y + other.height + margin &&
                obs.y + obs.height + margin > other.y) {
              collisionX = true;
            }
            
            // Check Y collision
            if (obs.x < other.x + other.width + margin &&
                obs.x + obs.width + margin > other.x &&
                nextY < other.y + other.height + margin &&
                nextY + obs.height + margin > other.y) {
              collisionY = true;
            }
          });
          
          // Also check collision with other dynamic obstacles
          state.obstacles.forEach(other => {
            if (other === obs || other.type === "static") return;
            
            const margin = 15;
            
            if (nextX < other.x + other.width + margin &&
                nextX + obs.width + margin > other.x &&
                nextY < other.y + other.height + margin &&
                nextY + obs.height + margin > other.y) {
              // Steer away from other dynamic obstacle
              const dx = (obs.x + obs.width/2) - (other.x + other.width/2);
              const dy = (obs.y + obs.height/2) - (other.y + other.height/2);
              const dist = Math.sqrt(dx*dx + dy*dy) || 1;
              velocity.x += (dx / dist) * 0.3;
              velocity.y += (dy / dist) * 0.3;
            }
          });
          
          // Bounce off static obstacles
          if (collisionX) {
            velocity.x *= -1;
            // Add some randomness to avoid getting stuck
            velocity.y += (Math.random() - 0.5) * 0.5;
          }
          if (collisionY) {
            velocity.y *= -1;
            velocity.x += (Math.random() - 0.5) * 0.5;
          }
          
          // Bounce off walls
          if (obs.x <= 0 || obs.x + obs.width >= canvas.width) {
            velocity.x *= -1;
          }
          if (obs.y <= 0 || obs.y + obs.height >= canvas.height) {
            velocity.y *= -1;
          }
          
          // Limit speed
          const maxSpeed = 0.8;
          const currentSpeed = Math.sqrt(velocity.x ** 2 + velocity.y ** 2);
          if (currentSpeed > maxSpeed) {
            velocity.x = (velocity.x / currentSpeed) * maxSpeed;
            velocity.y = (velocity.y / currentSpeed) * maxSpeed;
          }
          
          // Minimum speed to keep moving
          const minSpeed = 0.25;
          if (currentSpeed < minSpeed) {
            const scale = minSpeed / (currentSpeed || 0.1);
            velocity.x *= scale;
            velocity.y *= scale;
          }
          
          // Apply movement
          obs.x += velocity.x;
          obs.y += velocity.y;
          
          // Clamp to bounds
          obs.x = Math.max(0, Math.min(canvas.width - obs.width, obs.x));
          obs.y = Math.max(0, Math.min(canvas.height - obs.height, obs.y));
        }
      });
      
      // Simulate LiDAR
      state.lidarData = simulateLidar(drone, drone.heading, state.obstacles, canvas.width, canvas.height);
      
      // Check for obstacles in path and trigger replanning
      const closestObstacle = state.lidarData.reduce((min, ray) => ray.distance < min ? ray.distance : min, LIDAR_RANGE);
      
      if (closestObstacle < SAFE_DISTANCE && drone.state === "navigating") {
        drone.state = "avoiding";
      }
      
      // Navigation logic
      if (drone.state === "navigating" || drone.state === "avoiding") {
        let targetPoint: Vec2 | null = null;
        
        if (algorithmMode === "apf") {
          // APF navigation
          if (state.target) {
            const force = apfNavigate(drone, state.target, state.obstacles);
            drone.vx += force.x * 0.02 * speed;
            drone.vy += force.y * 0.02 * speed;
          }
        } else if (state.path.length > 0) {
          // Path following
          targetPoint = state.path[state.currentPathIndex];
          
          if (targetPoint) {
            const dx = targetPoint.x - drone.x;
            const dy = targetPoint.y - drone.y;
            const dist = Math.hypot(dx, dy);
            
            // Move to next waypoint
            if (dist < 15 && state.currentPathIndex < state.path.length - 1) {
              state.currentPathIndex++;
            }
            
            // Velocity control
            drone.vx += dx * 0.003 * speed;
            drone.vy += dy * 0.003 * speed;
            
            // Update heading
            drone.targetHeading = Math.atan2(dy, dx);
          }
        }
        
        // Local obstacle avoidance (reactive)
        if (drone.state === "avoiding") {
          state.lidarData.forEach(ray => {
            if (ray.distance < SAFE_DISTANCE) {
              const avoidForce = (SAFE_DISTANCE - ray.distance) / SAFE_DISTANCE;
              drone.vx -= Math.cos(ray.angle) * avoidForce * 0.5;
              drone.vy -= Math.sin(ray.angle) * avoidForce * 0.5;
            }
          });
          
          if (closestObstacle > SAFE_DISTANCE * 1.2) {
            drone.state = "navigating";
          }
        }
        
        // Check if reached goal
        if (state.target) {
          const distToGoal = Math.hypot(state.target.x - drone.x, state.target.y - drone.y);
          if (distToGoal < 20) {
            drone.state = "idle";
            state.target = null;
            state.path = [];
          }
          
          setStats(prev => ({ ...prev, distanceToGoal: distToGoal }));
        }
      }
      
      // Physics update
      drone.vx *= 0.95;
      drone.vy *= 0.95;
      
      const maxSpeed = 2 * speed;
      const currentSpeed = Math.hypot(drone.vx, drone.vy);
      if (currentSpeed > maxSpeed) {
        drone.vx = (drone.vx / currentSpeed) * maxSpeed;
        drone.vy = (drone.vy / currentSpeed) * maxSpeed;
      }
      
      drone.x += drone.vx;
      drone.y += drone.vy;
      
      // Boundary constraints
      drone.x = Math.max(DRONE_RADIUS, Math.min(canvas.width - DRONE_RADIUS, drone.x));
      drone.y = Math.max(DRONE_RADIUS, Math.min(canvas.height - DRONE_RADIUS, drone.y));
      
      // Smooth heading
      let headingDiff = drone.targetHeading - drone.heading;
      while (headingDiff > Math.PI) headingDiff -= Math.PI * 2;
      while (headingDiff < -Math.PI) headingDiff += Math.PI * 2;
      drone.heading += headingDiff * 0.1;
      
      // Update rotor
      drone.rotorAngle += drone.rotorSpeed;
      
      // Battery drain
      drone.battery = Math.max(0, drone.battery - 0.002 * (1 + currentSpeed));
      
      // Update stats
      setStats(prev => ({
        ...prev,
        battery: drone.battery,
        state: drone.state,
      }));
      
      // Draw everything
      drawRRTTree();
      drawObstacles(currentTime / 1000);
      drawPath();
      drawLidar(drone);
      drawTarget();
      drawDrone(drone, currentTime / 1000);
      drawHUD(drone);
      
      animId = requestAnimationFrame(animate);
    };

    animId = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animId);
      canvas.removeEventListener("mousemove", onMouseMove);
      canvas.removeEventListener("click", onClick);
    };
  }, [speed, showLidar, showPath, showPotentialField, obstacleCount, dynamicObstacleCount, algorithmMode, astar, rrt, apfNavigate, computePotentialField, simulateLidar, generateObstacles]);

  const resetObstacles = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    stateRef.current.obstacles = generateObstacles(obstacleCount, dynamicObstacleCount, canvas.width, canvas.height);
    stateRef.current.path = [];
    stateRef.current.target = null;
    stateRef.current.rrtTree = [];
    if (stateRef.current.drone) {
      stateRef.current.drone.state = "idle";
      stateRef.current.drone.x = 50;
      stateRef.current.drone.y = canvas.height / 2;
      stateRef.current.drone.vx = 0;
      stateRef.current.drone.vy = 0;
    }
  };

  return (
    <div className="border border-gray-800 rounded-xl p-4 bg-gray-950">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-lg font-semibold text-cyan-400">
          Autonomous Drone Navigation Simulator
        </h3>
        <div className="flex items-center gap-2">
          <span className={`px-2 py-1 rounded text-xs font-mono ${
            stats.state === "navigating" ? "bg-green-900 text-green-300" :
            stats.state === "avoiding" ? "bg-red-900 text-red-300" :
            stats.state === "planning" ? "bg-yellow-900 text-yellow-300" :
            "bg-gray-800 text-gray-400"
          }`}>
            {stats.state.toUpperCase()}
          </span>
        </div>
      </div>

      <p className="text-sm text-gray-400 mb-3">
        Click anywhere to set a waypoint. The drone uses {algorithmMode.toUpperCase()} for path planning with real-time obstacle avoidance.
      </p>

      <canvas
        ref={canvasRef}
        width={700}
        height={400}
        className="w-full bg-black border border-cyan-900/50 rounded cursor-crosshair"
      />

      {/* Stats Panel */}
      <div className="grid grid-cols-4 gap-2 mt-3 text-xs font-mono">
        <div className="bg-gray-900 rounded p-2">
          <div className="text-gray-500">Path Length</div>
          <div className="text-cyan-400">{stats.pathLength} nodes</div>
        </div>
        <div className="bg-gray-900 rounded p-2">
          <div className="text-gray-500">Nodes Explored</div>
          <div className="text-cyan-400">{stats.nodesExplored}</div>
        </div>
        <div className="bg-gray-900 rounded p-2">
          <div className="text-gray-500">Compute Time</div>
          <div className="text-cyan-400">{stats.computeTime.toFixed(1)} ms</div>
        </div>
        <div className="bg-gray-900 rounded p-2">
          <div className="text-gray-500">Dist to Goal</div>
          <div className="text-cyan-400">{stats.distanceToGoal.toFixed(0)} px</div>
        </div>
      </div>

      {/* Controls */}
      <div className="grid grid-cols-2 gap-4 mt-4">
        <div>
          <label className="text-sm text-gray-400 block mb-1">
            Algorithm: {algorithmMode.toUpperCase()}
          </label>
          <div className="flex gap-2">
            {(["astar", "rrt", "apf"] as const).map(mode => (
              <button
                key={mode}
                onClick={() => setAlgorithmMode(mode)}
                className={`px-3 py-1.5 rounded text-xs font-medium transition ${
                  algorithmMode === mode
                    ? "bg-cyan-600 text-white"
                    : "bg-gray-800 text-gray-400 hover:bg-gray-700"
                }`}
              >
                {mode === "astar" ? "A*" : mode === "rrt" ? "RRT" : "APF"}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="text-sm text-gray-400 block mb-1">
            Visualization
          </label>
          <div className="flex gap-2">
            <button
              onClick={() => setShowLidar(!showLidar)}
              className={`px-3 py-1.5 rounded text-xs font-medium transition ${
                showLidar ? "bg-green-700 text-white" : "bg-gray-800 text-gray-400"
              }`}
            >
              LiDAR
            </button>
            <button
              onClick={() => setShowPath(!showPath)}
              className={`px-3 py-1.5 rounded text-xs font-medium transition ${
                showPath ? "bg-green-700 text-white" : "bg-gray-800 text-gray-400"
              }`}
            >
              Path
            </button>
            <button
              onClick={() => setShowPotentialField(!showPotentialField)}
              className={`px-3 py-1.5 rounded text-xs font-medium transition ${
                showPotentialField ? "bg-green-700 text-white" : "bg-gray-800 text-gray-400"
              }`}
            >
              Field
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4 mt-3">
        <div>
          <label className="text-sm text-gray-400">
            Speed: {speed.toFixed(1)}x
          </label>
          <input
            type="range"
            min={0.2}
            max={1.5}
            step={0.1}
            value={speed}
            onChange={(e) => setSpeed(Number(e.target.value))}
            className="w-full accent-cyan-500"
          />
        </div>
        <div>
          <label className="text-sm text-gray-400">
            Static Obs: {obstacleCount - dynamicObstacleCount}
          </label>
          <input
            type="range"
            min={4}
            max={20}
            step={1}
            value={obstacleCount}
            onChange={(e) => setObstacleCount(Number(e.target.value))}
            className="w-full accent-cyan-500"
          />
        </div>
        <div>
          <label className="text-sm text-gray-400">
            <span className="text-red-400">Other UAVs:</span> {dynamicObstacleCount}
          </label>
          <input
            type="range"
            min={0}
            max={15}
            step={1}
            value={dynamicObstacleCount}
            onChange={(e) => setDynamicObstacleCount(Number(e.target.value))}
            className="w-full accent-red-500"
          />
        </div>
      </div>

      <button
        onClick={resetObstacles}
        className="mt-3 w-full py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded text-sm font-medium transition"
      >
        Reset Simulation
      </button>

      {/* Legend */}
      <div className="mt-3 pt-3 border-t border-gray-800 text-xs text-gray-500">
        <div className="flex flex-wrap gap-4">
          <span className="flex items-center"><span className="inline-block w-3 h-3 bg-gray-600 mr-1 rounded-sm"></span> Building</span>
          <span className="flex items-center"><span className="inline-block w-3 h-3 bg-green-800 mr-1 rounded-full"></span> Tree</span>
          <span className="flex items-center"><span className="inline-block w-0 h-0 border-l-[6px] border-r-[6px] border-b-[10px] border-transparent border-b-gray-500 mr-1"></span> Tower</span>
          <span className="flex items-center"><span className="inline-block w-4 h-2 bg-red-600 mr-1"></span> Container</span>
          <span className="flex items-center"><span className="inline-block w-3 h-3 bg-gray-700 mr-1 rounded-full border border-yellow-500"></span> Helipad</span>
          <span className="flex items-center"><span className="inline-block w-3 h-3 bg-red-800 mr-1 rounded-full"></span> Other UAV</span>
          <span className="flex items-center"><span className="inline-block w-3 h-3 rounded-full bg-cyan-400 mr-1"></span> Our Drone</span>
          <span className="flex items-center"><span className="inline-block w-4 h-0.5 bg-green-400 mr-1"></span> Path</span>
        </div>
      </div>
    </div>
  );
}