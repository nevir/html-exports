# HTML Exports

Why let JavaScript have all the fun? HTML documents can be modules too!


## The Syntax

### Declaring Exports

Just like ES6 modules, you can choose particular values to export from a HTML document. Simply place an `export` attribute on any element with that you wish to export:

```html
<div export id="user">...</div>
```

You can also declare the default export of the document by tagging an element with `default` (`id` is optional).

```html
<section export default id="post">...</section>
```

If you don't declare a default export, the document is exported.


### Declaring Dependencies

You can also declare dependencies on other modules from HTML.

```html
<import src="Polymer"/>
```

Similar to ES6's `import` syntax, you can import particular values from the module, too. A default export can be imported via:

```html
<import src="jQuery" as="$"/>
```

Named exports can also be imported via the `values` attribute:

```html
<import src="ng/di/annotations" value="Inject"/>
```

_Not supported yet: Some way of aliasing named imports. The technical side is straightforward, but a decent syntax is unclear. Suggestions welcome!_


### Using Imported Values

We also introduce the concept of "scoped" `<script>` elements, that is a close analogue to [the `<module>` element](https://github.com/ModuleLoader/es6-module-loader#module-tag), but for ES5. It gives you the following:

* Any values imported by the document are made available to a scoped script.
* Scoped scripts run in strict mode.
* Scoped scripts execute asynchronously (i.e. once all modules have loaded).

For example:

```html
<import src="jQuery" as="$"/>
<script type="scoped">
$(function() {
  // doing things!
})
</script>
```

That example is equivalent to the ES6 form:

```html
<module>
import $ from 'jQuery'
$(() => {
  // doing things!
})
```


### Importing HTML Modules Via ES6 

Just treat a HTML module as you would any other module:

```
import { user, post } from './templates.html'
```

`user` and `post` are the _elements_ exported by `templates.html`!


## Using It

Include [`html-exports.min.js`](dist/) (~0.8KB gzipped) in your page, after loading [es6-module-loader](https://github.com/ModuleLoader/es6-module-loader):

```html
<script src="es6-module-loader.js"></script>
<script src="html-exports.min.js"></script>
```

This gives you the default behavior where any module with a `.html` extension is treated as a HTML module.


### Compatibility

This library currently supports IE9+ and evergreen browsers.

For browsers that do not support HTML imports (i.e. everything but Chrome), you will need to [polyfill it](https://github.com/webcomponents/webcomponentsjs):

```html
<script src="HTMLImports.min.js"></script>
<script src="html-exports.min.js"></script>
```


### SystemJS

Alternatively, you can use the SystemJS plugin by grabbing [a build](dist/sysjs-plugin) of it, renaming your build to `html.js` and placing that build somewhere on your load path for SystemJS to discover.

You can then load HTML modules via:

```js
// Implicit plugin name
import { user, post } from './templates.html!'
// Or explicit plugin name:
import { user, post } from './templates.html!html'
```


## Playing With It

Try out the demo:

```sh
gulp demo
```


## Hacking On It

Run this in the background for continuous testing/building:

```sh
gulp
```


## Understanding It

For a deeper understanding of how HTML Exports works, take a look at [the annotated source](https://nevir.github.io/html-exports).
