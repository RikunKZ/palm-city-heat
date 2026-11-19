// Palm City Heat — mergeBoxes: fold many axis-aligned boxes into ONE
// BufferGeometry with vertex colours, so a whole street of buildings, a
// whole car, or a figure's torso costs a single draw call. Each part is
// { w, h, d, x, y, z, color } (y is the box centre); a part may name a
// topColor for its up/down faces (roofs read darker than walls).

import * as THREE from 'three';

export function mergeBoxes(parts) {
  const positions = [];
  const normals = [];
  const uvs = [];
  const colors = [];
  const indices = [];
  const box = new THREE.BoxGeometry(1, 1, 1);
  const posAttr = box.getAttribute('position');
  const normAttr = box.getAttribute('normal');
  const uvAttr = box.getAttribute('uv');
  const index = box.getIndex().array;
  const c = new THREE.Color();
  const top = new THREE.Color();

  for (const part of parts) {
    const base = positions.length / 3;
    c.setHex(part.color);
    top.setHex(part.topColor ?? part.color);
    for (let i = 0; i < posAttr.count; i++) {
      positions.push(
        posAttr.getX(i) * part.w + part.x,
        posAttr.getY(i) * part.h + part.y,
        posAttr.getZ(i) * part.d + part.z,
      );
      normals.push(normAttr.getX(i), normAttr.getY(i), normAttr.getZ(i));
      uvs.push(uvAttr.getX(i), uvAttr.getY(i));
      // BoxGeometry lays out faces +x,-x,+y,-y,+z,-z, four verts each:
      // verts 8..15 are the up/down faces and take the top colour.
      const col = i >= 8 && i < 16 ? top : c;
      colors.push(col.r, col.g, col.b);
    }
    for (let i = 0; i < index.length; i++) indices.push(index[i] + base);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.setIndex(indices);
  return geo;
}

/** One shared material for every merged-box mesh that needs no texture. */
export const plainBoxMaterial = new THREE.MeshLambertMaterial({ vertexColors: true });
