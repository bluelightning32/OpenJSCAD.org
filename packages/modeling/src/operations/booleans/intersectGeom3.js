const flatten = require('../../utils/flatten')

const retessellate = require('../modifiers/retessellate')

const intersectSub = require('./intersectGeom3Sub')

const walnut = require('./walnut')

/*
 * Return a new 3D geometry representing space in both the first geometry and
 * in the subsequent geometries. None of the given geometries are modified.
 * @param {...geom3} geometries - list of 3D geometries
 * @returns {geom3} new 3D geometry
 */
const intersect = (...geometries) => {
  geometries = flatten(geometries)
  if (walnut.walnut !== null) {
    fromWalnut = walnut.intersect(geometries[0], geometries[1])
    return fromWalnut
  }

  let newgeometry = geometries.shift()
  geometries.forEach((geometry) => {
    newgeometry = intersectSub(newgeometry, geometry)
  })

  newgeometry = retessellate(newgeometry)
  return newgeometry
}

module.exports = intersect
