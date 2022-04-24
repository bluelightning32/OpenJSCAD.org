const mat4 = require('../../maths/mat4')
const vec3 = require('../../maths/vec3')

const walnutInit = require('@bluelightning32/walnut')

const PRECISION = -10

console.log('jscad walnut imported')

function init(wasmPath, callback) {
  if (module.exports.walnut !== null) {
    console.log('walnut already initialized')
    callback()
    return
  }
  console.log('walnut init starting')
  function findWasm(file, scriptDirectory) {
    console.log('findWasm', wasmPath)
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

  polyBuffer = w_AllocateFloatVertexArray(4096)
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
  mesh.vertexCount = vertexCount	
  return mesh
}

function toGeom(mesh){
  let triangleCount = module.exports.walnut._GetTriangleCountInMesh(mesh)
  let vertexCount = triangleCount * 3
  let vertexPointer = module.exports.walnut._AllocateFloatVertexArray(vertexCount)
  module.exports.walnut._GetFloatTrianglesFromMesh(mesh, vertexPointer)

  let vertices = new Float32Array(vertexCount * 3)
  vertices.set(module.exports.walnut.HEAPF32.subarray(vertexPointer/4, vertexPointer/4 + vertexCount*3))
  let indices = new Uint16Array(vertexCount * 3)
  for (let i = 0; i < vertexCount; ++i) {
        indices[i] = i
      }
  module.exports.walnut._FreeFloatVertexArray(vertexPointer)
  return {indices, vertices, type: 'mesh'}
}

function intersect(geom1, geom2){
  console.log('intersect', geom1, geom2);
  let time = Date.now()
  let wMesh1 = toWalnut(geom1)
  console.log('Mesh1 transfered to walnut ', Date.now() - time);
  time = Date.now()
  let wMesh2 = toWalnut(geom2)
  console.log('Mesh2 transfered to walnut ', Date.now() - time);

  let wResult = module.exports.walnut._AllocateMesh(wMesh1.vertexCount)

  let filterSuccess = module.exports.walnut._IntersectMeshes(wMesh1, wMesh2, wResult)
  console.log('intersect ', Date.now() - time);
  time = Date.now()

  let result = toGeom(wResult)

  module.exports.walnut._FreeMesh(wMesh1)
  module.exports.walnut._FreeMesh(wMesh2)
  module.exports.walnut._FreeMesh(wResult)

  result.color = geom1.color
  result.transforms = Array(16)
  mat4.identity(result.transforms)
  console.log('filter result', filterSuccess, result)
  console.log('toGeom ', Date.now() - time);
  return result
}

module.exports = {
  init: init,
  walnut: null,
  intersect: intersect
}
