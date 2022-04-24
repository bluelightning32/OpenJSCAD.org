const mat4 = require('../../maths/mat4')
const vec3 = require('../../maths/vec3')

const walnutInit = require('@bluelightning32/walnut')

const initWithPath = async (wasmPath) => {
  if (module.exports.walnut !== null) {
    console.log('walnut already initialized')
    return
  }
  const findWasm = (file, scriptDirectory) => {
    return wasmPath
  }

  const wasmModule = {
    locateFile: findWasm
  }

  module.exports.walnut = await walnutInit(wasmModule)
  console.log('walnut initialized, success=', module.exports.walnut !== null)
}

const init = async () => {
  /* global location */
  await initWithPath(location.origin + '/dist/walnut.wasm')
}

const doublePolygonArrayToGeom = (mesh) => {
  const combinedFields = module.exports.walnut.HEAPU32.subarray(
    mesh / 4, mesh / 4 + 4)
  const polygonCount = combinedFields[0]
  const planes = module.exports.walnut.HEAPF64.subarray(
    combinedFields[1] / 8, combinedFields[1] / 8 + polygonCount * 4)
  const vertexCounts = module.exports.walnut.HEAPU32.subarray(combinedFields[2] / 4, combinedFields[2] / 4 + polygonCount)

  let totalVertexCount = 0
  for (let i = 0; i < polygonCount; ++i) {
    totalVertexCount += vertexCounts[i]
  }

  const vertices = module.exports.walnut.HEAPF64.subarray(combinedFields[3] / 8, combinedFields[3] / 8 + 3 * totalVertexCount)

  const polygons = new Array(polygonCount)
  let vertexIndex = 0
  for (let i = 0; i < polygonCount; ++i) {
    const outputVertices = new Array(vertexCounts[i])
    for (let j = 0; j < vertexCounts[i]; ++j, vertexIndex += 3) {
      outputVertices[j] = [
        vertices[vertexIndex + 0],
        vertices[vertexIndex + 1],
        vertices[vertexIndex + 2]
      ]
    }
    const plane = [
      planes[i * 4 + 0],
      planes[i * 4 + 1],
      planes[i * 4 + 2],
      planes[i * 4 + 3]
    ]
    polygons[i] = {
      vertices: outputVertices,
      plane
    }
  }
  const identity = new Array(16)
  mat4.identity(identity)
  return {
    polygons,
    transforms: identity
  }
}

const allocateDoubleVertexArray = (size) => {
  const pointer = module.exports.walnut._AllocateDoubleVertexArray(size)
  return module.exports.walnut.HEAPF64.subarray(pointer / 8, pointer / 8 + size * 3)
}

const resizeDoubleVertexArray = (buffer, size) => {
  const pointer = module.exports.walnut._ResizeDoubleVertexArray(
    buffer.byteOffset, size)
  return module.exports.walnut.HEAPF64.subarray(pointer / 8, pointer / 8 + size * 3)
}

const addToTreeTransformed = (id, geom, doubleVertexBuffer, precision, flip,
  ratioVertexBuffer, tree) => {
  const { transforms } = geom

  const v = [0, 0, 0]
  geom.polygons.forEach(polygon => {
    if (polygon.vertices.length > doubleVertexBuffer.length) {
      doubleVertexBuffer = resizeDoubleVertexArray(doubleVertexBuffer, polygon.vertices.length * 2)
    }
    let count = 0
    polygon.vertices.forEach(vIn => {
      vec3.transform(v, vIn, transforms)
      doubleVertexBuffer.set(v, count)
      count += 3
    })
    tree = module.exports.walnut._AddDoublePolygonToTree(id, count / 3,
      doubleVertexBuffer.byteOffset, precision, flip, ratioVertexBuffer, tree)
  })

  return [doubleVertexBuffer, tree]
}

const addToTree = (id, geom, doubleVertexBuffer, precision, flip,
  ratioVertexBuffer, tree) => {
  if (geom.transforms && !mat4.isIdentity(geom.transforms)) {
    return addToTreeTransformed(id, geom, doubleVertexBuffer, precision, flip,
      ratioVertexBuffer, tree)
  }

  geom.polygons.forEach(polygon => {
    if (polygon.vertices.length > doubleVertexBuffer.length) {
      doubleVertexBuffer = resizeDoubleVertexArray(
        doubleVertexBuffer, polygon.vertices.length * 2)
    }
    let count = 0
    polygon.vertices.forEach(v => {
      doubleVertexBuffer.set(v, count)
      count += 3
    })
    tree = module.exports.walnut._AddDoublePolygonToTree(id, polygon.vertices.length,
      doubleVertexBuffer.byteOffset, precision, flip, ratioVertexBuffer, tree)
  })

  return [doubleVertexBuffer, tree]
}

const allocateIdArray = (length) => {
  const pointer = module.exports.walnut._AllocateIdArray(length)
  return module.exports.walnut.HEAPU32.subarray(pointer / 4, pointer / 4 + length)
}

const intersectWithPrecision = (precision, ...geometries) => {
  let tree = 0

  const ratioVertexBuffer = module.exports.walnut._AllocateTempVertexBuffer()
  const ids = allocateIdArray(geometries.length)
  let doubleVertexBuffer = allocateDoubleVertexArray(4096)

  for (let i = 0; i < geometries.length; ++i) {
    ids[i] = i;
    [doubleVertexBuffer, tree] = addToTree(i, geometries[i],
      doubleVertexBuffer, precision,
      false, ratioVertexBuffer, tree)
  }

  const mesh = module.exports.walnut._IntersectInTree(tree, ids.byteOffset, geometries.length, 0)
  const result = doublePolygonArrayToGeom(mesh)

  module.exports.walnut._FreeDoublePolygonArray(mesh)
  module.exports.walnut._FreeTree(tree)
  module.exports.walnut._FreeIdArray(ids.byteOffset)
  module.exports.walnut._FreeTempVertexBuffer(ratioVertexBuffer)
  module.exports.walnut._FreeDoubleVertexArray(doubleVertexBuffer.byteOffset)

  return result
}

const intersect = (...geometries) => {
  return intersectWithPrecision(module.exports.defaultPrecision, ...geometries)
}

const unionWithPrecision = (precision, ...geometries) => {
  let tree = 0

  const ratioVertexBuffer = module.exports.walnut._AllocateTempVertexBuffer()
  const ids = allocateIdArray(geometries.length)
  let doubleVertexBuffer = allocateDoubleVertexArray(4096)

  for (let i = 0; i < geometries.length; ++i) {
    ids[i] = i;
    [doubleVertexBuffer, tree] = addToTree(i, geometries[i],
      doubleVertexBuffer, precision,
      false, ratioVertexBuffer, tree)
  }

  const mesh = module.exports.walnut._UnionInTree(tree, ids.byteOffset, geometries.length, 0)
  const result = doublePolygonArrayToGeom(mesh)

  module.exports.walnut._FreeDoublePolygonArray(mesh)
  module.exports.walnut._FreeTree(tree)
  module.exports.walnut._FreeIdArray(ids.byteOffset)
  module.exports.walnut._FreeTempVertexBuffer(ratioVertexBuffer)
  module.exports.walnut._FreeDoubleVertexArray(doubleVertexBuffer.byteOffset)

  return result
}

const union = (...geometries) => {
  return unionWithPrecision(module.exports.defaultPrecision, ...geometries)
}

const subtractWithPrecision = (precision, ...geometries) => {
  let tree = 0

  const ratioVertexBuffer = module.exports.walnut._AllocateTempVertexBuffer()
  const ids = allocateIdArray(geometries.length)
  let doubleVertexBuffer = allocateDoubleVertexArray(4096)

  for (let i = 0; i < geometries.length; ++i) {
    ids[i] = i;
    [doubleVertexBuffer, tree] = addToTree(i, geometries[i],
      doubleVertexBuffer, precision,
      i !== 0, ratioVertexBuffer, tree)
  }

  const mesh = module.exports.walnut._SubtractInTree(tree, ids.byteOffset, geometries.length, 0)
  const result = doublePolygonArrayToGeom(mesh)

  module.exports.walnut._FreeDoublePolygonArray(mesh)
  module.exports.walnut._FreeTree(tree)
  module.exports.walnut._FreeIdArray(ids.byteOffset)
  module.exports.walnut._FreeTempVertexBuffer(ratioVertexBuffer)
  module.exports.walnut._FreeDoubleVertexArray(doubleVertexBuffer.byteOffset)

  return result
}

const subtract = (...geometries) => {
  return subtractWithPrecision(module.exports.defaultPrecision, ...geometries)
}

module.exports = {
  defaultPrecision: -10,
  init,
  intersect,
  intersectWithPrecision,
  subtract,
  subtractWithPrecision,
  union,
  unionWithPrecision,
  walnut: null
}