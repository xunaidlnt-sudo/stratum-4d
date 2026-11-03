// Non-IFC 3D models: glTF / GLB, OBJ, STL and FBX, read with the three.js
// loaders. Each mesh becomes a model element. Names, parent nodes, materials
// and custom properties (glTF "extras", FBX user data) become element
// properties, so rules and "select by property" work as for IFC. If the
// custom properties carry an id (GlobalId, guid, ElementId…), that id is the
// element's key, so links survive when the model is exported again.

import * as THREE from "three";
import type { ModelElement } from "../core/types";
import type { LoadedIfc } from "./ifcLoader";

export const MESH_FORMATS = /\.(glb|gltf|obj|stl|fbx)$/i;
const ID_KEYS = ["GlobalId", "globalId", "IfcGUID", "guid", "GUID", "ElementId", "UniqueId", "id"];

async function parse(name: string, bytes: Uint8Array): Promise<THREE.Object3D> {
  const ext = name.toLowerCase().split(".").pop();
  const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  if (ext === "glb" || ext === "gltf") {
    const { GLTFLoader } = await import("three/examples/jsm/loaders/GLTFLoader.js");
    const data = ext === "glb" ? buf : new TextDecoder().decode(bytes);
    const gltf = await new Promise<{ scene: THREE.Object3D }>((ok, fail) =>
      new GLTFLoader().parse(data, "", ok, (e) => fail(new Error(`${(e as unknown as Error)?.message ?? e}. A .gltf file must hold its buffers inside; use .glb if it does not.`))),
    );
    return gltf.scene;
  }
  if (ext === "obj") {
    const { OBJLoader } = await import("three/examples/jsm/loaders/OBJLoader.js");
    return new OBJLoader().parse(new TextDecoder().decode(bytes));
  }
  if (ext === "stl") {
    const { STLLoader } = await import("three/examples/jsm/loaders/STLLoader.js");
    const geom = new STLLoader().parse(buf);
    const mesh = new THREE.Mesh(geom, new THREE.MeshLambertMaterial({ color: "#b8bec7" }));
    mesh.name = name.replace(/\.[^.]+$/, "");
    return mesh;
  }
  if (ext === "fbx") {
    const { FBXLoader } = await import("three/examples/jsm/loaders/FBXLoader.js");
    return new FBXLoader().parse(buf, "");
  }
  throw new Error(`Unsupported 3D format: ${name}`);
}

/** Flatten custom properties into text values ("a.b": "1"). */
function flatten(obj: unknown, prefix = "", out: Record<string, string> = {}, depth = 0): Record<string, string> {
  if (obj === null || obj === undefined || depth > 3) return out;
  if (typeof obj !== "object") {
    if (prefix) out[prefix] = String(obj);
    return out;
  }
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    if (k === "name") continue;
    flatten(v, prefix ? `${prefix}.${k}` : k, out, depth + 1);
  }
  return out;
}

/** Custom properties of a node and its ancestors (the node's own values win). */
function inherited(o: THREE.Object3D): Record<string, string> {
  const chain: THREE.Object3D[] = [];
  for (let n: THREE.Object3D | null = o; n; n = n.parent) chain.unshift(n);
  return Object.assign({}, ...chain.map((n) => flatten(n.userData)));
}

function named(o: THREE.Object3D): string {
  for (let n: THREE.Object3D | null = o; n; n = n.parent) if (n.name) return n.name;
  return "";
}

export async function loadMeshModel(name: string, bytes: Uint8Array, onProgress?: (msg: string) => void): Promise<LoadedIfc & { scaled: number }> {
  onProgress?.("Reading the model…");
  const root = await parse(name, bytes);
  root.updateMatrixWorld(true);

  // Units: a model many kilometres across is in millimetres or centimetres.
  const whole = new THREE.Box3().setFromObject(root);
  const size = whole.getSize(new THREE.Vector3());
  const big = Math.max(size.x, size.y, size.z);
  const scale = big > 20_000 ? 0.001 : big > 3_000 ? 0.01 : 1;
  // Like IFC: the model sits on the origin, standing on y = 0.
  const center = whole.getCenter(new THREE.Vector3());
  const place = new THREE.Matrix4().makeScale(scale, scale, scale).multiply(new THREE.Matrix4().makeTranslation(-center.x, -whole.min.y, -center.z));

  const objects = new Map<string, THREE.Object3D>();
  const elements = new Map<string, ModelElement>();
  const fmt = name.toLowerCase().split(".").pop()!.toUpperCase();
  let index = 0;
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry) return;
    index++;
    const props = inherited(mesh);
    const idKey = ID_KEYS.find((k) => props[k]);
    // Without an id in the file, the key is the mesh's place in the tree, which stays the same when the same file is loaded again.
    const path: number[] = [];
    for (let n: THREE.Object3D | null = mesh; n && n.parent; n = n.parent) path.unshift(n.parent.children.indexOf(n));
    const id = idKey ? props[idKey] : `${name}#${path.join(".")}`;
    const geom = mesh.geometry.clone();
    geom.applyMatrix4(new THREE.Matrix4().multiplyMatrices(place, mesh.matrixWorld));
    if (!geom.attributes.normal) geom.computeVertexNormals();
    const mats = (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).map((m) => {
      const c = (m as THREE.MeshStandardMaterial).color;
      return new THREE.MeshLambertMaterial({ color: c ? c.clone() : new THREE.Color("#b8bec7"), side: THREE.DoubleSide, map: (m as THREE.MeshStandardMaterial).map ?? null });
    });
    const copy = new THREE.Mesh(geom, mats.length === 1 ? mats[0] : mats);
    let group = objects.get(id) as THREE.Group | undefined;
    if (!group) {
      group = new THREE.Group();
      objects.set(id, group);
      const parent = mesh.parent && mesh.parent !== root ? named(mesh.parent) : "";
      const matName = mats.length === 1 ? (Array.isArray(mesh.material) ? "" : mesh.material.name) : "";
      elements.set(id, {
        id,
        expressId: index,
        ifcType: props.IfcType || props.ifcType || props.Category || props.category || "Mesh",
        name: named(mesh) || `${fmt} mesh ${index}`,
        properties: { ...props, Name: named(mesh), Format: fmt, ...(parent ? { Parent: parent } : {}), ...(matName ? { Material: matName } : {}) },
      });
    }
    group.add(copy);
  });
  if (!elements.size) throw new Error("The file has no meshes.");
  return { elements: [...elements.values()], objects, scaled: scale };
}
