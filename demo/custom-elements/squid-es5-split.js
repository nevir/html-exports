var squidbits = require('./squidbits.html')

module.exports = Squid

function Squid() {}
Squid.prototype = Object.create(HTMLElement.prototype)

Squid.prototype.attachedCallback = function attachedCallback() {
  this.name = this.tagName.toLowerCase()
  console.debug(this.name, '#attachedCallback')

  var root = this.createShadowRoot()
  // Note that `ink` and `tentacle` are made available to the scoped script
  // because they were exported (as a convenience).
  root.appendChild(this.ownerDocument.importNode(squidbits.ink.content, true))
  for (var i = 0; i < 2; i++) {
    root.appendChild(this.ownerDocument.importNode(squidbits.tentacle.content, true))
  }
}
