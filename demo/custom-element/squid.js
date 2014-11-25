import { tentacle, ink } from './squidbits.html'

export class Squid extends HTMLElement {
  attachedCallback() {
    this.name         = this.tagName.toLowerCase()
    this.numTentacles = parseInt(this.getAttribute('tentacles') || 2)
    console.debug(this.name, '#attachedCallback')

    var root = this.createShadowRoot()

    var mantle = this.ownerDocument.createElement('div')
    mantle.textContent = '<' + this.name + '>'
    root.appendChild(mantle)

    root.appendChild(this.ownerDocument.importNode(ink.content, true))
    for (var i = 0; i < this.numTentacles; i++) {
      root.appendChild(this.ownerDocument.importNode(tentacle.content, true))
    }
  }
}
