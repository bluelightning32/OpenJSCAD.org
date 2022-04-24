const walnut = require('@jscad/modeling').booleans.walnut
const walnutInit = walnut.init

/**
 * evaluate script & rebuild solids, in seperate thread/webworker
 * @param {String} script the script
 * @param {String} fullurl full url of current script
 * @param {Object} parameters the parameters to use with the script
 * @param {Object} callback the callback to call once evaluation is done /failed
 * @param {Object} options the settings to use when rebuilding the solid
 */
const rebuildGeometryWorker = (self) => {
  console.log('Going to init')
  const rebuildGeometry = require('./rebuildGeometry')
  self.onmessage = function (event) {
    console.log('onmessage', walnut.walnut)
    if (event.data instanceof Object) {
      const { data } = event
      if (data.cmd === 'generate') {
        if (walnut.walnut === null) {
          walnutInit(self.location.origin + '/dist/walnut.wasm', () => {
            console.log('walnut initialized callback', walnut.walnut != null)
            rebuildGeometry(data, (err, message) => self.postMessage(message))
          })
        } else {
          rebuildGeometry(data, (err, message) => self.postMessage(message))
        }
      }
    }
  }
}

module.exports = rebuildGeometryWorker
