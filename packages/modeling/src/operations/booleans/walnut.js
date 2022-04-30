const mat4 = require('../../maths/mat4')
const vec3 = require('../../maths/vec3')

const walnutInit = require('@bluelightning32/walnut')

const PRECISION = -10

function init(wasmPath, callback) {
  if (module.exports.walnut !== null) {
    console.log('walnut already initialized')
    callback()
    return
  }
  console.log('walnut initializing')
  function findWasm(file, scriptDirectory) {
    return wasmPath
  }

  const wasmModule = {
    'locateFile': findWasm
  }

  walnutInit(wasmModule).then(function (Module) {
    module.exports.walnut = Module
    console.log('walnut initialized', Module != null)
    callback()
  })
}


function w_AllocateFloatVertexArray(vertexCount){
  let vertexPointer = module.exports.walnut._AllocateFloatVertexArray(/*max_vertices=*/vertexCount)
  let vertices = module.exports.walnut.HEAPF32.subarray(vertexPointer/4, vertexPointer/4 + vertexCount*3)
  vertices.vertexPointer = vertexPointer
  vertices.vertexCount = vertexCount
  vertices.free = ()=> module.exports.walnut._FreeFloatVertexArray(vertexPointer)
  return vertices
}

function toWalnut(obj){
  if(obj.transforms && !mat4.isIdentity(obj.transforms)) return toWalnutTransformed(obj)
  let vertexCount = 0
  obj.polygons.forEach(p=>vertexCount += p.length)
  let mesh = module.exports.walnut._AllocateMesh(vertexCount)

  const polyBuffer = w_AllocateFloatVertexArray(4096)
  tmpBuffer = module.exports.walnut._AllocateTempVertexBuffer()

  obj.polygons.forEach(p=>{
    if(p.vertices) p = p.vertices // jscad format
    let count = 0
    p.forEach(v=>{
      polyBuffer.set(v, count)// count is also offset
      count += 3
    })
    module.exports.walnut._AddFloatPolygonToMesh(count/3, polyBuffer.vertexPointer, tmpBuffer, mesh, PRECISION)
  })

  module.exports.walnut._FreeTempVertexBuffer(tmpBuffer)
  polyBuffer.free()

  mesh.vertexCount = vertexCount
  return mesh
}

// apply transform during conversion to walnut internal model
function toWalnutTransformed(obj){
  let { transforms } = obj
  let vertexCount = 0
  obj.polygons.forEach(p=>vertexCount += p.length)
  let mesh = module.exports.walnut._AllocateMesh(vertexCount)

  const polyBuffer = w_AllocateFloatVertexArray(4096)
  tmpBuffer = module.exports.walnut._AllocateTempVertexBuffer()

  let v = [0,0,0]
  obj.polygons.forEach(p=>{
    if(p.vertices) p = p.vertices // jscad format
    let count = 0
    p.forEach(vIn=>{
      vec3.transform(v,vIn,transforms)
      polyBuffer.set(v, count)// count is also offset
      count += 3
    })
    module.exports.walnut._AddFloatPolygonToMesh(count/3, polyBuffer.vertexPointer, tmpBuffer, mesh, PRECISION)
  })

  module.exports.walnut._FreeTempVertexBuffer(tmpBuffer)
  polyBuffer.free()

  mesh.vertexCount = vertexCount	
  return mesh
}

const doublePolygonArrayToGeom = (mesh) => {
  const combinedFields = module.exports.walnut.HEAPU32.subarray(mesh/4, mesh/4 + 4)
  const polygonCount = combinedFields[0]
  const planes = module.exports.walnut.HEAPF64.subarray(combinedFields[1]/8, combinedFields[1]/8 + polygonCount*4)
  const vertexCounts = module.exports.walnut.HEAPU32.subarray(combinedFields[2]/4, combinedFields[2]/4 + polygonCount)

  let totalVertexCount = 0
  for (let i = 0; i < polygonCount; ++i) {
    totalVertexCount += vertexCounts[i]
  }

  const vertices = module.exports.walnut.HEAPF64.subarray(combinedFields[3]/8, combinedFields[3]/8 + 3*totalVertexCount)

  const polygons = new Array(polygonCount)
  let vertexIndex = 0
  for (let i = 0; i < polygonCount; ++i) {
    const outputVertices = new Array(vertexCounts[i])
    for (let j = 0; j < vertexCounts[i]; ++j, vertexIndex += 3) {
      outputVertices[j] = [
        vertices[vertexIndex + 0],
        vertices[vertexIndex + 1],
        vertices[vertexIndex + 2],
      ]
    }
    const plane = [
      planes[i*4 + 0],
      planes[i*4 + 1],
      planes[i*4 + 2],
      planes[i*4 + 3]
    ]
    polygons[i] = {
      vertices: outputVertices,
      plane: plane
    }
  }
  identity = new Array(16)
  mat4.identity(identity)
  return {
    polygons: polygons,
    transforms: identity
  }
}

const allocateDoubleVertexArray = (size) => {
  const pointer = module.exports.walnut._AllocateDoubleVertexArray(size)
  return module.exports.walnut.HEAPF64.subarray(pointer/8, pointer/8 + size*3)
}

const resizeDoubleVertexArray = (buffer, size) => {
  const pointer = module.exports.walnut._ResizeDoubleVertexArray(
    doubleVertexBuffer.byteOffset, size)
  return module.exports.walnut.HEAPF64.subarray(pointer/8, pointer/8 + size*3)
}

const addToTreeTransformed = (id, geom, doubleVertexBuffer, ratioVertexBuffer, tree) => {
  let { transforms } = geom

  let v = [0, 0, 0]
  geom.polygons.forEach(polygon=>{
    if (polygon.vertices.length > doubleVertexBuffer.length) {
      doubleVertexBuffer = resizeDoubleVertexArray(doubleVertexBuffer, polygon.vertices.length * 2);
    }
    let count = 0
    polygon.vertices.forEach(vIn=>{
      vec3.transform(v, vIn, transforms)
      doubleVertexBuffer.set(v, count)
      count += 3
    })
    tree = module.exports.walnut._AddDoublePolygonToTree(id, count/3,
      doubleVertexBuffer.byteOffset, PRECISION, ratioVertexBuffer, tree)
  })

  return [doubleVertexBuffer, tree]
}

const addToTree = (id, geom, doubleVertexBuffer, ratioVertexBuffer, tree) => {
  if (geom.transforms && !mat4.isIdentity(geom.transforms)) {
    return addToTreeTransformed(id, geom, doubleVertexBuffer, ratioVertexBuffer, tree)
  }

  console.log(geom)
  geom.polygons.forEach(polygon=>{
    if (polygon.vertices.length > doubleVertexBuffer.length) {
      doubleVertexBuffer = resizeDoubleVertexArray(
        doubleVertexBuffer, polygon.vertices.length * 2);
    }
    let count = 0
    polygon.vertices.forEach(v=>{
      doubleVertexBuffer.set(v, count)
      count += 3
    })
    tree = module.exports.walnut._AddDoublePolygonToTree(id, polygon.vertices.length,
      doubleVertexBuffer.byteOffset, PRECISION, ratioVertexBuffer, tree)
  })

  return [doubleVertexBuffer, tree]
}

const intersect = (...geometries) => {
  let tree = 0

  const ratioVertexBuffer = module.exports.walnut._AllocateTempVertexBuffer()

  const idsPointer = module.exports.walnut._AllocateIdArray(geometries.length)
  const ids = module.exports.walnut.HEAPU32.subarray(idsPointer/4, idsPointer/4 + geometries.length)

  doubleVertexBuffer = allocateDoubleVertexArray(4096)

  for (let i = 0; i < geometries.length; ++i) {
    ids[i] = i;
    [doubleVertexBuffer, tree] = addToTree(i, geometries[i], doubleVertexBuffer, ratioVertexBuffer, tree)
  }

  const mesh = module.exports.walnut._IntersectInTree(tree, idsPointer, geometries.length, 0)
  const result = doublePolygonArrayToGeom(mesh)

  module.exports.walnut._FreeDoublePolygonArray(mesh)
  module.exports.walnut._FreeTree(tree)
  module.exports.walnut._FreeIdArray(idsPointer)
  module.exports.walnut._FreeTempVertexBuffer(ratioVertexBuffer)
  module.exports.walnut._FreeDoubleVertexArray(doubleVertexBuffer.byteOffset)

  return result
}

module.exports = {
  init: init,
  walnut: null,
  intersect: intersect
}
