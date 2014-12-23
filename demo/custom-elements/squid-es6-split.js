import { tentacle, ink } from './squidbits.html'

export default class Squid extends HTMLElement {
  attachedCallback() {
    this.name = this.tagName.toLowerCase()
    console.debug(this.name, '#attachedCallback')

    var root = this.createShadowRoot()
    // Note that `ink` and `tentacle` are made available to the scoped script
    // because they were exported (as a convenience).
    root.appendChild(this.ownerDocument.importNode(ink.content, true))
    for (var i = 0; i < 2; i++) {
      root.appendChild(this.ownerDocument.importNode(tentacle.content, true))
    }
  }
}
